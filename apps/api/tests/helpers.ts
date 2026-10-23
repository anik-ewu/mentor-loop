import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Booking", "Slot", "Service", "JobEvent", "JobApplication", "AiRun", "WeeklyGoal", "User" CASCADE',
  );
}

export async function createUser(role: 'user' | 'admin' = 'user', email = `${role}@test.dev`) {
  const passwordHash = await bcrypt.hash('password123', 4);
  return prisma.user.create({ data: { email, name: `Test ${role}`, role, passwordHash } });
}

/** Logs in and returns an agent that keeps the session cookie. */
export async function loginAs(role: 'user' | 'admin' = 'user', email?: string) {
  const user = await createUser(role, email);
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ email: user.email, password: 'password123' })
    .expect(200);
  return { agent, user };
}

export const createService = () =>
  prisma.service.create({
    data: { name: 'Resume Review', description: 'Feedback on your CV', durationMin: 45 },
  });

export function createSlot(hoursFromNow = 24) {
  const startsAt = new Date(Date.now() + hoursFromNow * 3_600_000);
  return prisma.slot.create({
    data: { startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60_000) },
  });
}
