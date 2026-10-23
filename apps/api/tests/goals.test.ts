import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDb } from './helpers';

const DAY = 86_400_000;

beforeEach(resetDb);
afterEach(() => {
  vi.useRealTimers();
});

/** Freezes the clock (Date only, so timers and I/O keep working). */
const freeze = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

async function applyAt(userId: string, at: Date) {
  return prisma.jobApplication.create({
    data: { userId, company: 'Acme', title: 'Dev', status: 'applied', appliedAt: at },
  });
}

describe('weekly goals', () => {
  it("counts by the user's own week: Monday 00:30 in Dhaka is the new week", async () => {
    // Monday 19 Oct 2026, 01:00 in Asia/Dhaka (UTC+6) = Sunday 18 Oct, 19:00 UTC.
    freeze('2026-10-18T19:00:00Z');
    const { agent, user } = await loginAs();
    await agent.patch('/api/auth/me').send({ timezone: 'Asia/Dhaka' }).expect(200);
    await agent
      .put('/api/goals/current')
      .send({ goals: [{ metric: 'applications', target: 2 }] })
      .expect(200);

    await applyAt(user.id, new Date('2026-10-18T18:30:00Z')); // Mon 00:30 local: counts
    await applyAt(user.id, new Date('2026-10-18T17:30:00Z')); // Sun 23:30 local: last week

    const { body } = await agent.get('/api/goals/current').expect(200);
    expect(body.weekStart).toBe('2026-10-18T18:00:00.000Z');
    expect(body.timezone).toBe('Asia/Dhaka');
    expect(body.goals).toEqual([{ metric: 'applications', target: 2, actual: 1, met: false }]);
  });

  it("keeps this week's goals when the user's timezone changes mid-week", async () => {
    freeze('2026-10-21T12:00:00Z');
    const { agent } = await loginAs();
    await agent
      .put('/api/goals/current')
      .send({ goals: [{ metric: 'interviews', target: 3 }] })
      .expect(200);
    await agent.patch('/api/auth/me').send({ timezone: 'Asia/Dhaka' }).expect(200);

    const { body } = await agent.get('/api/goals/current').expect(200);
    expect(body.weekStart).toBe('2026-10-18T18:00:00.000Z');
    expect(body).toMatchObject({
      carriedOver: false,
      goals: [{ metric: 'interviews', target: 3 }],
    });

    // Saving again replaces them instead of adding a second set.
    await agent
      .put('/api/goals/current')
      .send({ goals: [{ metric: 'interviews', target: 4 }] })
      .expect(200);
    expect(await prisma.weeklyGoal.count()).toBe(1);
  });

  it('rejects an unknown timezone and bad goal sets', async () => {
    const { agent } = await loginAs();
    await agent.patch('/api/auth/me').send({ timezone: 'Mars/Olympus' }).expect(400);
    const put = (goals: unknown) => agent.put('/api/goals/current').send({ goals });
    await put([]).expect(400);
    await put([{ metric: 'applications', target: 0 }]).expect(400);
    await put([{ metric: 'applications', target: 101 }]).expect(400);
    await put([
      { metric: 'applications', target: 1 },
      { metric: 'applications', target: 2 },
    ]).expect(400);
    await put([{ metric: 'pushups', target: 3 }]).expect(400);
  });

  it("copies last week's targets forward when a new week has none", async () => {
    freeze('2026-10-21T12:00:00Z'); // Wednesday, UTC user
    const { agent, user } = await loginAs();
    await prisma.weeklyGoal.createMany({
      data: [
        {
          userId: user.id,
          weekStart: new Date('2026-10-12T00:00:00Z'),
          metric: 'applications',
          target: 5,
        },
        {
          userId: user.id,
          weekStart: new Date('2026-10-12T00:00:00Z'),
          metric: 'interviews',
          target: 2,
        },
      ],
    });

    const { body } = await agent.get('/api/goals/current').expect(200);
    expect(body.carriedOver).toBe(true);
    expect(body.weekStart).toBe('2026-10-19T00:00:00.000Z');
    expect(
      body.goals.map((g: { metric: string; target: number }) => [g.metric, g.target]).sort(),
    ).toEqual([
      ['applications', 5],
      ['interviews', 2],
    ]);
    // Copied once: the second read sees them as this week's own goals.
    expect((await agent.get('/api/goals/current')).body.carriedOver).toBe(false);
  });

  it('computes every metric from the data', async () => {
    freeze('2026-10-21T12:00:00Z');
    const { agent, user } = await loginAs();
    const job = await applyAt(user.id, new Date('2026-10-20T10:00:00Z'));
    await prisma.jobEvent.createMany({
      data: [
        { jobId: job.id, type: 'interview', createdAt: new Date('2026-10-20T11:00:00Z') },
        { jobId: job.id, type: 'follow_up', createdAt: new Date('2026-10-21T09:00:00Z') },
        { jobId: job.id, type: 'follow_up', createdAt: new Date('2026-10-15T09:00:00Z') }, // last week
      ],
    });
    const run = { userId: user.id, input: {}, model: 'test', status: 'done' as const };
    await prisma.aiRun.createMany({
      data: [
        { ...run, kind: 'resume_review', completedAt: new Date('2026-10-20T12:00:00Z') },
        { ...run, kind: 'interview_questions', completedAt: new Date('2026-10-21T08:00:00Z') },
        {
          ...run,
          kind: 'interview_questions',
          status: 'failed',
          completedAt: new Date('2026-10-21T08:00:00Z'),
        },
      ],
    });

    const { body } = await agent
      .put('/api/goals/current')
      .send({
        goals: [
          { metric: 'applications', target: 1 },
          { metric: 'interviews', target: 1 },
          { metric: 'follow_ups', target: 2 },
          { metric: 'resume_matches', target: 1 },
          { metric: 'interview_preps', target: 1 },
        ],
      })
      .expect(200);
    const actual = Object.fromEntries(
      body.goals.map((g: { metric: string; actual: number }) => [g.metric, g.actual]),
    );
    expect(actual).toEqual({
      applications: 1,
      interviews: 1,
      follow_ups: 1,
      resume_matches: 1,
      interview_preps: 1,
    });
    expect(body.allMet).toBe(false); // follow_ups 1 of 2
  });
});

