import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../src/lib/jwt';
import { mailer } from '../src/lib/mailer';
import { googleVerifier } from '../src/modules/auth/google';
import { prisma } from '../src/lib/prisma';
import { app, createUser, loginAs, resetDb } from './helpers';

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

  it('demo login creates a password-less demo mentor when the seed did not', async () => {
    const res = await request(app).post('/api/auth/demo').send({ role: 'admin' }).expect(200);
    expect(res.body.user).toMatchObject({ email: 'admin@mentorloop.dev', role: 'admin' });
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@mentorloop.dev', password: 'admin12345' })
      .expect(401);
  });

  describe('password reset', () => {
    /** Requests a reset and returns the token from the emailed link. */
    async function requestToken(email: string) {
      const send = vi.spyOn(mailer, 'send').mockResolvedValue();
      await request(app).post('/api/auth/forgot-password').send({ email }).expect(204);
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      return new URL(send.mock.calls[0][0].text.match(/https?:\/\/\S+/)![0]).searchParams.get(
        'token',
      )!;
    }

    it('lets a Google-only account set a password, then log in with it', async () => {
      const user = await prisma.user.create({
        data: { email: 'g@test.dev', name: 'G User', googleId: 'google-1' },
      });
      const token = await requestToken('G@test.dev');

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'new-password-1' })
        .expect(200);
      expect(res.body.user.id).toBe(user.id);
      expect(res.headers['set-cookie'][0]).toMatch(/ml_session=/);

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'g@test.dev', password: 'new-password-1' })
        .expect(200);
    });

    it('uses each token once and stores only its hash', async () => {
      await createUser('user', 'r@test.dev');
      const token = await requestToken('r@test.dev');
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'r@test.dev' } });
      expect(stored.resetTokenHash).not.toBe(token);

      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'another-pass' })
        .expect(200);
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'third-pass1' })
        .expect(400);
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'r@test.dev', password: 'password123' })
        .expect(401);
    });

    it('logs out existing sessions but keeps the one it starts', async () => {
      const { agent: stolen, user } = await loginAs('user', 'hijacked@test.dev');
      await stolen.get('/api/jobs').expect(200);
      const token = await requestToken('hijacked@test.dev');

      const owner = request.agent(app);
      await owner
        .post('/api/auth/reset-password')
        .send({ token, password: 'new-password-1' })
        .expect(200);

      await stolen.get('/api/jobs').expect(401);
      const me = await stolen.get('/api/auth/me').expect(200);
      expect(me.body.user).toBeNull();

      await owner.get('/api/jobs').expect(200);
      const ownerMe = await owner.get('/api/auth/me').expect(200);
      expect(ownerMe.body.user.id).toBe(user.id);
    });

    it('keeps sessions from before session versions existed', async () => {
      const user = await createUser('user', 'legacy@test.dev');
      const cookie = `ml_session=${signToken({ sub: user.id, role: user.role })}`;
      await request(app).get('/api/jobs').set('Cookie', cookie).expect(200);
    });

    it('rejects a revoked session on admin routes too', async () => {
      const { agent, user } = await loginAs('admin');
      await agent.get('/api/slots/all').expect(200);
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
      await agent.get('/api/slots/all').expect(401);
    });

    it('rejects an expired token', async () => {
      await createUser('user', 'old@test.dev');
      const token = await requestToken('old@test.dev');
      await prisma.user.update({
        where: { email: 'old@test.dev' },
        data: { resetTokenExpires: new Date(Date.now() - 1000) },
      });
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'new-password-1' })
        .expect(400);
    });

    it('sends at most one email per address per minute', async () => {
      await createUser('user', 'twice@test.dev');
      const token = await requestToken('twice@test.dev');
      const send = vi.spyOn(mailer, 'send').mockResolvedValue();
      send.mockClear(); // same spy as requestToken's, which already saw the first email
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'twice@test.dev' })
        .expect(204);
      await new Promise((r) => setTimeout(r, 50));
      expect(send).not.toHaveBeenCalled();
      // The first link still works.
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'new-password-1' })
        .expect(200);
    });

    it('answers the same for an unknown email and sends nothing', async () => {
      const send = vi.spyOn(mailer, 'send').mockResolvedValue();
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@test.dev' })
        .expect(204);
      await new Promise((r) => setTimeout(r, 50));
      expect(send).not.toHaveBeenCalled();
    });
  });
});
