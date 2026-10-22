import type { Booking } from '../../api/types';
import { Button } from '../../components/Button';
import { useBookingStatus } from './useBookingStatus';

/** The next sensible actions for a booking, based on its status. */
export function BookingActions({ booking }: { booking: Booking }) {
  const mutation = useBookingStatus();
  const busy = mutation.isPending && mutation.variables?.id === booking.id;
  const set = (status: 'confirmed' | 'completed' | 'cancelled') =>
    mutation.mutate({ id: booking.id, status });

  if (booking.status === 'pending') {
    return (
      <>
        <Button size="sm" variant="ghost" onClick={() => set('cancelled')} disabled={busy}>
          Decline
        </Button>
        <Button size="sm" variant="primary" onClick={() => set('confirmed')} loading={busy}>
          Confirm
        </Button>
      </>
    );
  }
  if (booking.status === 'confirmed') {
    return (
      <>
        <Button size="sm" variant="ghost" onClick={() => set('cancelled')} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => set('completed')} loading={busy}>
          Mark complete
        </Button>
      </>
    );
  }
  return null;
}
