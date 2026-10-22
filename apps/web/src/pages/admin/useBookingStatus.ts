import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings';
import type { BookingStatus } from '../../api/types';
import { useToast } from '../../components/Toast';

const MESSAGES: Record<string, string> = {
  confirmed: 'Booking confirmed',
  completed: 'Marked as completed. Nice work!',
  cancelled: 'Booking cancelled and the slot reopened',
};

/** Admin status change (confirm / complete / cancel) with toasts and cache refresh. */
export function useBookingStatus() {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<BookingStatus, 'pending'> }) =>
      bookingsApi.updateStatus(id, status),
    onSuccess: (_b, { status }) => {
      toast(MESSAGES[status]!);
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
}
