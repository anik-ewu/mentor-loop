import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './helpers';

describe('client mistakes are not server errors', () => {
  it('answers 413 for a body over the limit', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@test.dev', password: 'x'.repeat(200_000) })
      .expect(413);
    expect(res.body.error.code).toBe('TOO_LARGE');
  });

  it('answers 400 for broken JSON', async () => {
    await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
  });

  it('keeps the uptime ping free of limits', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['ratelimit-limit']).toBeUndefined();
  });
});
