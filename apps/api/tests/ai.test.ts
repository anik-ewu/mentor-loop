import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { settleRuns } from '../src/modules/ai/ai.runner';
import { AiFailure, aiEnabled, callStructured } from '../src/modules/ai/claude';
import { app, createService, createSlot, loginAs, resetDb } from './helpers';
import request from 'supertest';

vi.mock('../src/modules/ai/claude', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/modules/ai/claude')>();
  return { ...real, aiEnabled: vi.fn(() => true), callStructured: vi.fn() };
});

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

const review = (overrides: Record<string, unknown> = {}) => ({
  overallScore: 140, // out of range on purpose: must be clamped
  atsScore: 80,
  summary: 'Solid backend profile.',
  seniority: 'mid',
  sections: [{ name: 'Experience', score: -5, feedback: 'Add numbers' }],
  strengths: ['Clear structure'],
  improvements: [{ priority: 'high', issue: 'No metrics', fix: 'Quantify impact' }],
  bulletRewrites: [
    { original: 'Worked on API', improved: 'Built an API serving 1M req/day', why: 'Impact' },
  ],
  missingKeywords: ['Kubernetes'],
  redFlags: [],
  jobMatch: null,
  profile: {
    headline: 'Backend dev',
    skills: ['Node'],
    experience: [],
    projects: [],
    education: [],
  },
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
  vi.mocked(aiEnabled).mockReturnValue(true);
  vi.mocked(callStructured).mockReset();
});

/** Posts a review, waits for the background run, returns the finished row. */
async function runReview(agent: Awaited<ReturnType<typeof loginAs>>['agent'], body: object) {
  const res = await agent.post('/api/ai/reviews').send(body).expect(202);
  expect(res.body.run.status).toBe('processing');
  await settleRuns();
  return (await agent.get(`/api/ai/runs/${res.body.run.id}`).expect(200)).body.run;
}

