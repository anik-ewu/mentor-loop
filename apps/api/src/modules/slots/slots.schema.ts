import { z } from 'zod';

export const createSlotSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((s) => s.endsAt > s.startsAt, { message: 'End must be after start', path: ['endsAt'] })
  .refine((s) => s.startsAt > new Date(), {
    message: 'Pick a time in the future',
    path: ['startsAt'],
  });

export type CreateSlotInput = z.infer<typeof createSlotSchema>;
