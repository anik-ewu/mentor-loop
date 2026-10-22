import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings';
import { useAuth } from '../../auth/AuthContext';
import { BookingCard } from '../../components/BookingCard';
import { ButtonLink } from '../../components/Button';
import { ArrowRightIcon, PlusIcon } from '../../components/icons';
import { PulseDot } from '../../components/PulseDot';
import { CountUp, Countdown, EmptyState, Skeleton } from '../../components/ui';
import { formatLongDay, formatRange, isPast } from '../../lib/format';
import s from '../dashboard.module.css';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function UserHome() {
  const { user } = useAuth();
  const { data: bookings, isPending } = useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: bookingsApi.mine,
  });

  const upcoming = (bookings ?? [])
    .filter((b) => ['pending', 'confirmed'].includes(b.status) && !isPast(b.slot.startsAt))
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
  const next = upcoming[0];
  const count = (status: string) => (bookings ?? []).filter((b) => b.status === status).length;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>
            {greeting()}, {user?.name.split(' ')[0]} 👋
          </h1>
          <p>Here is what is coming up for you.</p>
        </div>
        <ButtonLink to="/app/book" variant="primary">
          <PlusIcon /> Book a session
        </ButtonLink>
      </div>

      {isPending ? (
        <Skeleton height={180} style={{ borderRadius: 24 }} />
      ) : next ? (
        <section className={s.hero}>
          <div>
            <span className={s.heroLabel}>
              <PulseDot color="#fff" size={8} /> Next session · {next.status}
            </span>
            <h2>{next.service.name}</h2>
            <p>
              {formatLongDay(next.slot.startsAt)} ·{' '}
              {formatRange(next.slot.startsAt, next.slot.endsAt)}
            </p>
          </div>
          <Countdown to={next.slot.startsAt} />
        </section>
      ) : (
        <EmptyState
          icon="🗓️"
          title="No upcoming sessions"
          text="Pick a service and a time that suits you. It takes less than a minute."
          action={
            <ButtonLink to="/app/book" variant="primary">
              Book your first session <ArrowRightIcon />
            </ButtonLink>
          }
        />
      )}

      <div className={s.stats} style={{ marginTop: 16 }}>
        {[
          ['Upcoming', upcoming.length],
          ['Confirmed', count('confirmed')],
          ['Completed', count('completed')],
          ['Total booked', bookings?.length ?? 0],
        ].map(([label, n]) => (
          <div key={label} className={s.stat}>
            <span>{label}</span>
            <strong>
              <CountUp value={n as number} />
            </strong>
          </div>
        ))}
      </div>

      {upcoming.length > 1 && (
        <>
          <div className={s.sectionTitle}>
            <h2>Also coming up</h2>
          </div>
          <div className={s.list}>
            {upcoming.slice(1, 4).map((b, i) => (
              <BookingCard
                key={b.id}
                booking={b}
                index={i}
                actions={
                  <ButtonLink to="/app/bookings" size="sm" variant="ghost">
                    Details
                  </ButtonLink>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
