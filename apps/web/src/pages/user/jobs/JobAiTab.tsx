import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Job } from '../../../api/types';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/ui';
import { formatDay } from '../../../lib/format';
import { ReviewForm } from '../ai/ReviewForm';
import { RunView } from '../ai/RunView';
import a from '../ai/ai.module.css';

const KIND_LABEL = {
  resume_review: 'Resume match',
  interview_questions: 'Interview prep',
  cover_letter: 'Cover letter',
} as const;

/** AI tools for one saved job, plus everything already generated for it. */
export function JobAiTab({ job }: { job: Job }) {
  const [form, setForm] = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const qc = useQueryClient();

  return (
    <div className="stack">
      {!job.jobDescription && (
        <p className="field-hint">
          Tip: paste the job description in Details first. The match and prep are much more specific
          with it.
        </p>
      )}

      <div className="row">
        <Button
          variant={form ? 'primary' : 'secondary'}
          size="sm"
          aria-expanded={form}
          onClick={() => {
            setForm((v) => !v);
            setActiveRun(null);
          }}
        >
          Check my resume against this job
        </Button>
      </div>

      {form && !activeRun && (
        <div className={a.panel}>
          <ReviewForm
            jobId={job.id}
            submitLabel="Check my match"
            onStarted={(run) => {
              setActiveRun(run.id);
              qc.invalidateQueries({ queryKey: ['jobs', job.id] });
            }}
          />
        </div>
      )}
      {activeRun && (
        <div className="stack" style={{ gap: 8 }}>
          <RunView id={activeRun} />
          <Link to={`/app/ai/${activeRun}`}>Open full result →</Link>
        </div>
      )}

      <h3 style={{ fontSize: 15, marginTop: 8 }}>Saved for this job</h3>
      {job.aiRuns.length === 0 ? (
        <EmptyState
          icon="✨"
          title="No AI results yet"
          text="Check your resume against this job to see your match score and what to fix."
        />
      ) : (
        <div className={a.history}>
          {job.aiRuns.map((run) => (
            <Link key={run.id} to={`/app/ai/${run.id}`} className={a.historyItem}>
              <span className={a.scoreBadge}>{run.score ?? '✨'}</span>
              <span className={a.historyBody}>
                <strong>{KIND_LABEL[run.kind]}</strong>
                <small>{formatDay(run.createdAt)}</small>
              </span>
              {run.status !== 'done' && (
                <span className={`${a.state} ${run.status === 'failed' ? a.stateFailed : ''}`}>
                  {run.status === 'failed' ? 'Failed' : 'Working…'}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
