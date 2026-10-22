import { z } from 'zod';

export const createBookingSchema = z.object({
  slotId: z.uuid(),
  serviceId: z.uuid(),
  note: z.string().trim().max(1000).optional(),
  cvUrl: z.url('Enter a valid link').max(500).optional().or(z.literal('').transform(() => undefined)),
});

export const updateStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled']),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
