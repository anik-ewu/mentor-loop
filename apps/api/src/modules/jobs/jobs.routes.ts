import { Router } from 'express';
import { currentUserId, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import {
  createEventSchema,
  createJobSchema,
  listQuerySchema,
  moveJobSchema,
  updateEventSchema,
  updateJobSchema,
} from './jobs.schema';
import * as jobs from './jobs.service';

export const jobsRouter = Router();

jobsRouter.use(requireAuth);

jobsRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.json({ jobs: await jobs.list(currentUserId(req), query) });
});

jobsRouter.get('/stats', async (req, res) => {
  res.json(await jobs.stats(currentUserId(req)));
});

jobsRouter.post('/', validateBody(createJobSchema), async (req, res) => {
  res.status(201).json({ job: await jobs.create(currentUserId(req), req.body) });
});

jobsRouter.get('/:id', async (req, res) => {
  res.json({ job: await jobs.get(currentUserId(req), req.params.id as string) });
});

jobsRouter.patch('/:id', validateBody(updateJobSchema), async (req, res) => {
  res.json({ job: await jobs.update(currentUserId(req), req.params.id as string, req.body) });
});

jobsRouter.patch('/:id/move', validateBody(moveJobSchema), async (req, res) => {
  const { status, position } = req.body;
  res.json({
    job: await jobs.move(currentUserId(req), req.params.id as string, status, position),
  });
});

jobsRouter.delete('/:id', async (req, res) => {
  await jobs.remove(currentUserId(req), req.params.id as string);
  res.status(204).end();
});

jobsRouter.post('/:id/events', validateBody(createEventSchema), async (req, res) => {
  res
    .status(201)
    .json({ event: await jobs.addEvent(currentUserId(req), req.params.id as string, req.body) });
});

jobsRouter.patch('/:id/events/:eventId', validateBody(updateEventSchema), async (req, res) => {
  const { id, eventId } = req.params as { id: string; eventId: string };
  res.json({ event: await jobs.updateEvent(currentUserId(req), id, eventId, req.body) });
});

jobsRouter.delete('/:id/events/:eventId', async (req, res) => {
  const { id, eventId } = req.params as { id: string; eventId: string };
  await jobs.removeEvent(currentUserId(req), id, eventId);
  res.status(204).end();
});
