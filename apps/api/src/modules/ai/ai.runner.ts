import type { AiKind, Prisma, Role } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AiFailure, aiEnabled, type AiUsage } from './claude';

const DAY_MS = 86_400_000;
const STALE_MS = 5 * 60_000;

export const aiDisabled = () =>
  new AppError(503, 'AI_DISABLED', 'AI features are not available right now.');

/** Start of the current calendar month in UTC: the budget resets then. */
export const monthStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** What all AI runs have cost so far this month, in micro-dollars. */
export async function monthSpendMicros() {
  const { _sum } = await prisma.aiRun.aggregate({
    where: { createdAt: { gte: monthStart() } },
    _sum: { costMicros: true },
  });
  return _sum.costMicros ?? 0;
}

const budgetMicros = () => Math.round(env.AI_MONTHLY_BUDGET_USD * 1_000_000);

/**
 * Throws 503 when AI is off or this month's budget is spent (for everyone), and 429 when the
 * user has used today's quota. The real admin is exempt from the daily quota, but not the shared
 * demo admin anyone can sign in as.
 */
export async function assertCanRun(userId: string, role: Role) {
  if (!aiEnabled()) throw aiDisabled();

  if (budgetMicros() > 0 && (await monthSpendMicros()) >= budgetMicros()) {
    await prisma.aiLimitHit.create({ data: { userId, reason: 'budget' } });
    throw new AppError(
      503,
      'AI_BUDGET',
      'AI features are paused for the rest of this month. Please try again next month.',
    );
  }

  if (role === 'admin' && !env.DEMO_MODE) return;
  // Failed runs count only when they used tokens: a refusal or cut-off answer was still paid
  // for, but an outage or setup problem shouldn't use up the day.
  const used = await prisma.aiRun.count({
    where: {
      userId,
      createdAt: { gt: new Date(Date.now() - DAY_MS) },
      OR: [{ status: { not: 'failed' } }, { outputTokens: { gt: 0 } }],
    },
  });
  if (used >= env.AI_DAILY_LIMIT) {
    await prisma.aiLimitHit.create({ data: { userId, reason: 'daily' } });
    throw new AppError(429, 'AI_LIMIT', "You've used today's AI limit. Try again tomorrow.");
  }
}

interface RunSpec {
  userId: string;
  role: Role;
  kind: AiKind;
  input: Prisma.InputJsonValue;
  jobId?: string | null;
  sourceRunId?: string | null;
}

export interface RunOutput {
  result: Prisma.InputJsonValue;
  score?: number | null;
  usage?: AiUsage;
}

/** Background work still running; tests await it with settleRuns(). */
const pending = new Set<Promise<void>>();

export async function settleRuns() {
  await Promise.all([...pending]);
}

/**
 * Creates a `processing` run and returns it straight away; `work` runs in the background
 * and the row ends up `done` with the result or `failed` with a user-safe message.
 * Async because a long model call can outlast the hosting proxy's request timeout.
 */
export async function startRun(spec: RunSpec, work: () => Promise<RunOutput>) {
  await assertCanRun(spec.userId, spec.role);
  const run = await prisma.aiRun.create({
    data: {
      userId: spec.userId,
      kind: spec.kind,
      input: spec.input,
      jobId: spec.jobId ?? null,
      sourceRunId: spec.sourceRunId ?? null,
      model: env.ANTHROPIC_MODEL,
    },
  });

  const task = (async () => {
    try {
      const { result, score, usage } = await work();
      await prisma.aiRun.update({
        where: { id: run.id },
        data: { status: 'done', result, score: score ?? null, ...usage, completedAt: new Date() },
      });
    } catch (err) {
      if (!(err instanceof AiFailure)) console.error(`AI run ${run.id} failed:`, err);
      const error =
        err instanceof AiFailure ? err.message : 'Something went wrong. Please try again.';
      const usage = err instanceof AiFailure ? err.usage : undefined;
      // The row may have been deleted while it was running.
      await prisma.aiRun
        .updateMany({
          where: { id: run.id },
          data: { status: 'failed', error, ...usage, completedAt: new Date() },
        })
        .catch((e) => console.error(`Could not mark AI run ${run.id} failed:`, e));
    }
  })();
  pending.add(task);
  void task.finally(() => pending.delete(task));

  return run;
}

/** On boot: runs left `processing` by a restart will never finish, so fail them. */
export async function failStaleRuns() {
  const { count } = await prisma.aiRun.updateMany({
    where: { status: 'processing', createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: {
      status: 'failed',
      error: 'This request was interrupted. Please try again.',
      completedAt: new Date(),
    },
  });
  if (count) console.log(`Marked ${count} interrupted AI run(s) as failed`);
}
