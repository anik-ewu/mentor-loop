import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slotsApi } from '../../api/slots';
import { Button } from '../../components/Button';
import { TrashIcon } from '../../components/icons';
import { PulseDot } from '../../components/PulseDot';
import { useToast } from '../../components/Toast';
import { EmptyState, Skeleton, usePageTitle } from '../../components/ui';
import { dayKey, formatLongDay, formatRange, groupByDay } from '../../lib/format';
import s from './admin.module.css';

const TIMES = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];
const DURATIONS = [30, 45, 60, 90];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dayKey(d);
};

export function Availability() {
  usePageTitle('Availability');
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(tomorrow);
  const [times, setTimes] = useState<string[]>([]);
  const [duration, setDuration] = useState(45);

  const slots = useQuery({ queryKey: ['slots', 'admin'], queryFn: slotsApi.listUpcoming });
  const grouped = useMemo(() => groupByDay(slots.data ?? [], (sl) => sl.startsAt), [slots.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['slots'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        times.map((t) => {
          const startsAt = new Date(`${date}T${t}`);
          const endsAt = new Date(startsAt.getTime() + duration * 60_000);
          return slotsApi.create({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          });
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      return {
        added: results.length - failed.length,
        firstError: failed[0]?.reason as Error | undefined,
      };
    },
    onSuccess: ({ added, firstError }) => {
      if (added) toast(`Added ${added} slot${added > 1 ? 's' : ''}`);
      if (firstError) toast(`Some slots were skipped: ${firstError.message}`, 'error');
      setTimes([]);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: slotsApi.remove,
    onSuccess: () => {
      toast('Slot removed');
      refresh();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const toggleTime = (t: string) =>
    setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort()));

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Availability</h1>
          <p>Open time slots that clients can book.</p>
        </div>
      </div>

      <div className={s.layout}>
        <div className={`card stack ${s.sticky}`}>
          <h3 style={{ fontSize: 17 }}>Add slots</h3>
          <div className="field">
            <label htmlFor="slot-date">Date</label>
            <input
              id="slot-date"
              className="input"
              type="date"
              min={dayKey(new Date())}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <span className={s.label}>Start times</span>
            <div className={s.chips} role="group" aria-label="Start times">
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={s.chip}
                  aria-pressed={times.includes(t)}
                  onClick={() => toggleTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={s.label}>Duration</span>
            <div className={s.chips} role="group" aria-label="Duration">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={s.chip}
                  aria-pressed={duration === d}
                  onClick={() => setDuration(d)}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="primary"
            block
            disabled={!date || times.length === 0}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            {times.length
              ? `Add ${times.length} slot${times.length > 1 ? 's' : ''}`
              : 'Pick start times'}
          </Button>
        </div>

        <div>
          {slots.isPending && <Skeleton height={200} />}
          {slots.data?.length === 0 && (
            <EmptyState
              icon="🗓️"
              title="No upcoming slots"
              text="Add a few times on the left. Clients see them right away."
            />
          )}
          {[...grouped.entries()].map(([key, list], gi) => (
            <section
              key={key}
              className={s.dayGroup}
              style={{ animationDelay: `${Math.min(gi, 6) * 60}ms` }}
            >
              <h3>{formatLongDay(list[0]!.startsAt)}</h3>
              <div className={s.slotGrid}>
                {list.map((slot) => {
                  const booking = slot.bookings[0];
                  return (
                    <div key={slot.id} className={`${s.slot} ${booking ? s.booked : ''}`}>
                      {booking ? <PulseDot color="var(--brand)" size={8} /> : <PulseDot size={8} />}
                      <div>
                        <strong>{formatRange(slot.startsAt, slot.endsAt)}</strong>
                        <small>
                          {booking ? `${booking.user.name} · ${booking.service.name}` : 'Open'}
                        </small>
                      </div>
                      {!booking && (
                        <button
                          className={s.iconBtn}
                          aria-label="Delete slot"
                          onClick={() => remove.mutate(slot.id)}
                          disabled={remove.isPending && remove.variables === slot.id}
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
