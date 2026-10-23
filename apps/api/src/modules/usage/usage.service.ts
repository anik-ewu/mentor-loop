import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { monthSpendMicros } from '../ai/ai.runner';

const DAY_MS = 86_400_000;
const TOP_USERS = 10;

/** Micro-dollars to dollars, for the page. */
const usd = (micros: number | null | undefined) => (micros ?? 0) / 1_000_000;

async function usersById(ids: string[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

/** Where AI tokens and money went over the last `days` days, plus this month's budget. */
export async function overview(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  const inPeriod = { createdAt: { gte: since } };

  const [monthMicros, byStatus, byKind, byUser, byDay, recentFailures, hitsByReason, hitsByUser] =
    await Promise.all([
      monthSpendMicros(),
      prisma.aiRun.groupBy({
        by: ['status'],
        where: inPeriod,
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      prisma.aiRun.groupBy({
        by: ['kind'],
        where: inPeriod,
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      prisma.aiRun.groupBy({
        by: ['userId'],
        where: inPeriod,
        _count: true,
        _sum: { costMicros: true },
        orderBy: [{ _sum: { costMicros: 'desc' } }, { _count: { userId: 'desc' } }],
        take: TOP_USERS,
      }),
      prisma.$queryRaw<{ day: Date; runs: bigint; micros: bigint | null }[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, count(*) AS runs, sum("costMicros") AS micros
        FROM "AiRun" WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1`),
      prisma.aiRun.findMany({
        where: { ...inPeriod, status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          kind: true,
          error: true,
          costMicros: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.aiLimitHit.groupBy({ by: ['reason'], where: inPeriod, _count: true }),
      prisma.aiLimitHit.groupBy({
        by: ['userId'],
        where: inPeriod,
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: TOP_USERS,
      }),
    ]);

  const users = await usersById([...byUser, ...hitsByUser].map((r) => r.userId));
  const sum = (key: 'inputTokens' | 'outputTokens' | 'costMicros') =>
    byStatus.reduce((n, r) => n + (r._sum[key] ?? 0), 0);
  const count = (status: string) => byStatus.find((r) => r.status === status)?._count ?? 0;
  const hits = (reason: string) => hitsByReason.find((r) => r.reason === reason)?._count ?? 0;

  return {
    days,
    model: env.ANTHROPIC_MODEL,
    month: {
      costUsd: usd(monthMicros),
      // 0 means "no cap".
      budgetUsd: env.AI_MONTHLY_BUDGET_USD,
    },
    totals: {
      runs: byStatus.reduce((n, r) => n + r._count, 0),
      done: count('done'),
      failed: count('failed'),
      processing: count('processing'),
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      costUsd: usd(sum('costMicros')),
    },
    byDay: byDay.map((d) => ({
      day: d.day.toISOString().slice(0, 10),
      runs: Number(d.runs),
      costUsd: usd(Number(d.micros ?? 0)),
    })),
    byKind: byKind.map((k) => ({
      kind: k.kind,
      runs: k._count,
      inputTokens: k._sum.inputTokens ?? 0,
      outputTokens: k._sum.outputTokens ?? 0,
      costUsd: usd(k._sum.costMicros),
    })),
    topUsers: byUser.map((u) => ({
      user: users.get(u.userId) ?? null,
      runs: u._count,
      costUsd: usd(u._sum.costMicros),
    })),
    recentFailures: recentFailures.map(({ costMicros, ...f }) => ({
      ...f,
      costUsd: usd(costMicros),
    })),
    limitHits: {
      daily: hits('daily'),
      budget: hits('budget'),
      topUsers: hitsByUser.map((h) => ({ user: users.get(h.userId) ?? null, hits: h._count })),
    },
  };
}
