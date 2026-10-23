import { api } from './client';
import type { CurrentGoals, GoalMetric, GoalWeek } from './types';

export const goalsApi = {
  current: () => api<CurrentGoals>('/goals/current'),
  setCurrent: (goals: { metric: GoalMetric; target: number }[]) =>
    api<CurrentGoals>('/goals/current', 'PUT', { goals }),
  history: (weeks = 8) =>
    api<{ weeks: GoalWeek[] }>(`/goals/history?weeks=${weeks}`).then((r) => r.weeks),
};
