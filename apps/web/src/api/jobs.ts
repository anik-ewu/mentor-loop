import { api } from './client';
import type { Job, JobEvent, JobSort, JobStats, JobStatus, JobSummary } from './types';

/** Form values: '' clears a field on the server. */
export type JobInput = Partial<Record<keyof Job, unknown>>;

export interface EventInput {
  type?: 'interview' | 'note' | 'follow_up';
  title?: string;
  scheduledAt?: string;
  outcome?: string;
  notes?: string;
  nextFollowUpAt?: string;
}

export interface JobQuery {
  status?: JobStatus;
  q?: string;
  sort?: JobSort;
}

type JobRes = { job: Job };
type EventRes = { event: JobEvent };

export const jobsApi = {
  list: (query: JobQuery = {}) => {
    const qs = new URLSearchParams(
      Object.entries(query).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    return api<{ jobs: JobSummary[] }>(`/jobs${qs ? `?${qs}` : ''}`).then((r) => r.jobs);
  },
  get: (id: string) => api<JobRes>(`/jobs/${id}`).then((r) => r.job),
  stats: () => api<JobStats>('/jobs/stats'),
  create: (body: JobInput) => api<JobRes>('/jobs', 'POST', body).then((r) => r.job),
  update: (id: string, body: JobInput) =>
    api<JobRes>(`/jobs/${id}`, 'PATCH', body).then((r) => r.job),
  move: (id: string, status: JobStatus, position?: number) =>
    api<JobRes>(`/jobs/${id}/move`, 'PATCH', { status, position }).then((r) => r.job),
  remove: (id: string) => api<void>(`/jobs/${id}`, 'DELETE'),
  addEvent: (id: string, body: EventInput) =>
    api<EventRes>(`/jobs/${id}/events`, 'POST', body).then((r) => r.event),
  updateEvent: (id: string, eventId: string, body: EventInput) =>
    api<EventRes>(`/jobs/${id}/events/${eventId}`, 'PATCH', body).then((r) => r.event),
  removeEvent: (id: string, eventId: string) =>
    api<void>(`/jobs/${id}/events/${eventId}`, 'DELETE'),
};
