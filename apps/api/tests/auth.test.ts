import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleVerifier } from '../src/modules/auth/google';
import { prisma } from '../src/lib/prisma';
import { app, createUser, resetDb } from './helpers';

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('auth', () => {
  it('signs up, sets an httpOnly cookie and returns the user without the hash', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Anik', email: 'Anik@Example.com', password: 'password123' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email: 'anik@example.com', role: 'user' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/ml_session=.*HttpOnly/);
  });

  it('rejects a duplicate email and invalid input', async () => {
    await createUser('user', 'taken@test.dev');
    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'X Y', email: 'taken@test.dev', password: 'password123' })
      .expect(409);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'nope', password: '1' })
      .expect(400);
    expect(Object.keys(res.body.error.fields)).toEqual(['name', 'email', 'password']);
  });

  it('logs in, reads /me and logs out', async () => {
    await createUser('user', 'me@test.dev');
    const agent = request.agent(app);

    await agent
      .post('/api/auth/login')
      .send({ email: 'me@test.dev', password: 'wrong' })
      .expect(401);
    await agent
      .post('/api/auth/login')
      .send({ email: 'me@test.dev', password: 'password123' })
      .expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('me@test.dev');

    await agent.post('/api/auth/logout').expect(204);
    const after = await agent.get('/api/auth/me').expect(200);
    expect(after.body.user).toBeNull();
  });

  it('links Google sign-in to an existing account with the same verified email', async () => {
    const existing = await createUser('user', 'g@test.dev');
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({
      googleId: 'google-123',
      email: 'g@test.dev',
      name: 'G User',
      avatarUrl: 'https://example.com/a.png',
    });

    const res = await request(app).post('/api/auth/google').send({ credential: 'x' }).expect(200);

    expect(res.body.user.id).toBe(existing.id);
    const linked = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(linked.googleId).toBe('google-123');
  });

  it('creates a new account on first Google sign-in', async () => {
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({
      googleId: 'google-new',
      email: 'new@test.dev',
      name: 'New User',
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'x' }).expect(200);
    expect(res.body.user).toMatchObject({ email: 'new@test.dev', role: 'user' });
  });

  it('demo login works for seeded demo accounts', async () => {
    await createUser('admin', 'admin@mentorloop.dev');
    const res = await request(app).post('/api/auth/demo').send({ role: 'admin' }).expect(200);
    expect(res.body.user.role).toBe('admin');
  });
});
