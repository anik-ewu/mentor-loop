import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { app, loginAs, resetDb } from './helpers';

beforeEach(resetDb);

const DAY = 86_400_000;
const sameDay = (a: string | Date, b: Date) =>
  Math.abs(new Date(a).getTime() - b.getTime()) < 60_000;

async function addJob(
  agent: Awaited<ReturnType<typeof loginAs>>['agent'],
  body: Record<string, unknown> = {},
) {
  const res = await agent
    .post('/api/jobs')
    .send({ company: 'Acme', title: 'Engineer', ...body })
    .expect(201);
  return res.body.job;
}

describe('jobs', () => {
  it('requires login', async () => {
    await request(app).get('/api/jobs').expect(401);
    await request(app).post('/api/jobs').send({ company: 'A', title: 'B' }).expect(401);
  });

  it('creates, lists, updates and deletes own jobs; list leaves out large fields', async () => {
    const { agent } = await loginAs();
    const job = await addJob(agent, { jobDescription: 'Long text', jobUrl: '' });
    expect(job).toMatchObject({ status: 'wishlist', priority: 2, jobUrl: null, appliedAt: null });

    const list = await agent.get('/api/jobs').expect(200);
    expect(list.body.jobs).toHaveLength(1);
    expect(list.body.jobs[0]).not.toHaveProperty('jobDescription');
    expect(list.body.jobs[0]).not.toHaveProperty('coverLetter');

    const updated = await agent
      .patch(`/api/jobs/${job.id}`)
      .send({ notes: 'Call Sam', location: '' })
      .expect(200);
    expect(updated.body.job).toMatchObject({
      notes: 'Call Sam',
      location: null,
      title: 'Engineer',
    });

    await agent.delete(`/api/jobs/${job.id}`).expect(204);
    await agent.get(`/api/jobs/${job.id}`).expect(404);
  });

  it('validates fields, including salary min above max', async () => {
    const { agent } = await loginAs();
    const res = await agent
      .post('/api/jobs')
      .send({ company: 'Acme', title: 'Dev', salaryMin: 100, salaryMax: 50 })
      .expect(400);
    expect(res.body.error.fields).toHaveProperty('salaryMax');
    await agent.post('/api/jobs').send({ title: 'Dev' }).expect(400);

    // On edit the check uses the stored value when only one side is sent.
    const job = await addJob(agent, { salaryMin: 100 });
    const edit = await agent.patch(`/api/jobs/${job.id}`).send({ salaryMax: 50 }).expect(400);
    expect(edit.body.error.fields).toHaveProperty('salaryMax');
    await agent.patch(`/api/jobs/${job.id}`).send({ salaryMin: '', salaryMax: 50 }).expect(200);
    await agent
      .post('/api/jobs')
      .send({ company: 'A', title: 'B', jobUrl: 'not a link' })
      .expect(400);
  });

  it("hides another user's jobs and events (404)", async () => {
    const a = await loginAs('user', 'a@test.dev');
    const b = await loginAs('user', 'b@test.dev');
    const job = await addJob(a.agent);
    const { body } = await a.agent
      .post(`/api/jobs/${job.id}/events`)
      .send({ type: 'note', notes: 'hi' })
      .expect(201);

    await b.agent.get(`/api/jobs/${job.id}`).expect(404);
    await b.agent.patch(`/api/jobs/${job.id}`).send({ notes: 'x' }).expect(404);
    await b.agent.patch(`/api/jobs/${job.id}/move`).send({ status: 'applied' }).expect(404);
    await b.agent.delete(`/api/jobs/${job.id}`).expect(404);
    await b.agent.post(`/api/jobs/${job.id}/events`).send({ type: 'note' }).expect(404);
    await b.agent.delete(`/api/jobs/${job.id}/events/${body.event.id}`).expect(404);
    expect((await b.agent.get('/api/jobs').expect(200)).body.jobs).toHaveLength(0);
  });

  it('moving wishlist → applied sets appliedAt, follow-up in 7 days and writes an event', async () => {
    const { agent } = await loginAs();
    const job = await addJob(agent);
    const now = new Date();

    const moved = await agent
      .patch(`/api/jobs/${job.id}/move`)
      .send({ status: 'applied', position: 3 })
      .expect(200);
    expect(sameDay(moved.body.job.appliedAt, now)).toBe(true);
    expect(sameDay(moved.body.job.followUpAt, new Date(now.getTime() + 7 * DAY))).toBe(true);
    expect(moved.body.job.position).toBe(3);

    const detail = await agent.get(`/api/jobs/${job.id}`).expect(200);
    expect(detail.body.job.events).toMatchObject([
      { type: 'status_change', fromStatus: 'wishlist', toStatus: 'applied' },
    ]);

    // appliedAt is only set the first time; a final status clears the follow-up.
    const rejected = await agent
      .patch(`/api/jobs/${job.id}`)
      .send({ status: 'rejected' })
      .expect(200);
    expect(rejected.body.job.appliedAt).toBe(moved.body.job.appliedAt);
    expect(rejected.body.job.followUpAt).toBeNull();
    expect(await prisma.jobEvent.count({ where: { jobId: job.id } })).toBe(2);
  });

  it('withdrawing from the wishlist does not set appliedAt', async () => {
    const { agent } = await loginAs();
    const job = await addJob(agent);
    const res = await agent
      .patch(`/api/jobs/${job.id}/move`)
      .send({ status: 'withdrawn' })
      .expect(200);
    expect(res.body.job.appliedAt).toBeNull();
  });

  it('an interview round moves an applied job to interviewing', async () => {
    const { agent } = await loginAs();
    const job = await addJob(agent, { status: 'applied' });
    const scheduledAt = new Date(Date.now() + 2 * DAY).toISOString();

    const { body } = await agent
      .post(`/api/jobs/${job.id}/events`)
      .send({ type: 'interview', title: 'Tech screen', scheduledAt })
      .expect(201);
    expect(body.event).toMatchObject({ type: 'interview', outcome: 'pending' });

    const detail = await agent.get(`/api/jobs/${job.id}`).expect(200);
    expect(detail.body.job.status).toBe('interviewing');
    expect(detail.body.job.events.map((e: { type: string }) => e.type).sort()).toEqual([
      'interview',
      'status_change',
      'status_change',
    ]);

    const list = await agent.get('/api/jobs').expect(200);
    expect(list.body.jobs[0].nextInterviewAt).toBe(scheduledAt);

    await agent
      .patch(`/api/jobs/${job.id}/events/${body.event.id}`)
      .send({ outcome: 'passed' })
      .expect(200);
    await agent.delete(`/api/jobs/${job.id}/events/${body.event.id}`).expect(204);
  });

  it('a follow-up clears it from "due" and pushes the next one 7 days out', async () => {
    const { agent } = await loginAs();
    const job = await addJob(agent, {
      status: 'applied',
      followUpAt: new Date(Date.now() - DAY).toISOString(),
    });

    let stats = await agent.get('/api/jobs/stats').expect(200);
    expect(stats.body.followUpsDue).toMatchObject([{ id: job.id }]);

    await agent.post(`/api/jobs/${job.id}/events`).send({ type: 'follow_up' }).expect(201);
    stats = await agent.get('/api/jobs/stats').expect(200);
    expect(stats.body.followUpsDue).toHaveLength(0);

    const detail = await agent.get(`/api/jobs/${job.id}`).expect(200);
    expect(sameDay(detail.body.job.followUpAt, new Date(Date.now() + 7 * DAY))).toBe(true);
  });

  it('searches, filters and sorts', async () => {
    const { agent } = await loginAs();
    await addJob(agent, { company: 'Zeta', title: 'Backend dev', priority: 1 });
    await addJob(agent, { company: 'Alpha', title: 'Frontend dev', priority: 3 });
    await addJob(agent, { company: 'Mid', title: 'QA', status: 'applied' });

    const names = async (qs: string) =>
      (await agent.get(`/api/jobs?${qs}`).expect(200)).body.jobs.map(
        (j: { company: string }) => j.company,
      );

    expect(await names('q=front')).toEqual(['Alpha']);
    expect(await names('status=applied')).toEqual(['Mid']);
    expect(await names('sort=company')).toEqual(['Alpha', 'Mid', 'Zeta']);
    expect((await names('sort=priority'))[0]).toBe('Alpha');
    expect(await names('status=bogus&sort=bogus')).toHaveLength(3);
  });

  it('computes stats; rates are 0 with nothing applied', async () => {
    const { agent } = await loginAs();
    const empty = await agent.get('/api/jobs/stats').expect(200);
    expect(empty.body).toMatchObject({ applied: 0, responseRate: 0, interviewRate: 0, offers: 0 });

    await addJob(agent); // wishlist: not applied
    await addJob(agent, { status: 'applied' });
    const interviewed = await addJob(agent, { status: 'applied' });
    await agent.patch(`/api/jobs/${interviewed.id}/move`).send({ status: 'interviewing' });
    await agent.patch(`/api/jobs/${interviewed.id}/move`).send({ status: 'rejected' });
    const offer = await addJob(agent, { status: 'applied' });
    await agent.patch(`/api/jobs/${offer.id}/move`).send({ status: 'offer' });
    await agent.post(`/api/jobs/${offer.id}/events`).send({
      type: 'interview',
      title: 'Final',
      scheduledAt: new Date(Date.now() + DAY).toISOString(),
    });

    const { body } = await agent.get('/api/jobs/stats').expect(200);
    expect(body).toMatchObject({
      total: 4,
      applied: 3,
      appliedLast7Days: 3,
      responseRate: 67, // rejected-after-interview + offer
      interviews: 2, // the rejected one reached interviewing; an offer counts as later
      interviewRate: 67,
      offers: 1,
      byStatus: { wishlist: 1, applied: 1, rejected: 1, offer: 1 },
    });
    expect(body.upcomingInterviews).toMatchObject([{ title: 'Final', job: { company: 'Acme' } }]);
  });
});
