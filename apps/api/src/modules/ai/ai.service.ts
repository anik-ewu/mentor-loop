import type Anthropic from '@anthropic-ai/sdk';
import type { AiKind, Role } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { startRun } from './ai.runner';
import {
  coverLetterOutputSchema,
  interviewOutputSchema,
  reviewOutputSchema,
  type CoverLetterRequest,
  type InterviewRequest,
  type Profile,
  type ReviewOutput,
  type ReviewRequest,
} from './ai.schema';
import { UNTRUSTED_DATA_RULE, asData, callStructured, clampScore } from './claude';

interface Actor {
  id: string;
  role: Role;
}

export interface PdfUpload {
  buffer: Buffer;
  originalname: string;
}

/** Loads one of the user's jobs, or 400 (it's an input, not the resource being read). */
async function ownJob(userId: string, jobId: string) {
  const job = await prisma.jobApplication.findFirst({ where: { id: jobId, userId } });
  if (!job) throw badRequest('That job was not found in your tracker');
  return job;
}

// ---------- Resume review / job match ----------

const REVIEW_SYSTEM = `You are an experienced tech recruiter and resume coach. You review resumes the way a hiring manager and an applicant tracking system would, and you give specific, actionable feedback.

${UNTRUSTED_DATA_RULE}

Rules:
- Base every statement on the resume itself. Never invent experience, numbers or skills.
- Scores are integers from 0 to 100. Be calibrated: an average resume scores 55-70.
- bulletRewrites: pick the 3-6 weakest bullet points and rewrite them with strong verbs and measurable impact. Use placeholders like [X%] where the resume lacks a number, instead of inventing one.
- improvements: 4-8 items, most important first.
- missingKeywords: skills or terms the target job expects that the resume lacks (or common ones for the role when there is no target).
- jobMatch: fill it only when a target job or role is given, otherwise null.
- profile: a compact, factual extract of the candidate (it is reused later for cover letters and interview prep).`;

function clampReview(r: ReviewOutput): ReviewOutput {
  return {
    ...r,
    overallScore: clampScore(r.overallScore),
    atsScore: clampScore(r.atsScore),
    sections: r.sections.map((s) => ({ ...s, score: clampScore(s.score) })),
    jobMatch: r.jobMatch && { ...r.jobMatch, score: clampScore(r.jobMatch.score) },
  };
}

export async function createReview(actor: Actor, req: ReviewRequest, pdf?: PdfUpload) {
  if (!!pdf === !!req.text) {
    throw badRequest('Upload a PDF or paste your resume text', {
      resume: ['Upload a PDF or paste your resume text (one of the two)'],
    });
  }

  const job = req.jobId ? await ownJob(actor.id, req.jobId) : null;
  const target = job
    ? {
        role: `${job.title} at ${job.company}`,
        description: job.jobDescription ?? '',
      }
    : req.targetRole || req.jobDescription
      ? { role: req.targetRole ?? 'Not specified', description: req.jobDescription ?? '' }
      : null;

  const content: Anthropic.ContentBlockParam[] = [];
  if (pdf) {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pdf.buffer.toString('base64'),
      },
    });
  } else {
    content.push({ type: 'text', text: asData('resume', req.text!) });
  }
  if (target) {
    content.push({
      type: 'text',
      text: asData(
        'target_job',
        `Role: ${target.role}\n\nJob description:\n${target.description || '(none given)'}`,
      ),
    });
  }
  content.push({
    type: 'text',
    text: target
      ? `Review the resume${pdf ? ' in the attached document' : ''} against the target job, including jobMatch.`
      : `Give a general review of the resume${pdf ? ' in the attached document' : ''}. Set jobMatch to null.`,
  });

  // We keep the settings and, for pasted text only, the text itself. Never the PDF.
  const input = {
    source: pdf ? 'pdf' : 'text',
    fileName: pdf?.originalname ?? null,
    targetRole: target?.role ?? null,
    jobDescription: job ? null : (req.jobDescription ?? null),
    text: pdf ? null : req.text!,
  };

  return startRun(
    { userId: actor.id, role: actor.role, kind: 'resume_review', input, jobId: job?.id },
    async () => {
      const result = clampReview(
        await callStructured({ system: REVIEW_SYSTEM, content, schema: reviewOutputSchema }),
      );
      return { result, score: result.jobMatch?.score ?? result.overallScore };
    },
  );
}

/** The structured profile from one of the user's finished reviews, or 400. */
async function ownProfile(userId: string, reviewId: string) {
  const review = await prisma.aiRun.findFirst({
    where: { id: reviewId, userId, kind: 'resume_review', status: 'done' },
  });
  const profile = (review?.result as { profile?: Profile } | null)?.profile;
  if (!review || !profile) {
    throw badRequest('Choose one of your finished resume reviews', {
      reviewId: ['Choose one of your finished resume reviews'],
    });
  }
  return { review, profile };
}

