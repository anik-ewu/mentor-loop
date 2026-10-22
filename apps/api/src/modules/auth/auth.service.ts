import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, notFound, unauthorized } from '../../lib/errors';
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

export async function demoLogin(role: keyof typeof DEMO_EMAILS) {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAILS[role] } });
  if (!user) throw notFound('Demo account (run the seed script)');
  return user;
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw unauthorized();
  return user;
}
