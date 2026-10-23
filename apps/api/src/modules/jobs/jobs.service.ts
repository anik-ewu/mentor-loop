import type { JobApplication, JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import type {
  CreateEventInput,
  CreateJobInput,
  ListQuery,
  UpdateEventInput,
  UpdateJobInput,
} from './jobs.schema';

const DAY_MS = 86_400_000;
const FOLLOW_UP_DAYS = 7;

export const ACTIVE: JobStatus[] = ['applied', 'assessment', 'interviewing', 'offer'];
const FINAL: JobStatus[] = ['accepted', 'rejected', 'withdrawn', 'ghosted'];
/** Statuses that mean the company answered. */
const RESPONDED: JobStatus[] = ['assessment', 'interviewing', 'offer', 'accepted', 'rejected'];
const INTERVIEWED: JobStatus[] = ['interviewing', 'offer', 'accepted'];
const OFFERED: JobStatus[] = ['offer', 'accepted'];

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** List rows leave out the large text fields; `events` holds the next interview. */
const listSelect = (now: Date) =>
  ({
    id: true,
    company: true,
    title: true,
    jobUrl: true,
    location: true,
    workMode: true,
    salaryMin: true,
    salaryMax: true,
    currency: true,
    source: true,
    status: true,
    priority: true,
    appliedAt: true,
    followUpAt: true,
    deadline: true,
    position: true,
    createdAt: true,
    updatedAt: true,
    events: {
      where: { type: 'interview', scheduledAt: { gte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: 1,
      select: { scheduledAt: true },
    },
  }) satisfies Prisma.JobApplicationSelect;

const SORTS: Record<ListQuery['sort'], Prisma.JobApplicationOrderByWithRelationInput[]> = {
  updated: [{ updatedAt: 'desc' }],
  created: [{ createdAt: 'desc' }],
  applied: [{ appliedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  company: [{ company: 'asc' }, { title: 'asc' }],
  priority: [{ priority: 'desc' }, { updatedAt: 'desc' }],
};

/**
 * Field changes that go with a status change (FR-JOB-3). Values the caller sends
 * explicitly win over these defaults.
 */
function statusSideEffects(
  job: Pick<JobApplication, 'appliedAt' | 'followUpAt'>,
  to: JobStatus,
  now = new Date(),
) {
  const data: { appliedAt?: Date; followUpAt?: Date | null } = {};
  const appliedAt = job.appliedAt ?? (to === 'wishlist' || to === 'withdrawn' ? null : now);
  if (appliedAt && !job.appliedAt) data.appliedAt = appliedAt;
  if (to === 'applied' && !job.followUpAt && appliedAt) {
    data.followUpAt = addDays(appliedAt, FOLLOW_UP_DAYS);
  }
  if (FINAL.includes(to)) data.followUpAt = null;
  return data;
}

/** Merges defaults under the caller's input: a key the caller set is never overwritten. */
function withDefaults<T extends object>(input: T, defaults: Partial<T>): T {
  const out = { ...input } as Record<string, unknown>;
  for (const [k, v] of Object.entries(defaults)) if (out[k] === undefined) out[k] = v;
  return out as T;
}

async function findOwned(userId: string, id: string) {
  const job = await prisma.jobApplication.findFirst({ where: { id, userId } });
  if (!job) throw notFound('Job');
  return job;
}

/** Places a job at the top of its column. */
async function topPosition(tx: Prisma.TransactionClient, userId: string, status: JobStatus) {
  const first = await tx.jobApplication.findFirst({
    where: { userId, status },
    orderBy: { position: 'asc' },
    select: { position: true },
  });
  return first ? first.position - 1 : 0;
}

export async function list(userId: string, query: ListQuery) {
  const jobs = await prisma.jobApplication.findMany({
    where: {
      userId,
      status: query.status,
      ...(query.q && {
        OR: [
          { company: { contains: query.q, mode: 'insensitive' } },
          { title: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: SORTS[query.sort],
    select: listSelect(new Date()),
  });
  return jobs.map(({ events, ...job }) => ({
    ...job,
    nextInterviewAt: events[0]?.scheduledAt ?? null,
  }));
}

export async function get(userId: string, id: string) {
  const job = await prisma.jobApplication.findFirst({
    where: { id, userId },
    include: {
      events: { orderBy: { createdAt: 'desc' } },
      aiRuns: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, kind: true, status: true, score: true, createdAt: true },
      },
    },
  });
  if (!job) throw notFound('Job');
  return job;
}

export async function create(userId: string, input: CreateJobInput) {
  return prisma.$transaction(async (tx) => {
    const current = { appliedAt: input.appliedAt ?? null, followUpAt: input.followUpAt ?? null };
    const data = withDefaults(input, statusSideEffects(current, input.status));
    const job = await tx.jobApplication.create({
      data: { ...data, userId, position: await topPosition(tx, userId, input.status) },
    });
    if (input.status !== 'wishlist') {
      await tx.jobEvent.create({
        data: { jobId: job.id, type: 'status_change', toStatus: input.status },
      });
    }
    return job;
  });
}

/** Applies a status change with its event and side effects, inside a transaction. */
async function changeStatus(
  tx: Prisma.TransactionClient,
  job: JobApplication,
  to: JobStatus,
  extra: Prisma.JobApplicationUpdateInput = {},
) {
  if (job.status !== to) {
    await tx.jobEvent.create({
      data: { jobId: job.id, type: 'status_change', fromStatus: job.status, toStatus: to },
    });
  }
  const data =
    job.status === to ? extra : withDefaults(extra, { status: to, ...statusSideEffects(job, to) });
  return tx.jobApplication.update({ where: { id: job.id }, data });
}

export async function update(userId: string, id: string, input: UpdateJobInput) {
  const job = await findOwned(userId, id);
  // Checked against stored values, since an edit may send only one of the two.
  const min = input.salaryMin === undefined ? job.salaryMin : input.salaryMin;
  const max = input.salaryMax === undefined ? job.salaryMax : input.salaryMax;
  if (min != null && max != null && min > max) {
    throw badRequest('Please check the highlighted fields', {
      salaryMax: ['Minimum salary is above the maximum'],
    });
  }
  return prisma.$transaction(async (tx) => {
    const { status, ...rest } = input;
    if (status && status !== job.status) {
      return changeStatus(tx, job, status, {
        ...rest,
        position: await topPosition(tx, userId, status),
      });
    }
    return tx.jobApplication.update({ where: { id }, data: rest });
  });
}

export async function move(userId: string, id: string, status: JobStatus, position?: number) {
  const job = await findOwned(userId, id);
  return prisma.$transaction(async (tx) =>
    changeStatus(tx, job, status, {
      position:
        position ?? (job.status === status ? job.position : await topPosition(tx, userId, status)),
    }),
  );
}

export async function remove(userId: string, id: string) {
  await findOwned(userId, id);
  await prisma.jobApplication.delete({ where: { id } });
}

export async function addEvent(userId: string, jobId: string, input: CreateEventInput) {
  const job = await findOwned(userId, jobId);
  const { nextFollowUpAt, ...fields } = input;
  return prisma.$transaction(async (tx) => {
    const event = await tx.jobEvent.create({
      data: {
        ...fields,
        outcome: input.type === 'interview' ? (fields.outcome ?? 'pending') : fields.outcome,
        jobId,
      },
    });
    if (input.type === 'interview' && (job.status === 'applied' || job.status === 'assessment')) {
      await changeStatus(tx, job, 'interviewing');
    }
    if (input.type === 'follow_up') {
      await tx.jobApplication.update({
        where: { id: jobId },
        data: { followUpAt: nextFollowUpAt ?? addDays(new Date(), FOLLOW_UP_DAYS) },
      });
    }
    return event;
  });
}

async function findOwnedEvent(userId: string, jobId: string, eventId: string) {
  const event = await prisma.jobEvent.findFirst({
    where: { id: eventId, jobId, job: { userId } },
  });
  if (!event) throw notFound('Event');
  return event;
}

export async function updateEvent(
  userId: string,
  jobId: string,
  eventId: string,
  input: UpdateEventInput,
) {
  await findOwnedEvent(userId, jobId, eventId);
  return prisma.jobEvent.update({ where: { id: eventId }, data: input });
}

export async function removeEvent(userId: string, jobId: string, eventId: string) {
  await findOwnedEvent(userId, jobId, eventId);
  await prisma.jobEvent.delete({ where: { id: eventId } });
}

const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export async function stats(userId: string) {
  const now = new Date();
  const [byStatus, applied, followUpsDue, upcomingInterviews] = await Promise.all([
    prisma.jobApplication.groupBy({ by: ['status'], where: { userId }, _count: true }),
    prisma.jobApplication.findMany({
      where: { userId, appliedAt: { not: null } },
      select: {
        status: true,
        appliedAt: true,
        events: { where: { type: 'status_change' }, select: { toStatus: true } },
      },
    }),
    prisma.jobApplication.findMany({
      where: { userId, status: { in: ACTIVE }, followUpAt: { lte: now } },
      orderBy: { followUpAt: 'asc' },
      select: { id: true, company: true, title: true, status: true, followUpAt: true },
    }),
    prisma.jobEvent.findMany({
      where: { type: 'interview', scheduledAt: { gte: now }, job: { userId } },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        job: { select: { id: true, company: true, title: true } },
      },
    }),
  ]);

  // A job "reached" a stage if it is there now or a status change ever took it there.
  const reached = applied.map(
    (j) =>
      new Set<JobStatus>([j.status, ...j.events.flatMap((e) => (e.toStatus ? [e.toStatus] : []))]),
  );
  const count = (stages: JobStatus[]) => reached.filter((r) => stages.some((s) => r.has(s))).length;
  const weekAgo = addDays(now, -7);

  const byStatusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const interviews = count(INTERVIEWED);
  return {
    byStatus: byStatusMap as Partial<Record<JobStatus, number>>,
    total: byStatus.reduce((sum, s) => sum + s._count, 0),
    applied: applied.length,
    appliedLast7Days: applied.filter((j) => j.appliedAt! >= weekAgo).length,
    responseRate: rate(count(RESPONDED), applied.length),
    interviews,
    interviewRate: rate(interviews, applied.length),
    offers: count(OFFERED),
    followUpsDue,
    upcomingInterviews,
  };
}
