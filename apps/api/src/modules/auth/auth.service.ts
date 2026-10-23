import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { badRequest, conflict, unauthorized } from '../../lib/errors';
import { mailer } from '../../lib/mailer';
import { googleVerifier } from './google';
import type { LoginInput, ResetPasswordInput, SignupInput } from './auth.schema';

export const DEMO_EMAILS = { user: 'demo@mentorloop.dev', admin: 'admin@mentorloop.dev' } as const;

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'avatarUrl' | 'role' | 'timezone'>;

export const toPublicUser = ({ id, email, name, avatarUrl, role, timezone }: User): PublicUser => ({
  id,
  email,
  name,
  avatarUrl,
  role,
  timezone,
});

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.user.create({ data: { name: input.name, email: input.email, passwordHash } });
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same message for unknown email and wrong password, so emails can't be probed.
  const valid = user?.passwordHash && (await bcrypt.compare(input.password, user.passwordHash));
  if (!user || !valid) throw unauthorized('Email or password is incorrect');
  return user;
}

export async function loginWithGoogle(credential: string) {
  const profile = await googleVerifier.verify(credential);

  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (byGoogleId) return byGoogleId;

  // Google has verified this email, so it is safe to link it to an existing password account.
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    return prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: profile.googleId, avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl },
    });
  }

  return prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
    },
  });
}

const RESET_TTL_MS = 60 * 60 * 1000;
/** One email per address per minute, however many IPs ask. */
const RESET_COOLDOWN_MS = 60 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Emails a one-hour reset link. Also how accounts created with Google get a password.
 * Callers always answer 204, so the response never says whether the email is registered.
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || (Object.values(DEMO_EMAILS) as string[]).includes(email)) return;
  // The last token was issued at expires - TTL; a fresh one would also void the link just sent.
  const issuedAt = user.resetTokenExpires && user.resetTokenExpires.getTime() - RESET_TTL_MS;
  if (issuedAt && Date.now() - issuedAt < RESET_COOLDOWN_MS) return;

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
      `Hi ${user.name.split(' ')[0]},`,
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
      passwordHash: await bcrypt.hash(password, 12),
      resetTokenHash: null,
      resetTokenExpires: null,
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
    create: { email: DEMO_EMAILS[role], name: DEMO_NAMES[role], role },
  });
}

export const findUser = (id: string) => prisma.user.findUnique({ where: { id } });

export const updateProfile = (id: string, data: { timezone?: string }) =>
  prisma.user.update({ where: { id }, data });
