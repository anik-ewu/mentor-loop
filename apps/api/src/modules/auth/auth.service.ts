import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { DEMO_EMAILS, isDemoEmail } from '../../lib/demo';
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../../lib/errors';
import { emailEnabled, mailer } from '../../lib/mailer';
import { googleVerifier } from './google';
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from './auth.schema';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  matchTotpStep,
  otpauthUrl,
} from './totp';

const BCRYPT_COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

export const toPublicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  role: user.role,
  timezone: user.timezone,
  emailVerified: Boolean(user.emailVerifiedAt),
  hasPassword: Boolean(user.passwordHash),
  twoFactorEnabled: Boolean(user.totpEnabledAt),
  isDemo: isDemoEmail(user.email),
});

export type PublicUser = ReturnType<typeof toPublicUser>;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
/** One email per address per minute, however many IPs ask. */
const EMAIL_COOLDOWN_MS = 60 * 1000;

/** Emails a confirmation link. It doesn't log anyone in: the person who signed up may be someone else. */
async function sendVerificationEmail(user: User) {
  const issuedAt = user.emailVerifyExpires && user.emailVerifyExpires.getTime() - VERIFY_TTL_MS;
  if (issuedAt && Date.now() - issuedAt < EMAIL_COOLDOWN_MS) return;

  const token = randomBytes(32).toString('base64url');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyTokenHash: hashToken(token),
      emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });
  await mailer.send({
    to: user.email,
    subject: 'Confirm your MentorLoop email',
    text: [
      // No name: this address isn't proved yet, so the name could be a stranger's advert or link.
      'Hi,',
      '',
      'Use this link to confirm your email for MentorLoop. It expires in 24 hours:',
      `${env.CLIENT_ORIGIN}/verify-email?token=${token}`,
      '',
      "If you didn't sign up, you can ignore this email.",
    ].join('\n'),
  });
}

/**
 * Runs after the signup response is sent, with the password already hashed, so the response is the
 * same in content and timing whether or not the email is registered. The owner hears about it by email.
 */
export async function register(input: Omit<SignupInput, 'password'>, passwordHash: string) {
  if (isDemoEmail(input.email)) return;
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing?.emailVerifiedAt) {
    await mailer.send({
      to: existing.email,
      subject: 'You already have a MentorLoop account',
      text: [
        `Hi ${existing.name.split(' ')[0]},`,
        '',
        'Someone tried to sign up with this email, but you already have an account. You can log in here:',
        `${env.CLIENT_ORIGIN}/login`,
        '',
        "If this wasn't you, you can ignore this email. Your account hasn't changed.",
      ].join('\n'),
    });
    return;
  }
  // Signing up again can't change the waiting account's password, or anyone could replace it. A
  // reset link can: only the inbox owner gets it, and otherwise this new password would just not work.
  if (existing) return requestPasswordReset(existing.email);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash },
  });
  await sendVerificationEmail(user);
}

/**
 * Confirms the address and the password together. A link alone would prove only who reads the inbox:
 * a stranger who signed up first could wait for the owner to click, then log in with their own
 * password. Also logs out older sessions. The WHERE repeats the checks, so a token can't win a race.
 */
export async function verifyEmail({ token, password }: VerifyEmailInput) {
  const invalid = () => badRequest('This link is invalid or has expired. Log in to get a new one.');
  const emailVerifyTokenHash = hashToken(token);
  const user = await prisma.user.findUnique({ where: { emailVerifyTokenHash } });
  if (!user?.passwordHash) throw invalid();
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw badRequest('That password is incorrect', { password: ['That password is incorrect'] });
  }
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, emailVerifyTokenHash, emailVerifyExpires: { gt: new Date() } },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyTokenHash: null,
      emailVerifyExpires: null,
      sessionVersion: { increment: 1 },
    },
  });
  if (count !== 1) throw invalid();
}

