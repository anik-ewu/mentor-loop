import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { aiEnabled } from '../ai/claude';
import { notFound } from '../../lib/errors';
import { emailEnabled } from '../../lib/mailer';
import { signToken } from '../../lib/jwt';
import { AUTH_COOKIE, currentUserId, optionalAuth, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import {
  demoSchema,
  forgotPasswordSchema,
  googleSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateMeSchema,
} from './auth.schema';
import * as authService from './auth.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

/** Stricter than authLimiter: each request sends an email. */
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

// `secure` follows the request scheme (trust proxy is on), so HTTPS deployments get Secure cookies.
const cookieOptions = (req: Request) =>
  ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' }) as const;

function startSession(req: Request, res: Response, user: User, status = 200) {
  res.cookie(AUTH_COOKIE, signToken({ sub: user.id, role: user.role }), {
    ...cookieOptions(req),
    maxAge: SEVEN_DAYS_MS,
  });
  res.status(status).json({ user: authService.toPublicUser(user) });
}

export const authRouter = Router();

/** Tells the web app which login options to show. */
authRouter.get('/config', (_req, res) => {
  res.json({
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    demoMode: env.DEMO_MODE,
    aiEnabled: aiEnabled(),
    passwordResetEnabled: emailEnabled(),
  });
});

authRouter.post('/signup', authLimiter, validateBody(signupSchema), async (req, res) => {
  startSession(req, res, await authService.signup(req.body), 201);
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  startSession(req, res, await authService.login(req.body));
});

authRouter.post('/google', authLimiter, validateBody(googleSchema), async (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) throw notFound('Google sign-in');
  startSession(req, res, await authService.loginWithGoogle(req.body.credential));
});

authRouter.post(
  '/forgot-password',
  forgotLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    if (!emailEnabled()) throw notFound('Password reset');
    // Not awaited: an unknown email returning faster than a real one would reveal which exists.
    authService.requestPasswordReset(req.body.email).catch((err) => {
      console.error('Password reset email failed:', err);
    });
    res.status(204).end();
  },
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validateBody(resetPasswordSchema),
  async (req, res) => {
    startSession(req, res, await authService.resetPassword(req.body));
  },
);

authRouter.post('/demo', validateBody(demoSchema), async (req, res) => {
  if (!env.DEMO_MODE) throw notFound('Demo mode');
  startSession(req, res, await authService.demoLogin(req.body.role));
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions(req));
  res.status(204).end();
});

/** Current user, or { user: null } for visitors who are not logged in. */
authRouter.get('/me', optionalAuth, async (req, res) => {
  const user = req.auth && (await authService.findUser(req.auth.sub));
  res.json({ user: user ? authService.toPublicUser(user) : null });
});

/** Updates the current user's settings (for now: the timezone goals and streaks use). */
authRouter.patch('/me', requireAuth, validateBody(updateMeSchema), async (req, res) => {
  const user = await authService.updateProfile(currentUserId(req), req.body);
  res.json({ user: authService.toPublicUser(user) });
});
