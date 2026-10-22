import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings';
import type { Booking } from '../../api/types';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useToast } from '../../components/Toast';
import { formatDay, formatTime } from '../../lib/format';

/** Cancel flow with a confirm dialog. Render `modal` somewhere in the page. */
export function useCancelBooking() {
  const qc = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<Booking | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => bookingsApi.cancel(id),
    onSuccess: () => {
      toast('Booking cancelled. The slot is free for someone else.');
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
      setTarget(null);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const modal = target && (
    <ConfirmModal
      title="Cancel this session?"
      text={`${target.service.name} on ${formatDay(target.slot.startsAt)} at ${formatTime(target.slot.startsAt)} will be cancelled.`}
      confirmLabel="Cancel session"
      cancelLabel="Keep it"
      danger
      loading={mutation.isPending}
      onConfirm={() => mutation.mutate(target.id)}
      onClose={() => setTarget(null)}
    />
  );

  return { askCancel: setTarget, modal };
}
