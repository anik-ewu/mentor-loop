import { z } from 'zod';

export const GOAL_METRICS = [
  'applications',
  'interviews',
  'follow_ups',
  'resume_matches',
  'interview_preps',
] as const;

export const setGoalsSchema = z.object({
  goals: z
    .array(
      z.object({
        metric: z.enum(GOAL_METRICS),
        target: z.coerce.number().int().min(1, 'At least 1').max(100, 'At most 100'),
      }),
    )
    .min(1, 'Set at least one goal')
    .max(5)
    .refine((g) => new Set(g.map((x) => x.metric)).size === g.length, 'Each goal type only once'),
});

export const historyQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(26).default(8).catch(8),
});

export type SetGoalsInput = z.infer<typeof setGoalsSchema>;
