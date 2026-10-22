import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { User } from '@prisma/client';
import { env, isProd } from '../../config/env';
import { notFound } from '../../lib/errors';
import { signToken } from '../../lib/jwt';
import { AUTH_COOKIE, currentUserId, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { demoSchema, googleSchema, loginSchema, signupSchema } from './auth.schema';
import * as authService from './auth.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

function startSession(res: Response, user: User, status = 200) {
  res.cookie(AUTH_COOKIE, signToken({ sub: user.id, role: user.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SEVEN_DAYS_MS,
  });
  res.status(status).json({ user: authService.toPublicUser(user) });
}

export const authRouter = Router();

/** Tells the web app which login options to show. */
authRouter.get('/config', (_req, res) => {
  res.json({ googleClientId: env.GOOGLE_CLIENT_ID || null, demoMode: env.DEMO_MODE });
});

authRouter.post('/signup', authLimiter, validateBody(signupSchema), async (req, res) => {
  startSession(res, await authService.signup(req.body), 201);
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  startSession(res, await authService.login(req.body));
});

authRouter.post('/google', authLimiter, validateBody(googleSchema), async (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) throw notFound('Google sign-in');
  startSession(res, await authService.loginWithGoogle(req.body.credential));
});

authRouter.post('/demo', validateBody(demoSchema), async (req, res) => {
  if (!env.DEMO_MODE) throw notFound('Demo mode');
  startSession(res, await authService.demoLogin(req.body.role));
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await authService.getUser(currentUserId(req));
  res.json({ user: authService.toPublicUser(user) });
});
