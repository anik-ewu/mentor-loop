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
    title: 'Track every job',
    text: 'Save a job in seconds, drag it across the board as it moves, and get reminded when to follow up.',
  },
  {
    title: 'Match and prepare with AI',
    text: 'Score your resume against the job, fix the gaps, practise likely interview questions and draft a cover letter.',
  },
  {
    title: 'Keep momentum',
    text: 'Set small weekly goals, like 5 applications and 2 interviews, and keep your streak alive.',
  },
  {
    title: 'Book a mentor',
    text: 'When you need a human, book a 1:1 session. Your mentor sees your AI review before the call.',
  },
];

const FAQ = [
  {
    q: 'Who is MentorLoop for?',
    a: 'Anyone running a job search: students, graduates and working professionals who want to stay organised, apply with a stronger resume and walk into interviews prepared.',
  },
  {
    q: 'What does the AI coach do with my resume?',
    a: 'It compares your resume with a job you saved and gives you a match score, missing skills, prioritised fixes and stronger bullet points. Your PDF is sent to our AI provider (Anthropic) for that review and is not stored; you can delete any result.',
  },
  {
    q: 'Is the AI free to use?',
    a: 'Yes, within a daily limit per account, so the service stays fast and fair for everyone.',
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
  const bookTo = user
    ? user.role === 'admin'
      ? homeFor(user)
      : '/app/sessions?tab=book'
    : '/signup';
  const startTo = user ? homeFor(user) : '/signup';

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
              <PulseDot size={8} /> Job tracker, AI coach and real mentors
            </span>
            <h1 className={s.title}>
              Run your job search <span className="gradient-text">like a pro</span>
            </h1>
            <p className={s.lead}>
              Track every application in one board, match your resume to each job with AI, prepare
              for the interviews, and book a mentor when you need a human in your corner.
            </p>
            <div className={s.ctas}>
              <ButtonLink to={startTo} variant="primary" size="lg">
                Start tracking jobs <ArrowRightIcon />
              </ButtonLink>
              <ButtonLink to={bookTo} size="lg" variant="ghost">
                Book a mentor
              </ButtonLink>
            </div>
            {!user && (
              <div className={s.demo}>
                <DemoButtons size="sm" />
              </div>
            )}
            <div className={s.trust}>
              <span>Free job tracker</span>
              <span>AI resume match</span>
              <span>1:1 video sessions</span>
            </div>
          </div>
          <div className="animate-in" style={{ animationDelay: '150ms' }}>
            <WeekAvailability />
          </div>
        </div>
      </CursorGlow>

      <section id="services" className={`container ${s.section}`}>
        <Reveal className={s.sectionHead}>
          <span className={s.kicker}>Mentoring</span>
          <h2>When you need a human</h2>
          <p>
            Every session is 1:1, focused on your goals, and ends with concrete next steps. Attach
            an AI review and your mentor arrives prepared.
          </p>
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
                  <Link
                    to={user?.role === 'user' ? `/app/sessions?tab=book&service=${svc.id}` : bookTo}
                  >
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
          <h2>From saved job to offer</h2>
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
          <p>Add your first job in seconds and see how your resume matches it.</p>
          <ButtonLink to={startTo} variant="light" size="lg">
            Get started free <ArrowRightIcon />
          </ButtonLink>
          <span className={`${s.orb} ${s.orbA}`} aria-hidden />
          <span className={`${s.orb} ${s.orbB}`} aria-hidden />
          <span className={`${s.orb} ${s.orbC}`} aria-hidden />
        </Reveal>
      </div>
    </>
  );
}
