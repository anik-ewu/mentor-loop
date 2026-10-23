import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDb } from './helpers';

beforeEach(resetDb);

describe('Admin AI usage', () => {
  it('is for the admin only', async () => {
    const { agent } = await loginAs();
    await agent.get('/api/admin/usage').expect(403);
  });

  it('sums tokens and cost by feature and user, and lists failures and limit hits', async () => {
    const { agent } = await loginAs('admin');
    const { user } = await loginAs('user', 'heavy@test.dev');
    const run = (over: object) => ({
      userId: user.id,
      kind: 'resume_review' as const,
      status: 'done' as const,
      input: {},
      model: 'test',
      inputTokens: 1000,
      outputTokens: 500,
      costMicros: 350,
      ...over,
    });
    await prisma.aiRun.createMany({
      data: [
        run({}),
        run({ kind: 'cover_letter' }),
        run({ status: 'failed', error: 'Cut off.' }),
        // Outside the 30-day window.
        run({ createdAt: new Date(Date.now() - 40 * 86_400_000) }),
      ],
    });
    await prisma.aiLimitHit.create({ data: { userId: user.id, reason: 'daily' } });

    const { body } = await agent.get('/api/admin/usage?days=30').expect(200);
    expect(body.totals).toMatchObject({
      runs: 3,
      done: 2,
      failed: 1,
      inputTokens: 3000,
      outputTokens: 1500,
      costUsd: 0.00105,
    });
    expect(body.byKind).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'resume_review', runs: 2 }),
        expect.objectContaining({ kind: 'cover_letter', runs: 1 }),
      ]),
    );
    expect(body.topUsers[0]).toMatchObject({ user: { email: 'heavy@test.dev' }, runs: 3 });
    expect(body.recentFailures).toMatchObject([{ error: 'Cut off.', user: { id: user.id } }]);
    expect(body.limitHits).toMatchObject({ daily: 1, budget: 0, topUsers: [{ hits: 1 }] });
    expect(body.byDay.reduce((n: number, d: { runs: number }) => n + d.runs, 0)).toBe(3);
  });
});
