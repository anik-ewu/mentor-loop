import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Book } from './Book';
import { MyBookings } from './MyBookings';
import s from '../dashboard.module.css';

type Tab = 'mine' | 'book';

/** Mentoring sessions: "My sessions" and "Book" in one place. */
export function Sessions() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'book' ? 'book' : 'mine';

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Sessions</h1>
          <p>1:1 time with a mentor: resume deep-dives, career guidance and mock interviews.</p>
        </div>
      </div>
      <div className={s.tabs} role="tablist" aria-label="Sessions">
        {(['mine', 'book'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={s.tab}
            onClick={() => setParams(t === 'book' ? { tab: 'book' } : {})}
          >
            {t === 'mine' ? 'My sessions' : 'Book a session'}
          </button>
        ))}
      </div>
      {tab === 'book' ? <Book embedded /> : <MyBookings embedded />}
    </div>
  );
}

/** Old /app/book and /app/bookings links land on the matching tab, keeping their query. */
export function SessionsRedirect({ tab }: { tab?: Tab }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (tab === 'book') params.set('tab', 'book');
  const qs = params.toString();
  return <Navigate to={`/app/sessions${qs ? `?${qs}` : ''}`} replace />;
}