describe('AI resume review', () => {
  it('returns 202 at once, then finishes with a clamped result', async () => {
    vi.mocked(callStructured).mockResolvedValue(review());
    const { agent } = await loginAs();

    const run = await runReview(agent, { text: 'My resume text' });
    expect(run).toMatchObject({ status: 'done', kind: 'resume_review', score: 100 });
    expect(run.result.overallScore).toBe(100);
    expect(run.result.sections[0].score).toBe(0);
    expect(run.input).toMatchObject({ source: 'text', text: 'My resume text' });
  });

  it('matches against a saved job and scores the match', async () => {
    vi.mocked(callStructured).mockResolvedValue(
      review({
        jobMatch: {
          score: 72,
          matchedSkills: ['Node'],
          missingSkills: ['Go'],
          verdict: 'Tailor first',
        },
      }),
    );
    const { agent } = await loginAs();
    const { body } = await agent
      .post('/api/jobs')
      .send({ company: 'Acme', title: 'Backend Engineer', jobDescription: 'Node and Go' })
      .expect(201);

    const run = await runReview(agent, { text: 'resume', jobId: body.job.id });
    expect(run).toMatchObject({ status: 'done', score: 72, jobId: body.job.id });

    // The prompt carried the job as labelled, untrusted data.
    const call = vi.mocked(callStructured).mock.calls[0]![0];
    expect(JSON.stringify(call.content)).toContain('<target_job>');
    expect(call.system).toContain('untrusted');

    const job = await agent.get(`/api/jobs/${body.job.id}`).expect(200);
    expect(job.body.job.aiRuns).toMatchObject([{ id: run.id, score: 72 }]);
  });

  it('sends an uploaded PDF as a document block and never stores it', async () => {
    vi.mocked(callStructured).mockResolvedValue(review());
    const { agent } = await loginAs();
    const res = await agent
      .post('/api/ai/reviews')
      .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' })
      .field('targetRole', 'Data analyst')
      .expect(202);
    await settleRuns();

    const content = vi.mocked(callStructured).mock.calls[0]![0].content;
    expect(content[0]).toMatchObject({
      type: 'document',
      source: { media_type: 'application/pdf' },
    });
    const stored = await prisma.aiRun.findUniqueOrThrow({ where: { id: res.body.run.id } });
    expect(stored.input).toMatchObject({ source: 'pdf', fileName: 'cv.pdf', text: null });
    expect(JSON.stringify(stored.input)).not.toContain(PDF.toString('base64'));
  });

  it('rejects files that are not PDFs or are too large, and needs exactly one input', async () => {
    const { agent } = await loginAs();
    await agent
      .post('/api/ai/reviews')
      .attach('resume', Buffer.from('PK\u0003\u0004 docx'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await agent
      .post('/api/ai/reviews')
      .attach('resume', Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await agent.post('/api/ai/reviews').send({}).expect(400);
    await agent
      .post('/api/ai/reviews')
      .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' })
      .field('text', 'also text')
      .expect(400);
    await agent
      .post('/api/ai/reviews')
      .send({ text: 'x'.repeat(30_001) })
      .expect(400);
    expect(callStructured).not.toHaveBeenCalled();
  });

  it('marks the run failed with a safe message on a refusal or error', async () => {
    vi.mocked(callStructured).mockRejectedValueOnce(new AiFailure("The AI couldn't process this."));
    const { agent } = await loginAs();
    const refused = await runReview(agent, { text: 'resume' });
    expect(refused).toMatchObject({ status: 'failed', error: "The AI couldn't process this." });

    vi.mocked(callStructured).mockRejectedValueOnce(new Error('socket hang up: secret details'));
    const crashed = await runReview(agent, { text: 'resume' });
    expect(crashed.status).toBe('failed');
    expect(crashed.error).not.toContain('secret');
  });

  it('enforces the daily quota (429) but not for the mentor', async () => {
    vi.mocked(callStructured).mockResolvedValue(review());
    const { agent, user } = await loginAs();
    await prisma.aiRun.createMany({
      data: Array.from({ length: 10 }, () => ({
        userId: user.id,
        kind: 'resume_review' as const,
        status: 'done' as const,
        input: {},
        model: 'test',
      })),
    });
    const res = await agent.post('/api/ai/reviews').send({ text: 'resume' }).expect(429);
    expect(res.body.error.message).toMatch(/today's AI limit/);

    const admin = await loginAs('admin');
    await admin.agent.post('/api/ai/reviews').send({ text: 'resume' }).expect(202);
    await settleRuns();
  });

  it('returns 503 and reports aiEnabled=false with no API key', async () => {
    vi.mocked(aiEnabled).mockReturnValue(false);
    const { agent } = await loginAs();
    await agent.post('/api/ai/reviews').send({ text: 'resume' }).expect(503);
    const config = await request(app).get('/api/auth/config').expect(200);
    expect(config.body.aiEnabled).toBe(false);
  });

  it("keeps runs private and won't use another user's job", async () => {
    vi.mocked(callStructured).mockResolvedValue(review());
    const a = await loginAs('user', 'a@test.dev');
    const b = await loginAs('user', 'b@test.dev');
    const run = await runReview(a.agent, { text: 'resume' });
    const { body } = await a.agent.post('/api/jobs').send({ company: 'A', title: 'B' }).expect(201);

    await b.agent.get(`/api/ai/runs/${run.id}`).expect(404);
    await b.agent.delete(`/api/ai/runs/${run.id}`).expect(404);
    expect((await b.agent.get('/api/ai/runs').expect(200)).body.runs).toHaveLength(0);
    await b.agent.post('/api/ai/reviews').send({ text: 'resume', jobId: body.job.id }).expect(400);

    await a.agent.delete(`/api/ai/runs/${run.id}`).expect(204);
    await a.agent.get(`/api/ai/runs/${run.id}`).expect(404);
  });
});

describe('booking with an AI review', () => {
  it("attaches the user's own finished review and shows it to the mentor", async () => {
    vi.mocked(callStructured).mockResolvedValue(review({ overallScore: 72 }));
    const [service, slot, slot2] = await Promise.all([
      createService(),
      createSlot(),
      createSlot(30),
    ]);
    const user = await loginAs('user', 'u@test.dev');
    const other = await loginAs('user', 'o@test.dev');
    const run = await runReview(user.agent, { text: 'resume' });

    await other.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id, resumeReviewId: run.id })
      .expect(400);
    const { body } = await user.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id, resumeReviewId: run.id })
      .expect(201);
    expect(body.booking.resumeReview).toEqual({
      id: run.id,
      score: 72,
      summary: 'Solid backend profile.',
      targetRole: null,
    });

    const admin = await loginAs('admin');
    const list = await admin.agent.get('/api/bookings').expect(200);
    expect(list.body.bookings[0].resumeReview).toMatchObject({ score: 72 });
    expect(list.body.bookings[0].resumeReview).not.toHaveProperty('result');

    // A failed review cannot be attached.
    vi.mocked(callStructured).mockRejectedValueOnce(new AiFailure('nope'));
    const failed = await runReview(user.agent, { text: 'resume' });
    await user.agent
      .post('/api/bookings')
      .send({ slotId: slot2.id, serviceId: service.id, resumeReviewId: failed.id })
      .expect(400);
  });
});

