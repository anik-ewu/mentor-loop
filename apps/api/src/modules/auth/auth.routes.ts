import { Router, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { aiEnabled } from '../ai/claude';
import { notFound, unauthorized } from '../../lib/errors';
import { emailEnabled } from '../../lib/mailer';
import { signToken, signTwoFactorTicket, verifyTwoFactorTicket } from '../../lib/jwt';
import {
  AUTH_COOKIE,
  currentUserId,
  optionalAuth,
  requireAdmin,
  requireAuth,
} from '../../middleware/auth';
import {
  clientKey,
  createLimiter,
  createLoginFailureLimiter,
  emailKey,
  everyoneKey,
} from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import {
  changePasswordSchema,
  demoSchema,
  forgotPasswordSchema,
  googleSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  twoFactorCodeSchema,
  twoFactorLoginSchema,
  twoFactorSetupSchema,
  updateMeSchema,
  verifyEmailSchema,
} from './auth.schema';
import * as authService from './auth.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const authLimiter = createLimiter({ limit: 20 });

/** Stricter than authLimiter: each request sends an email. */
const forgotLimiter = createLimiter({ limit: 5 });

const loginFailureLimiter = createLoginFailureLimiter();

/** A new token voids the last one, so this limits voiding someone's link to 3 times an hour. */
const forgotEmailLimiter = createLimiter({
  windowMs: ONE_HOUR_MS,
  limit: 3,
  keyGenerator: emailKey,
  legacyHeaders: false,
});

/** Each signup can send an email, so one address can't be flooded with them. */
const signupEmailLimiter = createLimiter({
  windowMs: ONE_HOUR_MS,
  limit: 3,
  keyGenerator: emailKey,
  legacyHeaders: false,
});

/** Failed tries per account: a 6-digit code must not be guessable by anyone with the password. */
const twoFactorLimiter = createLimiter({
  limit: 5,
  keyGenerator: (req) => verifyTwoFactorTicket(req.body.ticket)?.sub ?? clientKey(req),
  skipSuccessfulRequests: true,
  legacyHeaders: false,
});

/** Failed tries per logged-in user, so a stolen session can't guess the password or a code. */
const accountFailureLimiter = createLimiter({
  limit: 10,
  keyGenerator: (req) => currentUserId(req),
  skipSuccessfulRequests: true,
  legacyHeaders: false,
});

// Backstops for faked client IPs: each signup costs a slow password hash, each reset an email.
const signupBackstop = createLimiter({
  limit: 20,
  keyGenerator: everyoneKey,
  legacyHeaders: false,
});
const forgotBackstop = createLimiter({
  limit: 20,
  keyGenerator: everyoneKey,
  legacyHeaders: false,
});

// `secure` follows the request scheme (trust proxy is on), so HTTPS deployments get Secure cookies.
const cookieOptions = (req: Request) =>
  ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' }) as const;

function setSessionCookie(req: Request, res: Response, user: User) {
  res.cookie(AUTH_COOKIE, signToken({ sub: user.id, role: user.role, ver: user.sessionVersion }), {
    ...cookieOptions(req),
    maxAge: SEVEN_DAYS_MS,
  });
}

function startSession(req: Request, res: Response, user: User) {
  setSessionCookie(req, res, user);
  res.json({ user: authService.toPublicUser(user) });
}

/** Every way of logging in ends here, so none of them can skip the second step. */
function finishLogin(req: Request, res: Response, user: User) {
  if (user.totpEnabledAt) {
    const ticket = signTwoFactorTicket({ sub: user.id, ver: user.sessionVersion });
    return res.json({ twoFactorRequired: true, ticket });
  }
  startSession(req, res, user);
}

export const authRouter = Router();

/** Tells the web app which login options to show. */
authRouter.get('/config', (_req, res) => {
  res.json({
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    demoMode: env.DEMO_MODE,
    aiEnabled: aiEnabled(),
    passwordResetEnabled: emailEnabled(),
    emailSignupEnabled: emailEnabled(),
  });
});

authRouter.post(
  '/signup',
  authLimiter,
  validateBody(signupSchema),
  // In this order: a request the shared limit turns away must not use up the email's limit.
  signupBackstop,
  signupEmailLimiter,
  async (req, res) => {
    // A signup that can't be confirmed could reveal registered emails and hold a stranger's address.
    if (!emailEnabled()) throw notFound('Email signup');
    const { password, ...details } = req.body;
    const passwordHash = await authService.hashPassword(password);
    // Not awaited: the answer must not depend on whether this email is registered.
    authService.register(details, passwordHash).catch((err) => {
      console.error('Signup failed:', err);
    });
    res.status(202).json({ verificationRequired: true });
  },
);

authRouter.post('/verify-email', authLimiter, validateBody(verifyEmailSchema), async (req, res) => {
  await authService.verifyEmail(req.body);
  res.status(204).end();
});

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  loginFailureLimiter,
  async (req, res) => {
    finishLogin(req, res, await authService.login(req.body));
  },
);

authRouter.post('/google', authLimiter, validateBody(googleSchema), async (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) throw notFound('Google sign-in');
  finishLogin(req, res, await authService.loginWithGoogle(req.body.credential));
});

authRouter.post(
  '/2fa/login',
  authLimiter,
  validateBody(twoFactorLoginSchema),
  twoFactorLimiter,
  async (req, res) => {
    const ticket = verifyTwoFactorTicket(req.body.ticket);
    if (!ticket) throw unauthorized('That took too long. Please log in again.');
    const user = await authService.completeTwoFactorLogin(ticket.sub, ticket.ver, req.body.code);
    startSession(req, res, user);
  },
);

authRouter.post(
  '/forgot-password',
  forgotLimiter,
  validateBody(forgotPasswordSchema),
  // In this order: a request the shared limit turns away must not use up the email's limit.
  forgotBackstop,
  forgotEmailLimiter,
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
    finishLogin(req, res, await authService.resetPassword(req.body));
  },
);

authRouter.post('/demo', authLimiter, validateBody(demoSchema), async (req, res) => {
  if (!env.DEMO_MODE) throw notFound('Demo mode');
  finishLogin(req, res, await authService.demoLogin(req.body.role));
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

authRouter.post(
  '/change-password',
  requireAuth,
  accountFailureLimiter,
  validateBody(changePasswordSchema),
  async (req, res) => {
    startSession(req, res, await authService.changePassword(currentUserId(req), req.body));
  },
);

authRouter.post(
  '/2fa/setup',
  requireAdmin,
  accountFailureLimiter,
  validateBody(twoFactorSetupSchema),
  async (req, res) => {
    res.json(await authService.startTwoFactorSetup(currentUserId(req), req.body.password));
  },
);

authRouter.post(
  '/2fa/enable',
  requireAdmin,
  accountFailureLimiter,
  validateBody(twoFactorCodeSchema),
  async (req, res) => {
    const { user, recoveryCodes } = await authService.enableTwoFactor(
      currentUserId(req),
      req.body.code,
    );
    setSessionCookie(req, res, user);
    res.json({ recoveryCodes });
  },
);

authRouter.post(
  '/2fa/disable',
  requireAdmin,
  accountFailureLimiter,
  validateBody(twoFactorCodeSchema),
  async (req, res) => {
    const user = await authService.disableTwoFactor(currentUserId(req), req.body.code);
    res.json({ user: authService.toPublicUser(user) });
  },
);
