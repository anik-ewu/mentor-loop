import { api } from './client';
import type { Booking, BookingStatus, Stats } from './types';

type BookingRes = { booking: Booking };

export const bookingsApi = {
  create: (body: {
    slotId: string;
    serviceId: string;
    note?: string;
    cvUrl?: string;
    resumeReviewId?: string;
  }) => api<BookingRes>('/bookings', 'POST', body).then((r) => r.booking),
  mine: () => api<{ bookings: Booking[] }>('/bookings/mine').then((r) => r.bookings),
  cancel: (id: string) => api<BookingRes>(`/bookings/${id}/cancel`, 'POST').then((r) => r.booking),
  listAll: (status?: BookingStatus) =>
    api<{ bookings: Booking[] }>(`/bookings${status ? `?status=${status}` : ''}`).then(
      (r) => r.bookings,
    ),
  updateStatus: (id: string, status: Exclude<BookingStatus, 'pending'>) =>
    api<BookingRes>(`/bookings/${id}/status`, 'PATCH', { status }).then((r) => r.booking),
  stats: () => api<Stats>('/bookings/stats'),
};
