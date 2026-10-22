import type { ReactNode } from 'react';
import type { Booking } from '../api/types';
import { formatRange, isPast } from '../lib/format';
import { ClockIcon } from './icons';
import { Avatar, StatusBadge } from './ui';
import s from './BookingCard.module.css';

interface Props {
  booking: Booking;
  showUser?: boolean;
  actions?: ReactNode;
  index?: number;
}

export function BookingCard({ booking, showUser, actions, index = 0 }: Props) {
  const start = new Date(booking.slot.startsAt);
  const faded = booking.status === 'cancelled' || isPast(booking.slot.endsAt);

  return (
    <article
      className={`${s.card} ${faded ? s.muted : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className={s.date} aria-hidden>
        <small>{start.toLocaleDateString(undefined, { month: 'short' })}</small>
        <strong>{start.getDate()}</strong>
      </div>
      <div className={s.body}>
        <div className={s.title}>
          <h3>{booking.service.name}</h3>
          <StatusBadge status={booking.status} />
        </div>
        <div className={s.meta}>
          <span>
            <ClockIcon width={14} height={14} />
            {start.toLocaleDateString(undefined, { weekday: 'short' })},{' '}
            {formatRange(booking.slot.startsAt, booking.slot.endsAt)}
          </span>
          {showUser && (
            <span>
              <Avatar name={booking.user.name} src={booking.user.avatarUrl} size={18} />
              {booking.user.name} · {booking.user.email}
            </span>
          )}
          {booking.cvUrl && (
            <a href={booking.cvUrl} target="_blank" rel="noreferrer">
              View CV ↗
            </a>
          )}
        </div>
        {booking.note && (
          <p className={s.note} title={booking.note}>
            “{booking.note}”
          </p>
        )}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </article>
  );
}