/** Compared against when there's no real hash, so an unknown email takes as long as a known one. */
const NO_ACCOUNT_HASH = hashPassword(randomBytes(32).toString('hex'));

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? (await NO_ACCOUNT_HASH));
  // Same message for unknown email and wrong password, so emails can't be probed.
  if (!user?.passwordHash || !valid) throw unauthorized('Email or password is incorrect');
  // Only someone who knows the password gets this far, so saying so reveals nothing. Without an
  // email provider nobody could ever confirm, so older accounts can still log in (with no AI).
  if (!user.emailVerifiedAt && emailEnabled()) {
    sendVerificationEmail(user).catch((err) => {
      console.error('Confirmation email failed:', err);
    });
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Please confirm your email first. We sent you a link, so check your inbox and spam folder.',
    );
  }
  return user;
}

export async function loginWithGoogle(credential: string) {
  const profile = await googleVerifier.verify(credential);

  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (byGoogleId) return byGoogleId;

  // Google has verified this email, so it is safe to link it to an existing password account.
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    // Someone else may have signed up first with this address and be waiting for the real owner to
    // arrive, so their password and sessions must not survive. Even a confirmed address doesn't rule
    // that out: the owner may have clicked a link they didn't ask for. Mentor accounts are only made
    // by the deploy, so theirs stay. Forgot password adds a new one for anyone who wants it.
    const dropAccess = byEmail.role !== 'admin';
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.googleId,
        avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        emailVerifyTokenHash: null,
        emailVerifyExpires: null,
        ...(dropAccess && {
          passwordHash: null,
          resetTokenHash: null,
          resetTokenExpires: null,
          sessionVersion: { increment: 1 },
        }),
      },
    });
  }

  return prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
      emailVerifiedAt: new Date(),
    },
  });
}

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Emails a one-hour reset link. Also how accounts created with Google get a password.
 * Callers always answer 204, so the response never says whether the email is registered.
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || isDemoEmail(email)) return;
  // The last token was issued at expires - TTL; a fresh one would also void the link just sent.
  const issuedAt = user.resetTokenExpires && user.resetTokenExpires.getTime() - RESET_TTL_MS;
  if (issuedAt && Date.now() - issuedAt < EMAIL_COOLDOWN_MS) return;

  const token = randomBytes(32).toString('base64url');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: hashToken(token),
      resetTokenExpires: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const link = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
  await mailer.send({
    to: user.email,
    subject: 'Reset your MentorLoop password',
    text: [
      user.emailVerifiedAt ? `Hi ${user.name.split(' ')[0]},` : 'Hi,',
      '',
      'Use this link to set a new MentorLoop password. It works once and expires in 1 hour:',
      link,
      '',
      "If you didn't ask for this, you can ignore this email.",
    ].join('\n'),
  });
}

/** Sets the new password and uses up the token. Returns the user so the route can log them in. */
export async function resetPassword({ token, password }: ResetPasswordInput) {
  const invalid = () => badRequest('This reset link is invalid or has expired. Request a new one.');
  const resetTokenHash = hashToken(token);
  const user = await prisma.user.findUnique({ where: { resetTokenHash }, select: { id: true } });
  if (!user) throw invalid();

  // The token check is repeated in the WHERE, so two requests racing with one token can't both win.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, resetTokenHash, resetTokenExpires: { gt: new Date() } },
    data: {
      passwordHash: await hashPassword(password),
      resetTokenHash: null,
      resetTokenExpires: null,
      // The link reached this inbox, which proves the address too.
      emailVerifiedAt: new Date(),
      // Logs out every existing session; the caller starts a new one from the returned user.
      sessionVersion: { increment: 1 },
    },
  });
  if (count !== 1) throw invalid();
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

const DEMO_NAMES = { user: 'Demo User', admin: 'Demo Admin' } as const;

/**
 * Created on first use, so demo mode works when ADMIN_EMAIL is a real address and the seed did
 * not create admin@mentorloop.dev. No password: only this endpoint (off when DEMO_MODE=false)
 * can sign in to an account it created.
 */
export function demoLogin(role: keyof typeof DEMO_EMAILS) {
  return prisma.user.upsert({
    where: { email: DEMO_EMAILS[role] },
    update: {},
    create: { email: DEMO_EMAILS[role], name: DEMO_NAMES[role], role, emailVerifiedAt: new Date() },
  });
}

