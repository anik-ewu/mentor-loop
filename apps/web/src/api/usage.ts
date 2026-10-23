import { api } from './client';
import type { AiUsage } from './types';

export const usageApi = {
  get: (days: number) => api<AiUsage>(`/admin/usage?days=${days}`),
};
