import type { GoalMetric, WeeklyGoal } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { dayKey, nextWeek, startOfDay, startOfWeek } from '../../lib/timezone';
import type { SetGoalsInput } from './goals.schema';

/** How far back streaks look. */
const STREAK_WEEKS = 52;
/** Widest gap between two timezones' Mondays, so a timezone change keeps this week's goals. */
const TZ_SLACK_MS = 26 * 3_600_000;

/** Goals stored for this week, even if they were saved under a different timezone. */
const thisWeek = (userId: string, weekStart: Date) => ({
  userId,
  weekStart: {
    gt: new Date(weekStart.getTime() - TZ_SLACK_MS),
    lt: new Date(weekStart.getTime() + TZ_SLACK_MS),
  },
});

/** One thing the user did; `metric` is null for activity that only counts for the daily streak. */
interface Activity {
  metric: GoalMetric | null;
  at: Date;
}

const userTimezone = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }))
    .timezone;

/** Everything goals and streaks count, read from the data itself so no counter can drift. */
async function loadActivity(userId: string, since: Date): Promise<Activity[]> {
  const [jobs, events, runs] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { userId, appliedAt: { gte: since } },
      select: { appliedAt: true },
    }),
    prisma.jobEvent.findMany({
      where: { job: { userId }, createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    }),
    prisma.aiRun.findMany({
      where: { userId, status: 'done', completedAt: { gte: since } },
      select: { kind: true, completedAt: true },
    }),
  ]);
  return [
    ...jobs.map((j) => ({ metric: 'applications' as const, at: j.appliedAt! })),
    ...events.map((e) => ({
      metric:
        e.type === 'interview'
          ? ('interviews' as const)
          : e.type === 'follow_up'
            ? ('follow_ups' as const)
            : null,
      at: e.createdAt,
    })),
    ...runs.map((r) => ({
      metric:
        r.kind === 'resume_review'
          ? ('resume_matches' as const)
          : r.kind === 'interview_questions'
            ? ('interview_preps' as const)
            : null,
      at: r.completedAt!,
    })),
  ];
}

function weekProgress(goals: WeeklyGoal[], activity: Activity[], start: Date, end: Date) {
  const inWeek = activity.filter((a) => a.at >= start && a.at < end);
  const rows = goals.map((g) => {
    const actual = inWeek.filter((a) => a.metric === g.metric).length;
    return { metric: g.metric, target: g.target, actual, met: actual >= g.target };
  });
  return { goals: rows, allMet: rows.length > 0 && rows.every((r) => r.met) };
}

/** This week's goals; with none set yet, last set week's targets are copied forward. */
async function currentGoals(userId: string, weekStart: Date) {
  const goals = await prisma.weeklyGoal.findMany({ where: thisWeek(userId, weekStart) });
  if (goals.length) return { goals, carriedOver: false };

  const last = await prisma.weeklyGoal.findFirst({
    where: { userId, weekStart: { lte: new Date(weekStart.getTime() - TZ_SLACK_MS) } },
    orderBy: { weekStart: 'desc' },
  });
  if (!last) return { goals: [], carriedOver: false };
  const previous = await prisma.weeklyGoal.findMany({
    where: { userId, weekStart: last.weekStart },
  });
  await prisma.weeklyGoal.createMany({
    data: previous.map((g) => ({ userId, weekStart, metric: g.metric, target: g.target })),
    skipDuplicates: true,
  });
  return {
    goals: await prisma.weeklyGoal.findMany({ where: { userId, weekStart } }),
    carriedOver: true,
  };
}

/** Goals grouped by the local date of their week, so a timezone change can't misfile them. */
async function goalsByWeek(userId: string, since: Date, tz: string) {
  const all = await prisma.weeklyGoal.findMany({
    where: { userId, weekStart: { gte: since } },
  });
  const map = new Map<string, WeeklyGoal[]>();
  for (const g of all) {
    const key = dayKey(g.weekStart, tz);
    map.set(key, [...(map.get(key) ?? []), g]);
  }
  return map;
}

function dailyStreak(activity: Activity[], now: Date, tz: string) {
  const days = new Set(activity.map((a) => dayKey(a.at, tz)));
  const activeToday = days.has(dayKey(now, tz));
  // With nothing yet today, the streak still runs from yesterday.
  let streak = 0;
  for (let back = activeToday ? 0 : 1; back < 400; back++) {
    if (!days.has(dayKey(startOfDay(now, tz, back), tz))) break;
    streak++;
  }
  return { streak, activeToday };
}

export async function getCurrent(userId: string, now = new Date()) {
  const tz = await userTimezone(userId);
  const weekStart = startOfWeek(now, tz);
  const weekEnd = nextWeek(weekStart, tz);
  const since = startOfWeek(now, tz, STREAK_WEEKS);

  const [{ goals, carriedOver }, activity, pastGoals] = await Promise.all([
    currentGoals(userId, weekStart),
    loadActivity(userId, since),
    goalsByWeek(userId, since, tz),
  ]);
  const progress = weekProgress(goals, activity, weekStart, weekEnd);

  // Weekly streak: completed weeks in a row, going back from last week.
  let weekly = 0;
  for (let back = 1; back <= STREAK_WEEKS; back++) {
    const start = startOfWeek(now, tz, back);
    const week = weekProgress(
      pastGoals.get(dayKey(start, tz)) ?? [],
      activity,
      start,
      nextWeek(start, tz),
    );
    if (!week.allMet) break;
    weekly++;
  }
  if (progress.allMet) weekly++;

  const daily = dailyStreak(activity, now, tz);
  return {
    timezone: tz,
    weekStart,
    weekEnd,
    carriedOver,
    ...progress,
    streaks: { weekly, daily: daily.streak, activeToday: daily.activeToday },
  };
}

export async function setCurrent(userId: string, input: SetGoalsInput, now = new Date()) {
  const tz = await userTimezone(userId);
  const weekStart = startOfWeek(now, tz);
  await prisma.$transaction([
    prisma.weeklyGoal.deleteMany({ where: thisWeek(userId, weekStart) }),
    prisma.weeklyGoal.createMany({
      data: input.goals.map((g) => ({ userId, weekStart, metric: g.metric, target: g.target })),
    }),
  ]);
  return getCurrent(userId, now);
}

export async function history(userId: string, weeks: number, now = new Date()) {
  const tz = await userTimezone(userId);
  const since = startOfWeek(now, tz, weeks - 1);
  const [activity, goals] = await Promise.all([
    loadActivity(userId, since),
    goalsByWeek(userId, since, tz),
  ]);
  return Array.from({ length: weeks }, (_, back) => {
    const start = startOfWeek(now, tz, back);
    return {
      weekStart: start,
      ...weekProgress(goals.get(dayKey(start, tz)) ?? [], activity, start, nextWeek(start, tz)),
    };
  });
}
