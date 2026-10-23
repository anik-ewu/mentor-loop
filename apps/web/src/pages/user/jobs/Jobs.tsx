import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '../../../api/jobs';
import type { JobSort, JobStatus } from '../../../api/types';
import { Button } from '../../../components/Button';
import { PlusIcon } from '../../../components/icons';
import { CountUp, EmptyState, Skeleton } from '../../../components/ui';
import { AddJobModal } from './AddJobModal';
import { Board } from './Board';
import { JobDrawer } from './JobDrawer';
import { JobTable } from './JobTable';
import { STATUSES, STATUS_LABEL } from './jobMeta';
import s from './jobs.module.css';
import d from '../../dashboard.module.css';

type View = 'board' | 'table';

const SORT_LABEL: Record<JobSort, string> = {
  updated: 'Recently updated',
  created: 'Recently added',
  applied: 'Applied date',
  company: 'Company A–Z',
  priority: 'Priority',
};

const VIEW_KEY = 'ml-jobs-view';

function initialView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'board' || saved === 'table') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(max-width: 767px)').matches ? 'table' : 'board';
}

export function Jobs() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(initialView);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [sort, setSort] = useState<JobSort>('updated');
  const search = useDeferredValue(q.trim());
  const openId = params.get('job');

  // The board always shows every stage; filter and sort only apply to the table.
  const query = view === 'board' ? { q: search } : { q: search, status: status || undefined, sort };
  const jobs = useQuery({ queryKey: ['jobs', 'list', query], queryFn: () => jobsApi.list(query) });
  const stats = useQuery({ queryKey: ['jobs', 'stats'], queryFn: jobsApi.stats });

  const open = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set('job', id);
        else p.delete('job');
        return p;
      },
      { replace: !id },
    );

  const switchView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  const st = stats.data;
  const isEmpty = st?.total === 0;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Job tracker</h1>
          <p>Every application, interview and follow-up in one place.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <PlusIcon /> Add job
        </Button>
      </div>

      {stats.isPending ? (
        <Skeleton height={76} style={{ borderRadius: 20 }} />
      ) : (
        st && (
          <>
            <div className={s.stats}>
              {(
                [
                  ['Applied', st.applied, ''],
                  ['Response rate', st.responseRate, '%'],
                  ['Interviews', st.interviews, ''],
                  ['Offers', st.offers, ''],
                ] as const
              ).map(([label, n, unit]) => (
                <div key={label} className={s.stat}>
                  <span>{label}</span>
                  <strong>
                    <CountUp value={n} />
                    {unit}
                  </strong>
                </div>
              ))}
              <div className={`${s.stat} ${st.followUpsDue.length ? s.statWarn : ''}`}>
                <span>Follow-ups due</span>
                <strong>
                  <CountUp value={st.followUpsDue.length} />
                </strong>
              </div>
            </div>
            {st.followUpsDue.length > 0 && (
              <div className={s.due}>
                <span className="muted">Time to follow up:</span>
                {st.followUpsDue.map((j) => (
                  <button key={j.id} className={s.chip} onClick={() => open(j.id)}>
                    {j.company} · {j.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )
      )}

      {isEmpty ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState
            icon="💼"
            title="Track your first application"
            text="Save a job with just the company and title. Drag it across the board as it moves forward."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <PlusIcon /> Add your first job
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className={s.toolbar}>
            <input
              className={`input ${s.search}`}
              type="search"
              placeholder="Search company or title"
              aria-label="Search jobs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {view === 'table' && (
              <>
                <select
                  className="input"
                  aria-label="Filter by stage"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as JobStatus | '')}
                >
                  <option value="">All stages</option>
                  {STATUSES.map((x) => (
                    <option key={x} value={x}>
                      {STATUS_LABEL[x]}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  aria-label="Sort by"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as JobSort)}
                >
                  {Object.entries(SORT_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className={`${d.tabs} ${s.viewSwitch}`} role="tablist" aria-label="View">
              {(['board', 'table'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={d.tab}
                  onClick={() => switchView(v)}
                >
                  {v === 'board' ? 'Board' : 'Table'}
                </button>
              ))}
            </div>
          </div>

          {jobs.isPending ? (
            <Skeleton height={320} style={{ borderRadius: 20 }} />
          ) : jobs.data?.length === 0 ? (
            <EmptyState icon="🔍" title="No matches" text="Try a different search or stage." />
          ) : view === 'board' ? (
            <Board jobs={jobs.data ?? []} onOpen={open} />
          ) : (
            <JobTable jobs={jobs.data ?? []} onOpen={open} />
          )}
        </>
      )}

      {adding && (
        <AddJobModal
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            open(id);
          }}
        />
      )}
      {openId && <JobDrawer jobId={openId} onClose={() => open(null)} />}
    </div>
  );
}