describe('streaks', () => {
  it('weekly streak counts completed weeks back from last week, plus this week once met', async () => {
    freeze('2026-10-21T12:00:00Z'); // Wednesday of the week starting 19 Oct
    const { agent, user } = await loginAs();
    // Weeks starting 28 Sep (missed), then 5 and 12 Oct (met).
    const weeks = ['2026-09-28', '2026-10-05', '2026-10-12'];
    for (const [i, w] of weeks.entries()) {
      const start = new Date(`${w}T00:00:00Z`);
      await prisma.weeklyGoal.create({
        data: { userId: user.id, weekStart: start, metric: 'applications', target: 1 },
      });
      if (i > 0) await applyAt(user.id, new Date(start.getTime() + 2 * DAY));
    }
    // A met week before the missed one does not count.
    await prisma.weeklyGoal.create({
      data: {
        userId: user.id,
        weekStart: new Date('2026-09-21T00:00:00Z'),
        metric: 'applications',
        target: 1,
      },
    });
    await applyAt(user.id, new Date('2026-09-22T00:00:00Z'));

    let { body } = await agent.get('/api/goals/current').expect(200);
    expect(body.streaks.weekly).toBe(2); // 5 and 12 Oct; this week (carried over) not met yet

    await applyAt(user.id, new Date('2026-10-20T09:00:00Z'));
    ({ body } = await agent.get('/api/goals/current').expect(200));
    expect(body.allMet).toBe(true);
    expect(body.streaks.weekly).toBe(3);

    const history = await agent.get('/api/goals/history?weeks=8').expect(200);
    expect(history.body.weeks).toHaveLength(8);
    expect(history.body.weeks[1]).toMatchObject({
      allMet: true,
      weekStart: '2026-10-12T00:00:00.000Z',
    });
  });

  it('daily streak follows local days and continues from yesterday', async () => {
    // 23 Oct 2026, 02:00 in Dhaka (22 Oct, 20:00 UTC).
    freeze('2026-10-22T20:00:00Z');
    const { agent, user } = await loginAs();
    await agent.patch('/api/auth/me').send({ timezone: 'Asia/Dhaka' }).expect(200);

    // Local 22 Oct and 21 Oct (Dhaka), nothing yet today (23 Oct).
    await applyAt(user.id, new Date('2026-10-22T10:00:00Z'));
    await applyAt(user.id, new Date('2026-10-20T19:00:00Z')); // 21 Oct 01:00 local
    let { body } = await agent.get('/api/goals/current').expect(200);
    expect(body.streaks).toMatchObject({ daily: 2, activeToday: false });

    // 22 Oct 19:30 UTC is already 23 Oct 01:30 in Dhaka: today counts.
    await applyAt(user.id, new Date('2026-10-22T19:30:00Z'));
    ({ body } = await agent.get('/api/goals/current').expect(200));
    expect(body.streaks).toMatchObject({ daily: 3, activeToday: true });

    // A gap breaks it.
    await prisma.jobApplication.deleteMany({
      where: { appliedAt: new Date('2026-10-22T10:00:00Z') },
    });
    ({ body } = await agent.get('/api/goals/current').expect(200));
    expect(body.streaks).toMatchObject({ daily: 1, activeToday: true });
  });
});
