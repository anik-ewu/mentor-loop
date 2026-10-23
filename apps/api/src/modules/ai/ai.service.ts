import type Anthropic from '@anthropic-ai/sdk';
import type { AiKind, Role } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { startRun } from './ai.runner';
import { reviewOutputSchema, type ReviewOutput, type ReviewRequest } from './ai.schema';
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
