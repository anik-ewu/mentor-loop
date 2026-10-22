import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { bookingsApi } from '../../api/bookings';
import { ApiError } from '../../api/client';
import { servicesApi } from '../../api/services';
import { slotsApi } from '../../api/slots';
import type { Booking } from '../../api/types';
import { Button, ButtonLink } from '../../components/Button';
import { ArrowRightIcon, CheckIcon } from '../../components/icons';
import { PulseDot } from '../../components/PulseDot';
import { useToast } from '../../components/Toast';
import { EmptyState, Field, Skeleton } from '../../components/ui';
import { formatLongDay, formatRange, formatTime, groupByDay } from '../../lib/format';
import s from './Book.module.css';

const STEPS = ['Service', 'Time', 'Details'] as const;

export function Book() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();

  const services = useQuery({ queryKey: ['services', 'active'], queryFn: servicesApi.listActive });
  const slots = useQuery({ queryKey: ['slots', 'open'], queryFn: slotsApi.listOpen });

  const [step, setStep] = useState(params.get('service') ? 1 : 0);
  const [serviceId, setServiceId] = useState<string | null>(params.get('service'));
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [details, setDetails] = useState({ note: '', cvUrl: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [booked, setBooked] = useState<Booking | null>(null);

  const days = useMemo(() => groupByDay(slots.data ?? [], (sl) => sl.startsAt), [slots.data]);
  const activeDay = day && days.has(day) ? day : (days.keys().next().value ?? null);
  const service = services.data?.find((sv) => sv.id === serviceId);
  const slot = slots.data?.find((sl) => sl.id === slotId);

  const book = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        serviceId: serviceId!,
        slotId: slotId!,
        note: details.note || undefined,
        cvUrl: details.cvUrl || undefined,
      }),
    onSuccess: (booking) => {
      setBooked(booking);
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        // Someone else took the slot: refresh times and send the user back to pick again.
        toast(e.message, 'error');
        setSlotId(null);
        setStep(1);
        qc.invalidateQueries({ queryKey: ['slots'] });
      } else if (e instanceof ApiError && Object.keys(e.fields).length) {
        setFieldErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0]!])));
      } else {
        toast(e.message, 'error');
      }
    },
  });

  if (booked) {
    return (
      <div className={s.success}>
        <div className={s.successIcon}>
          <CheckIcon />
        </div>
        <h1>You're booked!</h1>
        <p className="muted">
          <strong>{booked.service.name}</strong> on {formatLongDay(booked.slot.startsAt)} at{' '}
          {formatTime(booked.slot.startsAt)}. You'll see it as confirmed once the mentor accepts.
        </p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <ButtonLink to="/app/bookings" variant="primary">
            View my sessions
          </ButtonLink>
          <ButtonLink to="/app">Back to home</ButtonLink>
        </div>
      </div>
    );
  }

  const canNext = (step === 0 && !!service) || (step === 1 && !!slot);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    book.mutate();
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Book a session</h1>
          <p>Three quick steps and you're in.</p>
        </div>
      </div>

      <nav className={s.steps} aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <span key={label} style={{ display: 'contents' }}>
            {i > 0 && <span className={s.connector} />}
            <button
              type="button"
              className={`${s.stepPill} ${i === step ? s.current : ''} ${i < step ? s.done : ''}`}
              onClick={() => i < step && setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              disabled={i > step}
            >
              <b>{i < step ? '✓' : i + 1}</b>
              {label}
            </button>
          </span>
        ))}
      </nav>

      <div className={s.layout}>
        <div>
          {step === 0 && (
            <div className={`${s.panel} ${s.choices}`} key="service">
              {services.isPending && [0, 1].map((i) => <Skeleton key={i} height={120} />)}
              {services.data?.map((sv) => (
                <button
                  key={sv.id}
                  type="button"
                  className={s.choice}
                  aria-pressed={sv.id === serviceId}
                  onClick={() => setServiceId(sv.id)}
                  onDoubleClick={() => {
                    setServiceId(sv.id);
                    setStep(1);
                  }}
                >
                  <span className={s.check}>
                    <CheckIcon width={14} height={14} />
                  </span>
                  <h3>{sv.name}</h3>
                  <p>{sv.description}</p>
                  <span className="subtle">⏱ {sv.durationMin} min</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className={s.panel} key="time">
              {slots.isPending && <Skeleton height={160} />}
              {!slots.isPending && days.size === 0 && (
                <EmptyState
                  icon="⏳"
                  title="No open slots right now"
                  text="New times are added every week. Please check back soon."
                />
              )}
              {days.size > 0 && (
                <>
                  <div className={s.days} role="group" aria-label="Choose a day">
                    {[...days.entries()].map(([key, list]) => {
                      const d = new Date(list[0]!.startsAt);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={s.day}
                          aria-pressed={key === activeDay}
                          onClick={() => setDay(key)}
                        >
                          <small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small>
                          <strong>{d.getDate()}</strong>
                          <span>{list.length} open</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeDay && (
                    <>
                      <p className="row muted" style={{ gap: 8 }}>
                        <PulseDot size={7} /> Available on{' '}
                        {formatLongDay(days.get(activeDay)![0]!.startsAt)}
                      </p>
                      <div
                        className={s.times}
                        role="group"
                        aria-label="Choose a time"
                        key={activeDay}
                      >
                        {days.get(activeDay)!.map((sl, i) => (
                          <button
                            key={sl.id}
                            type="button"
                            className={s.time}
                            aria-pressed={sl.id === slotId}
                            onClick={() => setSlotId(sl.id)}
                            style={{ animationDelay: `${i * 40}ms` }}
                          >
                            {formatTime(sl.startsAt)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <form
              id="book-form"
              className={`${s.panel} card stack`}
              key="details"
              onSubmit={submit}
              noValidate
            >
              <Field
                label="What would you like to focus on?"
                name="note"
                multiline
                placeholder="e.g. I'm applying for backend roles and want feedback on my project section."
                value={details.note}
                onChange={(e) => setDetails((d) => ({ ...d, note: e.target.value }))}
                error={fieldErrors.note}
                hint="Optional, but it helps make the session more useful."
                autoFocus
              />
              <Field
                label="Link to your CV"
                name="cvUrl"
                type="url"
                placeholder="https://drive.google.com/…"
                value={details.cvUrl}
                onChange={(e) => setDetails((d) => ({ ...d, cvUrl: e.target.value }))}
                error={fieldErrors.cvUrl}
                hint="Optional. Google Drive, Dropbox or any public link."
              />
            </form>
          )}

          <div className={s.nav}>
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                ← Back
              </Button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              // Distinct keys: reusing one <button> would turn the "Continue" click into a form submit.
              <Button
                key="next"
                variant="primary"
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
              >
                Continue <ArrowRightIcon />
              </Button>
            ) : (
              <Button
                key="submit"
                variant="primary"
                type="submit"
                form="book-form"
                loading={book.isPending}
              >
                Confirm booking
              </Button>
            )}
          </div>
        </div>

        <aside className={`card ${s.summary}`} aria-label="Booking summary">
          <h3 style={{ fontSize: 16 }}>Your booking</h3>
          <dl>
            <dt>Service</dt>
            <dd>{service?.name ?? '—'}</dd>
            <dt>Duration</dt>
            <dd>{service ? `${service.durationMin} min` : '—'}</dd>
            <dt>Date</dt>
            <dd>{slot ? formatLongDay(slot.startsAt) : '—'}</dd>
            <dt>Time</dt>
            <dd>{slot ? formatRange(slot.startsAt, slot.endsAt) : '—'}</dd>
          </dl>
          <p className="subtle">Free to cancel any time before the session.</p>
        </aside>
      </div>
    </div>
  );
}
