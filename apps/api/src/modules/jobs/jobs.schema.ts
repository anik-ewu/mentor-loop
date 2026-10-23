import { z } from 'zod';

export const JOB_STATUSES = [
  'wishlist',
  'applied',
  'assessment',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
  'ghosted',
] as const;

/** Optional text: '' clears the field (null), a missing key leaves it unchanged. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === '' ? null : v));

const date = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish());
const money = z.preprocess(
  (v) => (v === '' ? null : v),
  z.coerce.number().int().min(0).max(100_000_000).nullish(),
);

const jobFields = {
  company: z.string().trim().min(1, 'Company is required').max(120),
  title: z.string().trim().min(1, 'Job title is required').max(160),
  jobUrl: z
    .preprocess((v) => (v === '' ? null : v), z.url('Enter a valid link').max(1000).nullish())
    .optional(),
  location: text(120),
  workMode: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['onsite', 'hybrid', 'remote']).nullish(),
  ),
  salaryMin: money,
  salaryMax: money,
  currency: text(8),
  source: text(60),
  status: z.enum(JOB_STATUSES),
  priority: z.coerce.number().int().min(1).max(3),
  appliedAt: date,
  followUpAt: date,
  deadline: date,
  contactName: text(120),
  contactEmail: z
    .preprocess((v) => (v === '' ? null : v), z.email('Enter a valid email').max(200).nullish())
    .optional(),
  jobDescription: text(20_000),
  notes: text(5000),
  coverLetter: text(10_000),
};

export const createJobSchema = z
  .object({
    ...jobFields,
    status: jobFields.status.default('wishlist'),
    priority: jobFields.priority.default(2),
  })
  .refine((j) => j.salaryMin == null || j.salaryMax == null || j.salaryMin <= j.salaryMax, {
    message: 'Minimum salary is above the maximum',
    path: ['salaryMax'],
  });

export const updateJobSchema = z.object(jobFields).partial();

export const moveJobSchema = z.object({
  status: z.enum(JOB_STATUSES),
  position: z.number().finite().optional(),
});

export const createEventSchema = z.object({
  type: z.enum(['interview', 'note', 'follow_up']),
  title: text(160),
  scheduledAt: date,
  outcome: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['pending', 'passed', 'failed']).nullish(),
  ),
  notes: text(5000),
  /** For follow-ups: when to follow up next. Defaults to 7 days from now. */
  nextFollowUpAt: date,
});

export const updateEventSchema = createEventSchema
  .pick({ title: true, scheduledAt: true, outcome: true, notes: true })
  .partial();

export const JOB_SORTS = ['updated', 'created', 'applied', 'company', 'priority'] as const;

export const listQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(JOB_SORTS).default('updated').catch('updated'),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type JobStatus = (typeof JOB_STATUSES)[number];
