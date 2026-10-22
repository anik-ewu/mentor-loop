import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { servicesApi } from '../api/services';
import { slotsApi } from '../api/slots';
import { DemoButtons } from '../auth/DemoButtons';
import { homeFor, useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../components/Button';
import { ArrowRightIcon } from '../components/icons';
import { CursorGlow, Reveal, TiltCard } from '../components/Interactive';
import { PulseDot } from '../components/PulseDot';
import { Skeleton } from '../components/ui';
import { dayKey, formatDay, formatTime, groupByDay } from '../lib/format';
import s from './Landing.module.css';

const SERVICE_ICONS = ['📄', '🧭', '🎯', '💡', '🚀'];

const STEPS = [
  {
    title: 'Choose a session',
    text: 'Resume review, career strategy or interview practice. Each one has a clear focus and length.',
  },
  {
    title: 'Pick a time',
    text: 'See live availability and book the slot that suits you. No back-and-forth emails.',
  },
  {
    title: 'Get your plan',
    text: 'Meet over video, get honest feedback, and leave with next steps you can act on right away.',
  },
];

const FAQ = [
  {
    q: 'Who is MentorLoop for?',
    a: 'Students, graduates and working professionals who want a stronger CV, a clearer career direction, or practice before an important interview.',
  },
  {
    q: 'How do sessions work?',
    a: 'Sessions are 1:1 over video. Once your booking is confirmed, your mentor shares the call details and you can see everything in your dashboard.',
  },
  {
    q: 'Can I cancel or reschedule?',
    a: 'Yes. Cancel from "My sessions" any time before the session starts, then book a new time that suits you better.',
  },
  {
    q: 'Do I need an account?',
    a: 'Yes, a free account keeps all your bookings in one place. Sign up with email or Google in a few seconds.',
  },
  {
    q: 'What should I prepare?',
    a: 'Add a link to your CV and a short note about your goals when you book. The more context you share, the more useful the session.',
  },
];

const WEEK_DAYS = 7;

/** Live card: open slots per day for the next 7 days, plus the next few times. */
function WeekAvailability() {
  const { data: slots, isPending } = useQuery({
    queryKey: ['slots', 'open'],
    queryFn: slotsApi.listOpen,
  });

  const perDay = groupByDay(slots ?? [], (sl) => sl.startsAt);
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return { date, count: perDay.get(dayKey(date))?.length ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  const weekTotal = days.reduce((sum, d) => sum + d.count, 0);
  const next = slots?.slice(0, 3) ?? [];

  return (
    <div className={s.preview}>
      <div className={s.previewCard}>
        <div className={s.previewHead}>
          <div>
            <strong>This week</strong>
            <span className="subtle">Open times, updated live</span>
          </div>
          <span className={s.liveTag}>
            <PulseDot size={8} /> Live
          </span>
        </div>

        <div
          className={s.week}
          role="img"
          aria-label={`${weekTotal} open slots in the next 7 days`}
        >
          {days.map(({ date, count }, i) => (
            <div key={i} className={s.weekDay} title={`${count} open`}>
              <div className={s.barTrack}>
                {!isPending && (
                  <div
                    className={`${s.bar} ${count === 0 ? s.barEmpty : ''}`}
                    style={{
                      height: `${count ? Math.max(18, (count / max) * 100) : 6}%`,
                      animationDelay: `${300 + i * 70}ms`,
                    }}
                  />
                )}
              </div>
              <span className={i === 0 ? s.today : undefined}>
                {i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
            </div>
          ))}
        </div>

        <p className="subtle" style={{ marginBottom: 8 }}>
          Next available
        </p>
        <div className={s.slotList}>
          {isPending && [0, 1, 2].map((i) => <Skeleton key={i} height={46} />)}
          {!isPending && next.length === 0 && (
            <p className="muted">New times are added every week.</p>
          )}
          {next.map((slot, i) => (
            <div
              key={slot.id}
              className={s.slotItem}
              style={{ animationDelay: `${700 + i * 90}ms` }}
            >
              <strong>{formatDay(slot.startsAt)}</strong>
              <span>{formatTime(slot.startsAt)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={s.floatBadge}>
        <b>✓</b> {slots ? `${slots.length} open slots` : 'Checking times…'}
      </div>
    </div>
  );
}

export function Landing() {
  const { user } = useAuth();
  const services = useQuery({ queryKey: ['services', 'active'], queryFn: servicesApi.listActive });
  const bookTo = user ? (user.role === 'admin' ? homeFor(user) : '/app/book') : '/signup';

  return (
    <>
      <CursorGlow className={s.hero}>
        <div className={s.blobs} aria-hidden>
          <div className={`${s.blob} ${s.blobA}`} />
          <div className={`${s.blob} ${s.blobB}`} />
        </div>
        <div className={`container ${s.heroGrid}`}>
          <div className="animate-in">
            <span className={s.eyebrow}>
              <PulseDot size={8} /> Now booking 1:1 sessions
            </span>
            <h1 className={s.title}>
              Career mentoring that <span className="gradient-text">moves you forward</span>
            </h1>
            <p className={s.lead}>
              Book a 1:1 session for a resume review, a career strategy call or a mock interview.
              Pick a time that suits you, share your goals, and leave with a clear plan.
            </p>
            <div className={s.ctas}>
              <ButtonLink to={bookTo} variant="primary" size="lg">
                Book a session <ArrowRightIcon />
              </ButtonLink>
              <ButtonLink to="/#services" size="lg" variant="ghost">
                See services
              </ButtonLink>
            </div>
            {!user && (
              <div className={s.demo}>
                <DemoButtons size="sm" />
              </div>
            )}
            <div className={s.trust}>
              <span>1:1 video sessions</span>
              <span>Free cancellation</span>
              <span>Book in under a minute</span>
            </div>
          </div>
          <div className="animate-in" style={{ animationDelay: '150ms' }}>
            <WeekAvailability />
          </div>
        </div>
      </CursorGlow>

      <section id="services" className={`container ${s.section}`}>
        <Reveal className={s.sectionHead}>
          <span className={s.kicker}>Services</span>
          <h2>Pick the session you need</h2>
          <p>Every session is 1:1, focused on your goals, and ends with concrete next steps.</p>
        </Reveal>
        <div className={s.services}>
          {services.isPending &&
            [0, 1, 2].map((i) => <Skeleton key={i} height={240} style={{ borderRadius: 20 }} />)}
          {services.data?.map((svc, i) => (
            <Reveal key={svc.id} delay={i * 100}>
              <TiltCard className={s.serviceCard}>
                <span className={s.serviceIcon} aria-hidden>
                  {SERVICE_ICONS[i % SERVICE_ICONS.length]}
                </span>
                <h3>{svc.name}</h3>
                <p>{svc.description}</p>
                <div className={s.serviceMeta}>
                  <span>⏱ {svc.durationMin} min</span>
                  <Link to={user?.role === 'user' ? `/app/book?service=${svc.id}` : bookTo}>
                    Book this <ArrowRightIcon width={16} height={16} />
                  </Link>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how" className={`container ${s.section}`}>
        <Reveal className={s.sectionHead}>
          <span className={s.kicker}>How it works</span>
          <h2>From booking to plan in three steps</h2>
        </Reveal>
        <div className={s.steps}>
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 120} className={s.step}>
              <div className={s.stepNum}>{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="faq" className={`container ${s.section}`}>
        <Reveal className={s.sectionHead}>
          <span className={s.kicker}>FAQ</span>
          <h2>Questions, answered</h2>
        </Reveal>
        <div className={s.faq}>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="container">
        <Reveal className={s.cta}>
          <h2>Ready for your next step?</h2>
          <p>Choose a time that works for you. Booking takes less than a minute.</p>
          <ButtonLink to={bookTo} variant="light" size="lg">
            Book your session <ArrowRightIcon />
          </ButtonLink>
          <span className={`${s.orb} ${s.orbA}`} aria-hidden />
          <span className={`${s.orb} ${s.orbB}`} aria-hidden />
          <span className={`${s.orb} ${s.orbC}`} aria-hidden />
        </Reveal>
      </div>
    </>
  );
}
