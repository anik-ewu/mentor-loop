import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { signToken, signTwoFactorTicket } from '../src/lib/jwt';
import { emailEnabled, mailer } from '../src/lib/mailer';
import { googleVerifier } from '../src/modules/auth/google';
import { currentStep, totpCode } from '../src/modules/auth/totp';
import { prisma } from '../src/lib/prisma';
import { app, createUser, loginAs, resetDb } from './helpers';

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

/** The token from the link in an email. */
const tokenIn = (text: string) =>
  new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

describe('auth', () => {
  it('signup only sends a confirmation link: no session until the email is proved', async () => {
    const send = vi.spyOn(mailer, 'send').mockResolvedValue();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Anik', email: 'Anik@Example.com', password: 'long-enough-password' })
      .expect(202);

    expect(res.body).toEqual({ verificationRequired: true });
    expect(res.headers['set-cookie']).toBeUndefined();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][0].to).toBe('anik@example.com');
    const token = tokenIn(send.mock.calls[0][0].text);

    const login = { email: 'anik@example.com', password: 'long-enough-password' };
    const blocked = await request(app).post('/api/auth/login').send(login).expect(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blocked.headers['set-cookie']).toBeUndefined();

    // The link alone isn't enough: someone else's password must not become active.
    await request(app)
      .post('/api/auth/verify-email')
      .send({ token, password: 'not-the-password' })
      .expect(400);
    const confirm = { token, password: login.password };
    await request(app).post('/api/auth/verify-email').send(confirm).expect(204);
    await request(app).post('/api/auth/verify-email').send(confirm).expect(400);
    const ok = await request(app).post('/api/auth/login').send(login).expect(200);
    expect(ok.headers['set-cookie'][0]).toMatch(/ml_session=.*HttpOnly/);
    expect(ok.body.user.passwordHash).toBeUndefined();
    expect(ok.body.user.emailVerified).toBe(true);
  });

  it('answers a signup the same whether or not the email is registered', async () => {
    const send = vi.spyOn(mailer, 'send').mockResolvedValue();
    const user = await createUser('user', 'taken@test.dev');
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'X Y', email: 'taken@test.dev', password: 'someone-elses-pass' })
      .expect(202);
    expect(res.body).toEqual({ verificationRequired: true });

    // The owner is told, and nothing about the account changes.
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][0].subject).toMatch(/already have/);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(user.passwordHash);
  });

  it('answers a repeat signup with a reset link, keeping the waiting password', async () => {
    const send = vi.spyOn(mailer, 'send').mockResolvedValue();
    const signup = (password: string) =>
      request(app)
        .post('/api/auth/signup')
        .send({ name: 'Visit https://evil.example', email: 'w@test.dev', password })
        .expect(202);
    await signup('first-long-password');
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'w@test.dev' } });
    // Neither email to this unproved address repeats what the sender typed as a name.
    expect(send.mock.calls[0][0].text).not.toContain('evil.example');

    await signup('second-long-password');
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0].subject).toMatch(/Reset/);
    expect(send.mock.calls[1][0].text).not.toContain('evil.example');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('rejects invalid signups and short or over-long passwords', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'nope', password: 'short-pass1' })
      .expect(400);
    expect(Object.keys(res.body.error.fields)).toEqual(['name', 'email', 'password']);

    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A B', email: 'a@test.dev', password: 'x'.repeat(73) })
      .expect(400);
  });

  it('does not use Brevo until a sender is set, since the default is not a Brevo sender', async () => {
    const previous = { node: env.NODE_ENV, key: env.BREVO_API_KEY, from: env.EMAIL_FROM };
    env.NODE_ENV = 'production';
    env.BREVO_API_KEY = 'key';
    try {
      expect(emailEnabled()).toBe(false);
      env.EMAIL_FROM = 'MentorLoop <me@example.com>';
      expect(emailEnabled()).toBe(true);
    } finally {
      env.NODE_ENV = previous.node;
      env.BREVO_API_KEY = previous.key;
      env.EMAIL_FROM = previous.from;
    }
  });

  it('turns email signup off when production has no email provider', async () => {
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      const config = await request(app).get('/api/auth/config').expect(200);
      expect(config.body.emailSignupEnabled).toBe(false);
      await request(app)
        .post('/api/auth/signup')
        .send({ name: 'A B', email: 'a@test.dev', password: 'long-enough-password' })
        .expect(404);
      expect(await prisma.user.count()).toBe(0);
    } finally {
      env.NODE_ENV = previous;
    }
  });

  it('checks a hash even for an unknown email, so timing does not reveal who is registered', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'whatever' })
      .expect(401);
    expect(compare).toHaveBeenCalledOnce();
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

  it('removes a password someone set before the real owner arrived with Google', async () => {
    // The attacker signs up first with the victim's address and stays logged in.
    const { agent: attacker, user } = await loginAs('user', 'victim@test.dev');
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({
      googleId: 'google-victim',
      email: 'victim@test.dev',
      name: 'Victim',
    });

    const owner = request.agent(app);
    await owner.post('/api/auth/google').send({ credential: 'x' }).expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' })
      .expect(401);
    await attacker.get('/api/jobs').expect(401);
    await owner.get('/api/jobs').expect(200);
    const linked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(linked.passwordHash).toBeNull();
  });

  it("keeps a mentor's password when linking Google: nobody can sign up as a mentor", async () => {
    const admin = await createUser('admin', 'mentor@test.dev');
    vi.spyOn(googleVerifier, 'verify').mockResolvedValue({
      googleId: 'google-mentor',
      email: 'mentor@test.dev',
      name: 'Mentor',
    });
    await request(app).post('/api/auth/google').send({ credential: 'x' }).expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'password123' })
      .expect(200);
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
      return tokenIn(send.mock.calls[0][0].text);
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
        .send({ token, password: 'third-password-1' })
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

  describe('change password', () => {
    const change = { currentPassword: 'password123', newPassword: 'a-brand-new-password' };

    it('needs the current password, then logs out other devices but not this one', async () => {
      const { agent, user } = await loginAs('user', 'c@test.dev');
      const other = request.agent(app);
      await other.post('/api/auth/login').send({ email: user.email, password: 'password123' });

      const wrong = await agent
        .post('/api/auth/change-password')
        .send({ ...change, currentPassword: 'not-my-password' })
        .expect(400);
      expect(wrong.body.error.fields.currentPassword).toBeDefined();

      await agent.post('/api/auth/change-password').send(change).expect(200);
      await agent.get('/api/jobs').expect(200);
      await other.get('/api/jobs').expect(401);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: change.newPassword })
        .expect(200);
    });

    it('requires login and stays locked on shared demo accounts', async () => {
      await request(app).post('/api/auth/change-password').send(change).expect(401);
      const demo = request.agent(app);
      await demo.post('/api/auth/demo').send({ role: 'user' }).expect(200);
      await demo.post('/api/auth/change-password').send(change).expect(403);
    });
  });

  describe('two-factor login', () => {
    /** Sets it up through the API. Returns the agent, secret and recovery codes. */
    async function withTwoFactor() {
      const { agent, user } = await loginAs('admin', 'mentor@test.dev');
      const { body } = await agent
        .post('/api/auth/2fa/setup')
        .send({ password: 'password123' })
        .expect(200);
      expect(body.otpauthUrl).toContain(body.secret);
      const code = totpCode(body.secret, currentStep());
      const enabled = await agent.post('/api/auth/2fa/enable').send({ code }).expect(200);
      return { agent, user, secret: body.secret as string, codes: enabled.body.recoveryCodes };
    }

    const logIn = (email: string) =>
      request(app).post('/api/auth/login').send({ email, password: 'password123' }).expect(200);

    it('matches the published test vector', () => {
      // RFC 6238 appendix B, SHA-1, T = 59 s: the secret is "12345678901234567890" in base32.
      expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
    });

    it('is only for the real mentor, and setup needs the password', async () => {
      const { agent } = await loginAs('user', 'u@test.dev');
      await agent.post('/api/auth/2fa/setup').send({}).expect(403);
      const mentor = await loginAs('admin', 'm@test.dev');
      await mentor.agent.post('/api/auth/2fa/setup').send({ password: 'nope' }).expect(400);
      const demo = request.agent(app);
      await demo.post('/api/auth/demo').send({ role: 'admin' }).expect(200);
      await demo.post('/api/auth/2fa/setup').send({}).expect(403);
    });

    it('stays off until a correct code confirms the app', async () => {
      const { agent, user } = await loginAs('admin', 'mentor@test.dev');
      await agent.post('/api/auth/2fa/setup').send({ password: 'password123' }).expect(200);
      await agent.post('/api/auth/2fa/enable').send({ code: '000000' }).expect(400);
      const res = await logIn(user.email);
      expect(res.body.user).toBeDefined();
    });

    it('logs in only with a code, and the ticket alone is not a session', async () => {
      const { user, secret } = await withTwoFactor();
      const first = await logIn(user.email);
      expect(first.body).toEqual({ twoFactorRequired: true, ticket: expect.any(String) });
      expect(first.headers['set-cookie']).toBeUndefined();

      await request(app)
        .get('/api/slots/all')
        .set('Cookie', `ml_session=${first.body.ticket}`)
        .expect(401);

      const agent = request.agent(app);
      await agent
        .post('/api/auth/2fa/login')
        .send({ ticket: first.body.ticket, code: '000000' })
        .expect(401);
      // The code from enabling can't be replayed: the next step's is needed.
      const code = totpCode(secret, currentStep() + 1);
      await agent.post('/api/auth/2fa/login').send({ ticket: first.body.ticket, code }).expect(200);
      await agent.get('/api/slots/all').expect(200);

      const replay = (await logIn(user.email)).body.ticket;
      await request(app).post('/api/auth/2fa/login').send({ ticket: replay, code }).expect(401);
    });

    it('rejects a session token used as a ticket, and a ticket from before a password change', async () => {
      const { user, secret } = await withTwoFactor();
      const code = totpCode(secret, currentStep() + 1);
      const session = signToken({ sub: user.id, role: user.role, ver: 0 });
      await request(app).post('/api/auth/2fa/login').send({ ticket: session, code }).expect(401);

      const stale = signTwoFactorTicket({ sub: user.id, ver: user.sessionVersion - 1 });
      await request(app).post('/api/auth/2fa/login').send({ ticket: stale, code }).expect(401);
    });

    it('takes each recovery code once', async () => {
      const { user, codes } = await withTwoFactor();
      expect(codes).toHaveLength(8);
      const ticket = (await logIn(user.email)).body.ticket;
      const body = { ticket, code: codes[0] };
      await request(app).post('/api/auth/2fa/login').send(body).expect(200);
      await request(app).post('/api/auth/2fa/login').send(body).expect(401);
    });

    it('also applies to Google sign-in and password reset', async () => {
      const { user } = await withTwoFactor();
      vi.spyOn(googleVerifier, 'verify').mockResolvedValue({
        googleId: 'google-mentor',
        email: user.email,
        name: 'Mentor',
      });
      const google = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'x' })
        .expect(200);
      expect(google.body.twoFactorRequired).toBe(true);
      expect(google.headers['set-cookie']).toBeUndefined();

      const send = vi.spyOn(mailer, 'send').mockResolvedValue();
      await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(204);
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      const reset = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: tokenIn(send.mock.calls[0][0].text), password: 'a-brand-new-password' })
        .expect(200);
      expect(reset.body.twoFactorRequired).toBe(true);
      expect(reset.headers['set-cookie']).toBeUndefined();
    });

    it('logs out other sessions when turned on, but not this one', async () => {
      const other = request.agent(app);
      const { agent, user } = await loginAs('admin', 'mentor@test.dev');
      await other.post('/api/auth/login').send({ email: user.email, password: 'password123' });
      const { body } = await agent
        .post('/api/auth/2fa/setup')
        .send({ password: 'password123' })
        .expect(200);
      const code = totpCode(body.secret, currentStep());
      await agent.post('/api/auth/2fa/enable').send({ code }).expect(200);
      await other.get('/api/slots/all').expect(401);
      await agent.get('/api/slots/all').expect(200);
    });

    it('turns a code into a plain failure if the secret can no longer be read', async () => {
      const { user } = await withTwoFactor();
      const ticket = (await logIn(user.email)).body.ticket;
      await prisma.user.update({ where: { id: user.id }, data: { totpSecret: 'a.b.c' } });
      await request(app).post('/api/auth/2fa/login').send({ ticket, code: '123456' }).expect(401);
    });

    it('turns off only with a valid code', async () => {
      const { agent, user, codes } = await withTwoFactor();
      await agent.post('/api/auth/2fa/disable').send({ code: '000000' }).expect(400);
      await agent.post('/api/auth/2fa/disable').send({ code: codes[0] }).expect(200);
      const res = await logIn(user.email);
      expect(res.body.user.twoFactorEnabled).toBe(false);
    });
  });

  it('does not store the authenticator secret in plain text', async () => {
    const { agent, user } = await loginAs('admin', 'mentor@test.dev');
    const { body } = await agent
      .post('/api/auth/2fa/setup')
      .send({ password: 'password123' })
      .expect(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpSecret).not.toContain(body.secret);
  });
});
