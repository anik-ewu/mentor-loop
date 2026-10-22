import { Router } from 'express';
import type { BookingStatus } from '@prisma/client';
import { currentUserId, requireAdmin, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createBookingSchema, updateStatusSchema } from './bookings.schema';
import * as bookings from './bookings.service';

const STATUSES: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed'];

export const bookingsRouter = Router();

bookingsRouter.post('/', requireAuth, validateBody(createBookingSchema), async (req, res) => {
  res.status(201).json({ booking: await bookings.create(currentUserId(req), req.body) });
});

bookingsRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ bookings: await bookings.listForUser(currentUserId(req)) });
});

bookingsRouter.post('/:id/cancel', requireAuth, async (req, res) => {
  const actor = { id: currentUserId(req), role: req.auth!.role };
  res.json({ booking: await bookings.cancel(req.params.id as string, actor) });
});

bookingsRouter.get('/', requireAdmin, async (req, res) => {
  const status = STATUSES.find((s) => s === req.query.status);
  res.json({ bookings: await bookings.listAll(status) });
});

bookingsRouter.get('/stats', requireAdmin, async (_req, res) => {
  res.json(await bookings.stats());
});

bookingsRouter.patch(
  '/:id/status',
  requireAdmin,
  validateBody(updateStatusSchema),
  async (req, res) => {
    res.json({ booking: await bookings.updateStatus(req.params.id as string, req.body.status) });
  },
);
