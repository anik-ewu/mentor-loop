import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../../api/ai';
import { bookingsApi } from '../../api/bookings';
import { goalsApi } from '../../api/goals';
import { jobsApi } from '../../api/jobs';
import { useAuth } from '../../auth/AuthContext';
import { ButtonLink } from '../../components/Button';
import { PlusIcon } from '../../components/icons';
import { Skeleton } from '../../components/ui';
import { formatDay, formatLongDay, formatRange, formatTime, isPast } from '../../lib/format';
import { ScoreRing } from './ai/ReviewResult';
import { runTitle } from './ai/RunHistory';
import { GoalsCard } from './home/GoalsCard';
import { STATUS_LABEL } from './jobs/jobMeta';
import s from './home/home.module.css';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const PIPELINE = ['applied', 'assessment', 'interviewing', 'offer'] as const;

/** Career snapshot: goals and streaks, what needs attention, and what is coming up. */
export function UserHome() {
  const { user, config } = useAuth();
  // Progress is computed from jobs and AI runs that change elsewhere: always refetch here.
  const goals = useQuery({
    queryKey: ['goals', 'current'],
    queryFn: goalsApi.current,
    staleTime: 0,
  });
  const stats = useQuery({ queryKey: ['jobs', 'stats'], queryFn: jobsApi.stats, staleTime: 0 });
  const bookings = useQuery({ queryKey: ['bookings', 'mine'], queryFn: bookingsApi.mine });
  const reviews = useQuery({
    queryKey: ['ai', 'runs', 'resume_review'],
    queryFn: () => aiApi.runs({ kind: 'resume_review' }),
    enabled: config.aiEnabled,
  });

  const nextSession = (bookings.data ?? [])
    .filter((b) => ['pending', 'confirmed'].includes(b.status) && !isPast(b.slot.startsAt))
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt))[0];
  const latestMatch = reviews.data?.find((r) => r.status === 'done' && r.score != null);
  const streaks = goals.data?.streaks;
  const st = stats.data;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>
            {greeting()}, {user?.name.split(' ')[0]} 👋
          </h1>
          <p>Your job search at a glance.</p>
        </div>
        {streaks && (
          <div className={s.streaks}>
            <span
              className={`${s.streak} ${streaks.daily ? '' : s.streakMuted}`}
              title="Days in a row with any activity"
            >
              🔥 {streaks.daily}-day streak
            </span>
            <span
              className={`${s.streak} ${streaks.weekly ? '' : s.streakMuted}`}
              title="Weeks in a row with every goal met"
            >
              🏆 {streaks.weekly}-week streak
            </span>
          </div>
        )}
      </div>

      <div className={s.grid}>
        {goals.isPending ? (
          <Skeleton height={220} style={{ borderRadius: 20, gridColumn: 'span 2' }} />
        ) : goals.data ? (
          <GoalsCard data={goals.data} />
        ) : null}

        <section className={s.card} aria-labelledby="match-title">
          <div className={s.cardHead}>
            <h2 id="match-title">Latest match score</h2>
            {config.aiEnabled && <Link to="/app/ai">AI Coach</Link>}
          </div>
          {!config.aiEnabled ? (
            <p className="muted">AI features are not available on this server.</p>
          ) : reviews.isPending ? (
            <Skeleton height={92} />
          ) : latestMatch ? (
            <Link to={`/app/ai/${latestMatch.id}`} className={s.score} style={{ color: 'inherit' }}>
              <ScoreRing
                value={latestMatch.score!}
                label={latestMatch.job ? 'Job match' : 'Overall'}
              />
              <div>
                <strong>{runTitle(latestMatch)}</strong>
                <p>{formatDay(latestMatch.createdAt)}</p>
              </div>
            </Link>
          ) : (
            <div className={s.empty}>
              <p>See how your resume scores against a job you want.</p>
              <ButtonLink to="/app/ai" size="sm" variant="primary">
                Check my resume
              </ButtonLink>
            </div>
          )}
        </section>

        <section className={s.card} aria-labelledby="followups-title">
          <div className={s.cardHead}>
            <h2 id="followups-title">Follow-ups due</h2>
            <Link to="/app/jobs">All jobs</Link>
          </div>
          {stats.isPending ? (
            <Skeleton height={80} />
          ) : st && st.followUpsDue.length ? (
            <ul className={s.rows}>
              {st.followUpsDue.slice(0, 4).map((j) => (
                <li key={j.id}>
                  <Link to={`/app/jobs/${j.id}`} className={s.row}>
                    <span>
                      <strong>{j.company}</strong>
                      <small>{j.title}</small>
                    </span>
                    <small>since {formatDay(j.followUpAt!)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              {st?.total
                ? 'Nothing due. You are on top of it.'
                : 'Follow-up reminders show up here.'}
            </p>
          )}
        </section>

        <section className={s.card} aria-labelledby="pipeline-title">
          <div className={s.cardHead}>
            <h2 id="pipeline-title">Pipeline</h2>
            <Link to="/app/jobs">Open board</Link>
          </div>
          {stats.isPending ? (
            <Skeleton height={120} />
          ) : st?.total ? (
            <>
              <div className={s.pipeline}>
                {PIPELINE.map((status) => (
                  <Link key={status} to="/app/jobs">
                    <span>{STATUS_LABEL[status]}</span>
                    <strong>{st.byStatus[status] ?? 0}</strong>
                  </Link>
                ))}
              </div>
              <p className="subtle">
                {st.applied} applied · {st.responseRate}% response rate · {st.offers} offer
                {st.offers === 1 ? '' : 's'}
              </p>
            </>
          ) : (
            <div className={s.empty}>
              <p>Save the jobs you're interested in and track every stage.</p>
              <ButtonLink to="/app/jobs" size="sm" variant="primary">
                <PlusIcon /> Add your first job
              </ButtonLink>
            </div>
          )}
        </section>

        <section className={s.card} aria-labelledby="interviews-title">
          <div className={s.cardHead}>
            <h2 id="interviews-title">Upcoming interviews</h2>
          </div>
          {stats.isPending ? (
            <Skeleton height={80} />
          ) : st && st.upcomingInterviews.length ? (
            <ul className={s.rows}>
              {st.upcomingInterviews.map((i) => (
                <li key={i.id}>
                  <Link to={`/app/jobs/${i.job.id}?tab=timeline`} className={s.row}>
                    <span>
                      <strong>{i.job.company}</strong>
                      <small>{i.title ?? 'Interview'}</small>
                    </span>
                    <small>
                      {formatDay(i.scheduledAt)}, {formatTime(i.scheduledAt)}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Log interview rounds on a job's timeline to see them here.</p>
          )}
        </section>

        <section className={s.card} aria-labelledby="session-title">
          <div className={s.cardHead}>
            <h2 id="session-title">Next mentoring session</h2>
            <Link to="/app/sessions">All sessions</Link>
          </div>
          {bookings.isPending ? (
            <Skeleton height={80} />
          ) : nextSession ? (
            <Link to="/app/sessions" className={s.row}>
              <span>
                <strong>{nextSession.service.name}</strong>
                <small>
                  {formatLongDay(nextSession.slot.startsAt)} ·{' '}
                  {formatRange(nextSession.slot.startsAt, nextSession.slot.endsAt)}
                </small>
              </span>
              <small style={{ textTransform: 'capitalize' }}>{nextSession.status}</small>
            </Link>
          ) : (
            <div className={s.empty}>
              <p>Get a human's eyes on your resume or practise a mock interview.</p>
              <ButtonLink to="/app/sessions?tab=book" size="sm" variant="primary">
                Book a session
              </ButtonLink>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
