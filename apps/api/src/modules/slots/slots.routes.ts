import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createSlotSchema } from './slots.schema';
import * as slots from './slots.service';

export const slotsRouter = Router();

slotsRouter.get('/', async (_req, res) => {
  res.json({ slots: await slots.listOpen() });
});

slotsRouter.get('/all', requireAdmin, async (_req, res) => {
  res.json({ slots: await slots.listUpcoming() });
});

slotsRouter.post('/', requireAdmin, validateBody(createSlotSchema), async (req, res) => {
  res.status(201).json({ slot: await slots.create(req.body) });
});

slotsRouter.delete('/:id', requireAdmin, async (req, res) => {
  await slots.remove(req.params.id as string);
  res.status(204).end();
});
