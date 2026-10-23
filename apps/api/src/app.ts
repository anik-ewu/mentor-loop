import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { aiRouter } from './modules/ai/ai.routes';
import { authRouter } from './modules/auth/auth.routes';
import { bookingsRouter } from './modules/bookings/bookings.routes';
import { goalsRouter } from './modules/goals/goals.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';
import { servicesRouter } from './modules/services/services.routes';
import { slotsRouter } from './modules/slots/slots.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Each feature is a self-contained module: add new ones (resources, courses...) here.
  app.use('/api/auth', authRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/slots', slotsRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/goals', goalsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
