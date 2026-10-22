import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createServiceSchema, updateServiceSchema } from './services.schema';
import * as services from './services.service';

export const servicesRouter = Router();

servicesRouter.get('/', async (_req, res) => {
  res.json({ services: await services.listActive() });
});

servicesRouter.get('/all', requireAdmin, async (_req, res) => {
  res.json({ services: await services.listAll() });
});

servicesRouter.post('/', requireAdmin, validateBody(createServiceSchema), async (req, res) => {
  res.status(201).json({ service: await services.create(req.body) });
});

servicesRouter.patch('/:id', requireAdmin, validateBody(updateServiceSchema), async (req, res) => {
  res.json({ service: await services.update(req.params.id as string, req.body) });
});