const jobText = (job: { title: string; company: string; jobDescription: string | null }) =>
  asData(
    'job_posting',
    `Role: ${job.title}\nCompany: ${job.company}\n\nJob description:\n${job.jobDescription || '(none given: infer typical requirements from the title)'}`,
  );

// ---------- Interview questions ----------

const INTERVIEW_SYSTEM = `You are a senior interviewer who prepares candidates for real interview loops. You write the questions this specific company would likely ask for this specific role, with what a strong answer covers.

${UNTRUSTED_DATA_RULE}

Rules:
- 15 to 25 questions in total, grouped into rounds by category. Include only the categories that fit the role (e.g. skip system_design for junior or non-engineering roles).
- Tie questions to the job description's actual requirements, not generic lists.
- When a candidate profile is given, at least 3 questions must be about the candidate's own projects or jobs (fromResume: true), naming them.
- answerPoints are short, concrete prompts the candidate can build an answer from, not full answers.
- questionsToAsk: 4-6 thoughtful questions for the candidate to ask the interviewer.`;

export async function createInterviewQuestions(actor: Actor, req: InterviewRequest) {
  const job = await ownJob(actor.id, req.jobId);
  const source = req.reviewId ? await ownProfile(actor.id, req.reviewId) : null;

  const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: jobText(job) }];
  if (source) {
    content.push({
      type: 'text',
      text: asData('candidate_profile', JSON.stringify(source.profile, null, 2)),
    });
  }
  content.push({
    type: 'text',
    text: `Write the interview questions for this role${source ? ', using the candidate profile for the questions about their own work' : ''}.`,
  });

  return startRun(
    {
      userId: actor.id,
      role: actor.role,
      kind: 'interview_questions',
      input: { targetRole: `${job.title} at ${job.company}`, reviewId: req.reviewId ?? null },
      jobId: job.id,
      sourceRunId: source?.review.id,
    },
    async () => ({
      result: await callStructured({
        system: INTERVIEW_SYSTEM,
        content,
        schema: interviewOutputSchema,
      }),
    }),
  );
}

// ---------- Cover letter ----------

const COVER_SYSTEM = `You write tailored, honest cover letters for job applications.

${UNTRUSTED_DATA_RULE}

Rules:
- Use only facts from the candidate profile. Never invent experience, employers, numbers or skills. If the job needs something the profile lacks, do not claim it; you may show willingness to learn.
- Connect 2-3 of the candidate's strongest, most relevant achievements to the job's needs.
- No clichés ("I am writing to express my interest", "team player", "passionate"). Sound like a real person.
- Tone: formal = polished and professional; friendly = warm and conversational; concise = direct, no filler.
- Length: short = about 150 words in total; standard = about 300 words.
- Plain text only, no markdown.`;

export async function createCoverLetter(actor: Actor, req: CoverLetterRequest) {
  const job = await ownJob(actor.id, req.jobId);
  const { review, profile } = await ownProfile(actor.id, req.reviewId);

  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: jobText(job) },
    { type: 'text', text: asData('candidate_profile', JSON.stringify(profile, null, 2)) },
    {
      type: 'text',
      text: `Write the cover letter. Tone: ${req.tone}. Length: ${req.length}.`,
    },
  ];

  return startRun(
    {
      userId: actor.id,
      role: actor.role,
      kind: 'cover_letter',
      input: {
        targetRole: `${job.title} at ${job.company}`,
        reviewId: review.id,
        tone: req.tone,
        length: req.length,
      },
      jobId: job.id,
      sourceRunId: review.id,
    },
    async () => ({
      result: await callStructured({
        system: COVER_SYSTEM,
        content,
        schema: coverLetterOutputSchema,
      }),
    }),
  );
}

// ---------- Shared run endpoints ----------

export const listRuns = (userId: string, filter: { kind?: AiKind; jobId?: string }) =>
  prisma.aiRun.findMany({
    where: { userId, ...filter },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      kind: true,
      status: true,
      score: true,
      error: true,
      input: true,
      jobId: true,
      sourceRunId: true,
      createdAt: true,
      completedAt: true,
      job: { select: { id: true, company: true, title: true } },
    },
  });

export async function getRun(userId: string, id: string) {
  const run = await prisma.aiRun.findFirst({
    where: { id, userId },
    include: { job: { select: { id: true, company: true, title: true } } },
  });
  if (!run) throw notFound('AI result');
  return run;
}

export async function deleteRun(userId: string, id: string) {
  const { count } = await prisma.aiRun.deleteMany({ where: { id, userId } });
  if (!count) throw notFound('AI result');
}
