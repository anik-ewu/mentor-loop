import { api } from './client';
import type { AiKind, AiRun, AiRunSummary, LetterLength, LetterTone } from './types';

type RunRes = { run: AiRun };

export interface ReviewInput {
  file?: File;
  text?: string;
  jobId?: string;
  targetRole?: string;
  jobDescription?: string;
}

export const aiApi = {
  /** Starts a review; the returned run is `processing` until polled to done. */
  createReview: ({ file, ...fields }: ReviewInput) => {
    const form = new FormData();
    if (file) form.append('resume', file);
    for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
    return api<RunRes>('/ai/reviews', 'POST', form).then((r) => r.run);
  },
  createInterviewQuestions: (body: { jobId: string; reviewId?: string }) =>
    api<RunRes>('/ai/interview-questions', 'POST', body).then((r) => r.run),
  createCoverLetter: (body: {
    jobId: string;
    reviewId: string;
    tone: LetterTone;
    length: LetterLength;
  }) => api<RunRes>('/ai/cover-letters', 'POST', body).then((r) => r.run),
  runs: (filter: { kind?: AiKind; jobId?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filter).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    return api<{ runs: AiRunSummary[] }>(`/ai/runs${qs ? `?${qs}` : ''}`).then((r) => r.runs);
  },
  run: <R>(id: string) => api<{ run: AiRun<R> }>(`/ai/runs/${id}`).then((r) => r.run),
  remove: (id: string) => api<void>(`/ai/runs/${id}`, 'DELETE'),
  setPracticed: (id: string, key: string, done: boolean) =>
    api<{ run: { id: string; practiced: string[] } }>(`/ai/runs/${id}/practiced`, 'PATCH', {
      key,
      done,
    }).then((r) => r.run.practiced),
};
