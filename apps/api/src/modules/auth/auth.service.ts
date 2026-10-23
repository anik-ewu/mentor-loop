import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, unauthorized } from '../../lib/errors';
import { googleVerifier } from './google';
import type { LoginInput, SignupInput } from './auth.schema';

export const DEMO_EMAILS = { user: 'demo@mentorloop.dev', admin: 'admin@mentorloop.dev' } as const;

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'avatarUrl' | 'role'>;

export const toPublicUser = ({ id, email, name, avatarUrl, role }: User): PublicUser => ({
  id,
  email,
  name,
  avatarUrl,
  role,
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

const DEMO_NAMES = { user: 'Demo User', admin: 'Demo Mentor' } as const;

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