describe('interview questions and cover letters', () => {
  const questions = {
    rounds: [
      {
        category: 'technical',
        questions: [
          {
            question: 'How did you build Trackly offline sync?',
            whyAsked: 'Depth',
            answerPoints: ['IndexedDB'],
            difficulty: 'medium',
            fromResume: true,
          },
        ],
      },
    ],
    questionsToAsk: ['What does success look like in 90 days?'],
  };
  const letter = {
    subject: 'Frontend Engineer application',
    greeting: 'Dear Hiring Team,',
    paragraphs: ['One', 'Two'],
    closing: 'Best regards,\nSam',
    highlightsUsed: ['Node'],
  };

  async function setup() {
    vi.mocked(callStructured).mockResolvedValueOnce(review());
    const { agent } = await loginAs('user', 'me@test.dev');
    const { body } = await agent
      .post('/api/jobs')
      .send({ company: 'Acme', title: 'Frontend Engineer', jobDescription: 'React' })
      .expect(201);
    const reviewRun = await runReview(agent, { text: 'resume' });
    return { agent, jobId: body.job.id as string, reviewId: reviewRun.id as string };
  }

  it('generates questions from the job and the review profile', async () => {
    const { agent, jobId, reviewId } = await setup();
    vi.mocked(callStructured).mockResolvedValueOnce(questions);

    const res = await agent
      .post('/api/ai/interview-questions')
      .send({ jobId, reviewId })
      .expect(202);
    await settleRuns();
    const run = (await agent.get(`/api/ai/runs/${res.body.run.id}`).expect(200)).body.run;
    expect(run).toMatchObject({
      status: 'done',
      kind: 'interview_questions',
      jobId,
      sourceRunId: reviewId,
    });
    expect(run.result.rounds[0].questions[0].fromResume).toBe(true);

    const prompt = JSON.stringify(vi.mocked(callStructured).mock.calls.at(-1)![0].content);
    expect(prompt).toContain('<job_posting>');
    expect(prompt).toContain('<candidate_profile>');

    // The review is optional.
    vi.mocked(callStructured).mockResolvedValueOnce(questions);
    await agent.post('/api/ai/interview-questions').send({ jobId }).expect(202);
    await settleRuns();
  });

  it("drafts a cover letter only from the user's own finished review", async () => {
    const { agent, jobId, reviewId } = await setup();

    await agent.post('/api/ai/cover-letters').send({ jobId }).expect(400);
    const other = await loginAs('user', 'other@test.dev');
    const { body: otherJob } = await other.agent
      .post('/api/jobs')
      .send({ company: 'B', title: 'C' })
      .expect(201);
    await other.agent
      .post('/api/ai/cover-letters')
      .send({ jobId: otherJob.job.id, reviewId })
      .expect(400);

    vi.mocked(callStructured).mockResolvedValueOnce(letter);
    const res = await agent
      .post('/api/ai/cover-letters')
      .send({ jobId, reviewId, tone: 'friendly', length: 'short' })
      .expect(202);
    await settleRuns();
    const run = (await agent.get(`/api/ai/runs/${res.body.run.id}`).expect(200)).body.run;
    expect(run).toMatchObject({ status: 'done', input: { tone: 'friendly', length: 'short' } });
    expect(JSON.stringify(vi.mocked(callStructured).mock.calls.at(-1)![0].content)).toContain(
      'Tone: friendly. Length: short.',
    );

    // A failed or non-review run is not a valid source.
    vi.mocked(callStructured).mockRejectedValueOnce(new AiFailure('nope'));
    const failed = await runReview(agent, { text: 'resume' });
    await agent.post('/api/ai/cover-letters').send({ jobId, reviewId: failed.id }).expect(400);
    await agent.post('/api/ai/cover-letters').send({ jobId, reviewId: run.id }).expect(400);

    // Saving the edited letter to the job.
    await agent.patch(`/api/jobs/${jobId}`).send({ coverLetter: 'My edited letter' }).expect(200);
    expect((await agent.get(`/api/jobs/${jobId}`)).body.job.coverLetter).toBe('My edited letter');
  });
});
