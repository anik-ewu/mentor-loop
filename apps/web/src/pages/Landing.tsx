import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { servicesApi } from '../api/services';
import { slotsApi } from '../api/slots';
import { DemoButtons } from '../auth/DemoButtons';
import { homeFor, useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../components/Button';
import { HeartbeatLine } from '../components/HeartbeatLine';
import { ArrowRightIcon } from '../components/icons';
import { CursorGlow, Reveal, TiltCard } from '../components/Interactive';
import { PulseDot } from '../components/PulseDot';
import { Avatar, Skeleton } from '../components/ui';
import { formatDay, formatTime } from '../lib/format';
import s from './Landing.module.css';

const SERVICE_ICONS = ['📄', '🧭', '🎯', '💡', '🚀'];

const STEPS = [
  { title: 'Pick a session', text: 'Choose a resume review, career guidance or a mock interview.' },
  {
    title: 'Choose a time',
    text: 'See live availability and grab the slot that suits you. No back-and-forth emails.',
  },
  {
    title: 'Meet and grow',
    text: 'Get honest, practical feedback and a clear action plan you can use the same day.',
  },
];

const FAQ = [
  {
    q: 'Who is this for?',
    a: 'Students, fresh graduates and working engineers who want a sharper CV, a clear career plan or interview practice from someone who does the job every day.',
  },
  {
    q: 'How do sessions happen?',
    a: 'Online, 1:1 over a video call. You get the meeting link once your booking is confirmed.',
  },
  {
    q: 'Can I cancel or reschedule?',
    a: 'Yes. Cancel from "My sessions" any time before it starts. The slot opens up again for someone else, and you can book a new time.',
  },
  {
    q: 'What should I prepare?',
    a: 'Add a link to your CV and a short note about your goals when you book. The more context, the more useful the session.',
  },
];

function AvailabilityPreview() {
  const { data: slots, isPending } = useQuery({
    queryKey: ['slots', 'open'],
    queryFn: slotsApi.listOpen,
  });
  const next = slots?.slice(0, 3) ?? [];

  return (
    <div className={s.preview}>
      <div className={s.previewCard}>
        <div className={s.previewHead}>
          <Avatar name="Sabbir Hasan" size={44} />
          <div>
            <strong>Sabbir Hasan</strong>
            <span className="subtle">Software Engineer · .NET · AI</span>
          </div>
          <span className={s.liveTag}>
            <PulseDot size={8} /> LIVE
          </span>
        </div>
        <div className={s.ecg}>
          <HeartbeatLine />
        </div>
        <p className="subtle" style={{ marginBottom: 8 }}>
          Next available
        </p>
        <div className={s.slotList}>
          {isPending && [0, 1, 2].map((i) => <Skeleton key={i} height={46} />)}
          {!isPending && next.length === 0 && (
            <p className="muted">New slots are added every week.</p>
          )}
          {next.map((slot, i) => (
            <div key={slot.id} className={s.slotItem} style={{ animationDelay: `${i * 90}ms` }}>
              <strong>{formatDay(slot.startsAt)}</strong>
              <span>{formatTime(slot.startsAt)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={s.floatBadge}>
        <b>✓</b> {slots ? `${slots.length} open slots` : 'Checking slots…'}
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
              <PulseDot size={8} /> Taking bookings this week
            </span>
            <h1 className={s.title}>
              Land your next tech role with a{' '}
              <span className="gradient-text">mentor in your corner</span>
            </h1>
            <p className={s.lead}>
              1:1 resume reviews, career guidance and mock interviews with a working software
              engineer. Honest feedback, practical next steps, booked in under a minute.
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
              <span>Enterprise .NET & Angular experience</span>
              <span>Free cancellation</span>
              <span>Mobile friendly</span>
            </div>
          </div>
          <div className="animate-in" style={{ animationDelay: '150ms' }}>
            <AvailabilityPreview />
          </div>
        </div>
      </CursorGlow>

      <section id="services" className={`container ${s.section}`}>
        <Reveal className={s.sectionHead}>
          <span className={s.kicker}>Services</span>
          <h2>Focused sessions, real outcomes</h2>
          <p>Every session is 1:1 and tailored to where you are in your career.</p>
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
          <h2>Three steps, zero friction</h2>
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
          <h2>Ready to move your career forward?</h2>
          <p>Pick a time that works for you. It takes less than a minute.</p>
          <ButtonLink to={bookTo} variant="light" size="lg">
            Book your session <ArrowRightIcon />
          </ButtonLink>
          <div className={s.ctaLine}>
            <HeartbeatLine stretch />
          </div>
        </Reveal>
      </div>
    </>
  );
}
