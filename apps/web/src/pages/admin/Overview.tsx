import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings';
import { useAuth } from '../../auth/AuthContext';
import { BookingCard } from '../../components/BookingCard';
import { ButtonLink } from '../../components/Button';
import { PulseDot } from '../../components/PulseDot';
import { CountUp, Countdown, EmptyState, Skeleton } from '../../components/ui';
import { formatLongDay, formatRange } from '../../lib/format';
import { BookingActions } from './BookingActions';
import s from '../dashboard.module.css';

export function Overview() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats'], queryFn: bookingsApi.stats });
  const pending = useQuery({
    queryKey: ['bookings', 'pending'],
    queryFn: () => bookingsApi.listAll('pending'),
  });
  const next = stats.data?.nextBooking;

  const cards = [
    ['Pending', stats.data?.pending],
    ['Confirmed', stats.data?.confirmed],
    ['Open slots', stats.data?.openSlots],
    ['Clients', stats.data?.users],
  ] as const;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name.split(' ')[0]}</h1>
          <p>Your mentoring business at a glance.</p>
        </div>
        <ButtonLink to="/admin/slots" variant="primary">
          Add availability
        </ButtonLink>
      </div>

      <div className={s.stats}>
        {cards.map(([label, n]) => (
          <div key={label} className={s.stat}>
            <span>{label}</span>
            <strong>
              {n === undefined ? <Skeleton height={30} width={48} /> : <CountUp value={n} />}
            </strong>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {stats.isPending ? (
          <Skeleton height={160} style={{ borderRadius: 24 }} />
        ) : next ? (
          <section className={s.hero}>
            <div>
              <span className={s.heroLabel}>
                <PulseDot color="#fff" size={8} /> Next session · {next.status}
              </span>
              <h2>
                {next.service.name} with {next.user.name}
              </h2>
              <p>
                {formatLongDay(next.slot.startsAt)} ·{' '}
                {formatRange(next.slot.startsAt, next.slot.endsAt)}
              </p>
            </div>
            <Countdown to={next.slot.startsAt} />
          </section>
        ) : (
          <EmptyState
            icon="☕"
            title="No upcoming sessions"
            text="Add some availability so clients can book you."
          />
        )}
      </div>

      <div className={s.sectionTitle}>
        <h2>Needs your attention</h2>
        <ButtonLink to="/admin/bookings" size="sm" variant="ghost">
          All bookings →
        </ButtonLink>
      </div>
      <div className={s.list}>
        {pending.isPending && <Skeleton height={94} style={{ borderRadius: 20 }} />}
        {pending.data?.length === 0 && (
          <EmptyState
            icon="🎉"
            title="All caught up"
            text="New booking requests will appear here."
          />
        )}
        {pending.data?.map((b, i) => (
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
