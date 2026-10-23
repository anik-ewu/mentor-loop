import { Link } from 'react-router-dom';
import type { AiRunSummary } from '../../../api/types';
import { formatDay } from '../../../lib/format';
import s from './ai.module.css';

const KIND_LABEL = {
  resume_review: 'Resume review',
  interview_questions: 'Interview prep',
  cover_letter: 'Cover letter',
} as const;

export function runTitle(run: Pick<AiRunSummary, 'kind' | 'job' | 'input'>) {
  if (run.job) return `${run.job.title} · ${run.job.company}`;
  if (run.input.targetRole) return run.input.targetRole;
  return run.kind === 'resume_review' ? 'General review' : KIND_LABEL[run.kind];
}

/** Compact list of AI runs that link to their result page. */
export function RunHistory({ runs }: { runs: AiRunSummary[] }) {
  return (
    <div className={s.history}>
      {runs.map((run) => (
        <Link key={run.id} to={`/app/ai/${run.id}`} className={s.historyItem}>
          <span
            className={s.scoreBadge}
            aria-label={run.score == null ? undefined : `Score ${run.score}`}
          >
            {run.score ??
              (run.kind === 'cover_letter'
                ? '✉️'
                : run.kind === 'interview_questions'
                  ? '🎤'
                  : '…')}
          </span>
          <span className={s.historyBody}>
            <strong>{runTitle(run)}</strong>
            <small>
              {KIND_LABEL[run.kind]} · {formatDay(run.createdAt)}
              {run.input.fileName && ` · ${run.input.fileName}`}
            </small>
          </span>
          {run.status !== 'done' && (
            <span className={`${s.state} ${run.status === 'failed' ? s.stateFailed : ''}`}>
              {run.status === 'failed' ? 'Failed' : 'Working…'}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
