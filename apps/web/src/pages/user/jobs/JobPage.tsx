import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../../../api/jobs';
import type { JobStatus } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { Button } from '../../../components/Button';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { TrashIcon } from '../../../components/icons';
import { useToast } from '../../../components/Toast';
import { EmptyState, Skeleton } from '../../../components/ui';
import { formatDay } from '../../../lib/format';
import { JobDetailsForm } from './JobDetailsForm';
import { JobLetterTab, JobPrepTab } from './JobAiTabs';
import {
  STATUSES,
  STATUS_LABEL,
  WORK_MODE_LABEL,
  errorMessage,
  isFollowUpDue,
  useMoveJob,
} from './jobMeta';
import { Timeline } from './Timeline';
import s from './jobs.module.css';
import d from '../../dashboard.module.css';

type Tab = 'details' | 'timeline' | 'prep' | 'letter';

const TAB_LABEL: Record<Tab, string> = {
  details: 'Details',
  timeline: 'Timeline',
  prep: 'Interview prep',
  letter: 'Resume & letter',
};

/** /app/jobs/:jobId: everything about one application. */
export function JobPage() {
  const { jobId } = useParams() as { jobId: string };
  const { config } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const move = useMoveJob();
  const [params, setParams] = useSearchParams();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tabs: Tab[] = config.aiEnabled
    ? ['details', 'timeline', 'prep', 'letter']
    : ['details', 'timeline'];
  const tab = tabs.find((t) => t === params.get('tab')) ?? 'details';
  const setTab = (t: Tab) => setParams(t === 'details' ? {} : { tab: t }, { replace: true });

  const {
    data: job,
    isPending,
    error,
  } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => jobsApi.get(jobId),
    // Keep AI results fresh while one is still being generated.
    refetchInterval: (q) =>
      q.state.data?.aiRuns.some((r) => r.status === 'processing') ? 3000 : false,
  });

  const remove = useMutation({
    mutationFn: () => jobsApi.remove(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast('Job deleted');
      navigate('/app/jobs', { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (error) {
    return (
      <EmptyState
        icon="🔍"
        title="Job not found"
        text="It may have been deleted."
        action={<Link to="/app/jobs">Back to Jobs</Link>}
      />
    );
  }

  const nextInterview = job?.events
    .filter((e) => e.type === 'interview' && e.scheduledAt && new Date(e.scheduledAt) > new Date())
    .sort((x, y) => x.scheduledAt!.localeCompare(y.scheduledAt!))[0];
  const bestMatch = job?.aiRuns
    .filter((r) => r.kind === 'resume_review' && r.score != null)
    .reduce<number | null>((best, r) => Math.max(best ?? 0, r.score!), null);

  return (
    <div className="animate-in">
      <Link to="/app/jobs" className="subtle">
        ← Jobs
      </Link>
      <div className="page-header" style={{ marginTop: 8 }}>
        {job ? (
          <div>
            <h1>{job.company}</h1>
            <p>
              {job.title}
              {job.location && ` · ${job.location}`}
              {job.workMode && ` · ${WORK_MODE_LABEL[job.workMode]}`}
            </p>
          </div>
        ) : (
          <Skeleton height={56} width={280} />
        )}
        {job && (
          <div className="row">
            <select
              className="input"
              style={{ width: 'auto' }}
              value={job.status}
              aria-label="Stage"
              onChange={(e) =>
                move.mutate(
                  { id: job.id, status: e.target.value as JobStatus },
                  { onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', jobId] }) },
                )
              }
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <TrashIcon /> Delete
            </Button>
          </div>
        )}
      </div>

      {job && (
        <div className={s.summary}>
          <div>
            <span>Applied</span>
            <strong>{job.appliedAt ? formatDay(job.appliedAt) : 'Not yet'}</strong>
          </div>
          <div className={isFollowUpDue(job) ? s.summaryWarn : undefined}>
            <span>Follow up</span>
            <strong>{job.followUpAt ? formatDay(job.followUpAt) : '—'}</strong>
          </div>
          <div>
            <span>Next interview</span>
            <strong>{nextInterview ? formatDay(nextInterview.scheduledAt!) : '—'}</strong>
          </div>
          {config.aiEnabled && (
            <div>
              <span>Best match</span>
              <strong>{bestMatch != null ? `${bestMatch}/100` : '—'}</strong>
            </div>
          )}
        </div>
      )}

      <div className={d.tabs} role="tablist" aria-label="Job sections">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={d.tab}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
            {t === 'timeline' && job && <span className={d.count}>{job.events.length}</span>}
          </button>
        ))}
      </div>

      {isPending || !job ? (
        <Skeleton height={320} style={{ borderRadius: 20 }} />
      ) : tab === 'details' ? (
        <div className={s.pageCard}>
          <JobDetailsForm key={job.updatedAt} job={job} />
        </div>
      ) : tab === 'timeline' ? (
        <div className={s.pageCard}>
          <Timeline job={job} />
        </div>
      ) : tab === 'prep' ? (
        <JobPrepTab job={job} />
      ) : (
        <JobLetterTab key={job.coverLetter ?? ''} job={job} />
      )}

      {confirmDelete && job && (
        <ConfirmModal
          title="Delete this job?"
          text={`${job.company} – ${job.title} and its timeline will be removed for good. AI results you made for it stay in AI Coach.`}
          confirmLabel="Delete job"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
