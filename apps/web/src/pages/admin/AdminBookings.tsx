import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings';
import type { BookingStatus } from '../../api/types';
import { BookingCard } from '../../components/BookingCard';
import { EmptyState, Skeleton, usePageTitle } from '../../components/ui';
import { BookingActions } from './BookingActions';
import s from '../dashboard.module.css';

const FILTERS: (BookingStatus | 'all')[] = [
  'all',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
];

export function AdminBookings() {
  usePageTitle('Bookings');
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all');
  const { data, isPending } = useQuery({
    queryKey: ['bookings', 'admin', filter],
    queryFn: () => bookingsApi.listAll(filter === 'all' ? undefined : filter),
  });

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Bookings</h1>
          <p>Confirm requests, complete sessions and keep track of everything.</p>
        </div>
      </div>

      <div className={s.tabs} role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={s.tab}
            onClick={() => setFilter(f)}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
      </div>

      <div className={s.list}>
        {isPending &&
          [0, 1, 2].map((i) => <Skeleton key={i} height={94} style={{ borderRadius: 20 }} />)}
        {data?.length === 0 && (
          <EmptyState
            icon="🗂️"
            title="No bookings here"
            text="Bookings with this status will show up here."
          />
        )}
        {data?.map((b, i) => (
          <BookingCard
            key={b.id}
            booking={b}
            index={i}
            showUser
            actions={<BookingActions booking={b} />}
          />
        ))}
      </div>
    </div>
  );
}
