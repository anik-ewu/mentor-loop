import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLimiter, createLoginFailureLimiter } from '../src/middleware/rateLimit';
import { prisma } from '../src/lib/prisma';
import { createUser, resetDb } from './helpers';

const VERCEL_IP = 'x-vercel-forwarded-for';
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ipNumber = (i: number) => `203.0.113.${i}`;

afterEach(() => {
  vi.useRealTimers();
});

function limitedApp() {
  const app = express();
  app.use(createLimiter({ limit: 1 }, true));
  app.get('/', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

/** Answers by password, so each outcome can be counted without a database or real accounts. */
function loginApp() {
  const statusFor: Record<string, number> = { right: 200, crash: 500 };
  const app = express();
  app.use(express.json());
  app.post('/login', createLoginFailureLimiter(true), (req, res) => {
    res.status(statusFor[req.body.password] ?? 401).json({});
  });
  return app;
}

const login = (app: express.Express, email: string, password: string, ip: string) =>
  request(app).post('/login').set(VERCEL_IP, ip).send({ email, password });

describe('rate limits', () => {
  it('counts visitors behind the same proxy separately', async () => {
    const app = limitedApp();
    await request(app).get('/').set(VERCEL_IP, ipNumber(1)).expect(200);
    await request(app).get('/').set(VERCEL_IP, ipNumber(2)).expect(200);
    const res = await request(app).get('/').set(VERCEL_IP, ipNumber(1)).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('falls back to the connection IP when the header is missing or not an IP', async () => {
    const app = limitedApp();
    await request(app).get('/').expect(200);
    await request(app).get('/').expect(429);
    await request(app).get('/').set(VERCEL_IP, 'not-an-ip').expect(429);
  });

  it('caps failed logins per email even when the IP keeps changing', async () => {
    const app = loginApp();
    for (let i = 1; i <= 10; i++) {
      await login(app, 'target@test.dev', 'wrong', ipNumber(i)).expect(401);
    }
    await login(app, 'target@test.dev', 'wrong', ipNumber(50)).expect(429);
    await login(app, 'other@test.dev', 'wrong', ipNumber(50)).expect(401);
  });

  it('keeps blocking an email for the whole window once it hits the limit', async () => {
    const app = loginApp();
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await login(app, 'target@test.dev', 'wrong', ipNumber(1)).expect(401);
    }
    for (let i = 0; i < 5; i++) {
      await login(app, 'target@test.dev', 'right', ipNumber(1)).expect(429);
    }
    vi.setSystemTime(start + FIFTEEN_MINUTES_MS - 1000);
    await login(app, 'target@test.dev', 'right', ipNumber(1)).expect(429);
    vi.setSystemTime(start + FIFTEEN_MINUTES_MS + 1000);
    await login(app, 'target@test.dev', 'right', ipNumber(1)).expect(200);
  });

  it("doesn't count successful logins or server errors toward the email limit", async () => {
    const app = loginApp();
    for (let i = 0; i < 12; i++) {
      await login(app, 'user@test.dev', 'right', ipNumber(1)).expect(200);
      await login(app, 'user@test.dev', 'crash', ipNumber(1)).expect(500);
    }
    await login(app, 'user@test.dev', 'wrong', ipNumber(1)).expect(401);
  });
});

describe('rate limits on the auth routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    await resetDb();
    // Limiters are off in test mode and built on import, so load a fresh app with them on.
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    const { createApp } = await import('../src/app.js');
    app = createApp();
  });

  afterEach(async () => {
    const { prisma } = await import('../src/lib/prisma.js');
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  const post = (path: string, body: object, ip: string) =>
    request(app).post(`/api/auth/${path}`).set(VERCEL_IP, ip).send(body);
  const forgot = (i: number) =>
    post('forgot-password', { email: `nobody${i}@test.dev` }, ipNumber(i));

  it("shows each visitor only their own count, not an email's or everyone's", async () => {
    const login = await post('login', { email: 'a@test.dev', password: 'x' }, ipNumber(1));
    expect(login.headers['x-ratelimit-limit']).toBe('20');
    const reset = await post('forgot-password', { email: 'a@test.dev' }, ipNumber(1));
    expect(reset.headers['x-ratelimit-limit']).toBe('5');
  });

  it('blocks a correct password after 10 failures, whatever the case or client IP', async () => {
    await createUser('user', 'target@test.dev');
    await createUser('user', 'other@test.dev');
    for (let i = 1; i <= 10; i++) {
      const email = i % 2 ? 'target@test.dev' : 'Target@Test.dev';
      await post('login', { email, password: 'wrong' }, ipNumber(i)).expect(401);
    }
    const correct = { email: 'target@test.dev', password: 'password123' };
    await post('login', correct, ipNumber(50)).expect(429);
    const otherAccount = { email: 'other@test.dev', password: 'password123' };
    await post('login', otherAccount, ipNumber(50)).expect(200);
  });

  it('counts each visitor separately on a route with only the client limit', async () => {
    const body = { token: 'not-a-real-token', password: 'long-enough-password' };
    for (let i = 0; i < 20; i++) await post('reset-password', body, ipNumber(1)).expect(400);
    await post('reset-password', body, ipNumber(1)).expect(429);
    await post('reset-password', body, ipNumber(2)).expect(400);
  });

  it('answers 400 for a missing email instead of crashing the email limiters', async () => {
    await post('login', { password: 'wrong' }, ipNumber(1)).expect(400);
    await post('forgot-password', {}, ipNumber(1)).expect(400);
  });

  it('rejects an email too long to be real, because limiters keep it in memory', async () => {
    const email = `${'a'.repeat(300)}@test.dev`;
    const bodies = {
      login: { email, password: 'wrong' },
      signup: { name: 'Test User', email, password: 'password123' },
      'forgot-password': { email },
    };
    for (const [path, body] of Object.entries(bodies)) {
      const res = await post(path, body, ipNumber(1)).expect(400);
      expect(res.body.error.fields.email).toBeDefined();
    }
  });

  it('allows 3 reset requests per email an hour, whatever the client IP', async () => {
    const email = 'nobody@test.dev';
    for (let i = 1; i <= 3; i++) await post('forgot-password', { email }, ipNumber(i)).expect(204);
    await post('forgot-password', { email }, ipNumber(50)).expect(429);
    await post('forgot-password', { email: 'someone@test.dev' }, ipNumber(50)).expect(204);
  });

  it('caps reset requests across everyone when the email and client IP keep changing', async () => {
    for (let i = 1; i <= 20; i++) await forgot(i).expect(204);
    await forgot(21).expect(429);
  });

  it("doesn't charge an email for requests the shared limit already turned away", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    for (let i = 1; i <= 20; i++) await forgot(i).expect(204);
    const email = 'target@test.dev';
    for (let i = 0; i < 3; i++) {
      await post('forgot-password', { email }, ipNumber(100 + i)).expect(429);
    }
    vi.setSystemTime(start + FIFTEEN_MINUTES_MS + 1000);
    await post('forgot-password', { email }, ipNumber(200)).expect(204);
  });

  // Real password hashes, because this suite loads its own copy of the auth modules.
  it(
    'caps signups across everyone when the client IP keeps changing',
    { timeout: 30_000 },
    async () => {
      const signup = (i: number) =>
        post(
          'signup',
          { name: 'Test User', email: `user${i}@test.dev`, password: 'long-enough-password' },
          ipNumber(i),
        );
      for (let i = 1; i <= 20; i++) await signup(i).expect(202);
      await signup(21).expect(429);
      await vi.waitFor(async () => expect(await prisma.user.count()).toBe(20));
    },
  );

  it('limits signups per email, so one inbox cannot be flooded', { timeout: 30_000 }, async () => {
    const signup = (i: number) =>
      post(
        'signup',
        { name: 'Test User', email: 'one@test.dev', password: 'long-enough-password' },
        ipNumber(i),
      );
    for (let i = 1; i <= 3; i++) await signup(i).expect(202);
    await signup(4).expect(429);
    await vi.waitFor(async () => expect(await prisma.user.count()).toBe(1));
  });
});
