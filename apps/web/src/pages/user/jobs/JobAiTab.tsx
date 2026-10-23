import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AiRun, Job } from '../../../api/types';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/ui';
import { formatDay } from '../../../lib/format';
import { GENERATE_LABEL, GenerateForm } from '../ai/GenerateForm';
import { ReviewForm } from '../ai/ReviewForm';
import { RunView } from '../ai/RunView';
import a from '../ai/ai.module.css';

const KIND_LABEL = {
  resume_review: 'Resume match',
  interview_questions: 'Interview prep',
  cover_letter: 'Cover letter',
} as const;

type Tool = 'review' | 'questions' | 'letter';

const TOOL_LABEL: Record<Tool, string> = {
  review: 'Check my resume against this job',
  ...GENERATE_LABEL,
};

/** AI tools for one saved job, plus everything already generated for it. */
export function JobAiTab({ job }: { job: Job }) {
  const qc = useQueryClient();
  const [tool, setTool] = useState<Tool | null>(null);
  const [activeRun, setActiveRun] = useState<string | null>(null);

  const started = (run: AiRun) => {
    setActiveRun(run.id);
    qc.invalidateQueries({ queryKey: ['jobs', job.id] });
    qc.invalidateQueries({ queryKey: ['ai', 'runs'] });
  };

  return (
    <div className="stack">
      {!job.jobDescription && (
        <p className="field-hint">
          Tip: paste the job description in Details first. The match and prep are much more specific
          with it.
        </p>
      )}

      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(TOOL_LABEL) as Tool[]).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tool === t ? 'primary' : 'secondary'}
            aria-expanded={tool === t}
            onClick={() => {
              setTool(tool === t ? null : t);
              setActiveRun(null);
            }}
          >
            {TOOL_LABEL[t]}
          </Button>
        ))}
      </div>

      {tool && !activeRun && (
        <div className={a.panel}>
          {tool === 'review' ? (
            <ReviewForm jobId={job.id} submitLabel="Check my match" onStarted={started} />
          ) : (
            <GenerateForm key={tool} jobId={job.id} tool={tool} onStarted={started} />
          )}
        </div>
      )}
      {activeRun && (
        <div className="stack" style={{ gap: 8 }}>
          <RunView id={activeRun} onReplace={setActiveRun} />
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
              <span className={a.scoreBadge}>
                {run.score ??
                  (run.kind === 'cover_letter'
                    ? '✉️'
                    : run.kind === 'interview_questions'
                      ? '🎤'
                      : '✨')}
              </span>
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