export const findUser = (id: string) => prisma.user.findUnique({ where: { id } });

export const updateProfile = (id: string, data: { timezone?: string }) =>
  prisma.user.update({ where: { id }, data });

const demoLocked = () =>
  forbidden('This is a shared demo account, so its security settings are locked.');

/** Keeps the caller logged in (the route starts a new session) and logs out every other device. */
export async function changePassword(id: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (isDemoEmail(user.email)) throw demoLocked();
  if (!user.passwordHash) {
    throw badRequest(
      'This account signs in with Google. Use "Forgot password?" to add a password.',
    );
  }
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw badRequest('That password is incorrect', {
      currentPassword: ['That password is incorrect'],
    });
  }
  return prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      resetTokenHash: null,
      resetTokenExpires: null,
      sessionVersion: { increment: 1 },
    },
  });
}

// ---------- Two-factor login (mentor accounts) ----------

const RECOVERY_CODE_COUNT = 8;

/** Null if it can't be read, which happens after JWT_SECRET changes: recovery codes still work. */
function readTotpSecret(user: User) {
  if (!user.totpSecret) return null;
  try {
    return decryptSecret(user.totpSecret);
  } catch (err) {
    console.error('Could not decrypt an authenticator secret. Did JWT_SECRET change?', err);
    return null;
  }
}

/** Accepts an app code once, or uses up a recovery code. Both writes are conditional, so a race can't reuse one. */
async function consumeCode(user: User, code: string) {
  if (/^\d{6}$/.test(code)) {
    const secret = readTotpSecret(user);
    const step = secret && matchTotpStep(secret, code);
    if (!step) return false;
    const { count } = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return count === 1;
  }
  const hash = hashToken(code.toLowerCase());
  const updated = await prisma.$executeRaw`
    UPDATE "User" SET "recoveryCodeHashes" = array_remove("recoveryCodeHashes", ${hash})
    WHERE "id" = ${user.id} AND ${hash} = ANY("recoveryCodeHashes")`;
  return updated === 1;
}

/** The second login step. Returns the user so the route can start the session. */
export async function completeTwoFactorLogin(userId: string, version: number, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const failed = () => unauthorized('That code is incorrect or has expired');
  if (!user?.totpEnabledAt || user.sessionVersion !== version) throw failed();
  if (!(await consumeCode(user, code))) throw failed();
  return user;
}

/** Starts setup. It stays off until the first code proves the app is set up correctly. */
export async function startTwoFactorSetup(id: string, password?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (user.totpEnabledAt) throw conflict('Two-factor login is already on');
  // A stolen session alone shouldn't be able to lock the owner out with its own authenticator.
  if (user.passwordHash && !(await bcrypt.compare(password ?? '', user.passwordHash))) {
    throw badRequest('That password is incorrect', { password: ['That password is incorrect'] });
  }
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id }, data: { totpSecret: encryptSecret(secret) } });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
}

/**
 * Turns it on and returns the recovery codes. Only their hashes are kept, so they're shown once.
 * Logs out other sessions too: someone turning this on may suspect a stolen one.
 */
export async function enableTwoFactor(id: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (user.totpEnabledAt) throw conflict('Two-factor login is already on');
  const secret = readTotpSecret(user);
  const step = secret && matchTotpStep(secret, code);
  if (!step) {
    throw badRequest('That code is incorrect', { code: ['That code is incorrect'] });
  }
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    randomBytes(8).toString('hex'),
  );
  const updated = await prisma.user.update({
    where: { id },
    data: {
      totpEnabledAt: new Date(),
      totpLastStep: step,
      recoveryCodeHashes: recoveryCodes.map(hashToken),
      sessionVersion: { increment: 1 },
    },
  });
  return { user: updated, recoveryCodes };
}

export async function disableTwoFactor(id: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (!user.totpEnabledAt) throw conflict('Two-factor login is already off');
  if (!(await consumeCode(user, code))) {
    throw badRequest('That code is incorrect', { code: ['That code is incorrect'] });
  }
  return prisma.user.update({
    where: { id },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] },
  });
}
