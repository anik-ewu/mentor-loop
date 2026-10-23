import { Router } from 'express';
import { currentUserId, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { historyQuerySchema, setGoalsSchema } from './goals.schema';
import * as goals from './goals.service';

export const goalsRouter = Router();

goalsRouter.use(requireAuth);

goalsRouter.get('/current', async (req, res) => {
  res.json(await goals.getCurrent(currentUserId(req)));
});

goalsRouter.put('/current', validateBody(setGoalsSchema), async (req, res) => {
  res.json(await goals.setCurrent(currentUserId(req), req.body));
});

goalsRouter.get('/history', async (req, res) => {
  const { weeks } = historyQuerySchema.parse(req.query);
  res.json({ weeks: await goals.history(currentUserId(req), weeks) });
});
