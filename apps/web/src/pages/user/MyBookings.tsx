import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings';
import type { Booking } from '../../api/types';
import { BookingCard } from '../../components/BookingCard';
import { Button, ButtonLink } from '../../components/Button';
import { PlusIcon } from '../../components/icons';
import { EmptyState, Skeleton } from '../../components/ui';
import { isPast } from '../../lib/format';
import { useCancelBooking } from './useCancelBooking';
import s from '../dashboard.module.css';

type Tab = 'upcoming' | 'past';

const isUpcoming = (b: Booking) =>
  ['pending', 'confirmed'].includes(b.status) && !isPast(b.slot.startsAt);

export function MyBookings() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const { data: bookings, isPending } = useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: bookingsApi.mine,
  });
  const { askCancel, modal } = useCancelBooking();

  const upcoming = (bookings ?? [])
    .filter(isUpcoming)
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
  const past = (bookings ?? []).filter((b) => !isUpcoming(b));
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>My sessions</h1>
          <p>Everything you have booked, in one place.</p>
        </div>
        <ButtonLink to="/app/book" variant="primary">
          <PlusIcon /> New booking
        </ButtonLink>
      </div>

      <div className={s.tabs} role="tablist">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={s.tab}
            onClick={() => setTab(t)}
          >
            {t === 'upcoming' ? 'Upcoming' : 'Past & cancelled'}
            <span className={s.count}>{(t === 'upcoming' ? upcoming : past).length}</span>
          </button>
        ))}
      </div>

      <div className={s.list}>
        {isPending &&
          [0, 1, 2].map((i) => <Skeleton key={i} height={94} style={{ borderRadius: 20 }} />)}
        {!isPending && shown.length === 0 && (
          <EmptyState
            icon={tab === 'upcoming' ? '✨' : '📚'}
            title={tab === 'upcoming' ? 'Nothing booked yet' : 'No past sessions'}
            text={
              tab === 'upcoming'
                ? 'Your upcoming sessions will show up here.'
                : 'Completed and cancelled sessions will show up here.'
            }
            action={
              tab === 'upcoming' && (
                <ButtonLink to="/app/book" variant="primary">
                  Book a session
                </ButtonLink>
              )
            }
          />
        )}
        {shown.map((b, i) => (
          <BookingCard
            key={b.id}
            booking={b}
            index={i}
            actions={
              isUpcoming(b) && (
                <Button size="sm" variant="danger" onClick={() => askCancel(b)}>
                  Cancel
                </Button>
              )
            }
          />
        ))}
      </div>
      {modal}
    </div>
  );
}
