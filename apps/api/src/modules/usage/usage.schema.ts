import { z } from 'zod';

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).catch(30),
});
