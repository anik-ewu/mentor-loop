import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { usageQuerySchema } from './usage.schema';
import * as usage from './usage.service';

export const usageRouter = Router();

usageRouter.use(requireAdmin);

/** AI tokens, cost, failures and limit hits for the admin's usage page. */
usageRouter.get('/', async (req, res) => {
  const { days } = usageQuerySchema.parse(req.query);
  res.json(await usage.overview(days));
});
