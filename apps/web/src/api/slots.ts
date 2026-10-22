import { api } from './client';
import type { AdminSlot, Slot } from './types';

export const slotsApi = {
  listOpen: () => api<{ slots: Slot[] }>('/slots').then((r) => r.slots),
  listUpcoming: () => api<{ slots: AdminSlot[] }>('/slots/all').then((r) => r.slots),
  create: (body: { startsAt: string; endsAt: string }) =>
    api<{ slot: Slot }>('/slots', 'POST', body).then((r) => r.slot),
  remove: (id: string) => api<void>(`/slots/${id}`, 'DELETE'),
};
