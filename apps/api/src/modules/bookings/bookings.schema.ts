import { z } from 'zod';
import { webUrl } from '../../lib/schema';

export const createBookingSchema = z.object({
  slotId: z.uuid(),
  serviceId: z.uuid(),
  note: z.string().trim().max(1000).optional(),
  cvUrl: webUrl(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** A finished AI resume review to share with the mentor. */
  resumeReviewId: z.uuid().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled']),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
