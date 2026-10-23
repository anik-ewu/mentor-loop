import type { ReactNode } from 'react';
import type { AiKind, AiRun, ReviewResult as Review } from '../../../api/types';
import { Skeleton } from '../../../components/ui';
import { ReviewResult } from './ReviewResult';
import { usePollRun } from './usePollRun';
import s from './ai.module.css';

const WAITING: Record<AiKind, string> = {
  resume_review: 'Reading your resume…',
  interview_questions: 'Writing your interview questions…',
  cover_letter: 'Drafting your cover letter…',
};

/** Polls a run and shows its processing, failed or finished state. */
export function RunView({ id, onRetry }: { id: string; onRetry?: ReactNode }) {
  const { data: run, isPending, error } = usePollRun<unknown>(id);

  if (isPending) return <Skeleton height={240} style={{ borderRadius: 20 }} />;
  if (error || !run) return <p className="field-error">{error?.message ?? 'Not found'}</p>;

  if (run.status === 'processing') {
    return (
      <div className={`${s.panel} ${s.processing}`} role="status" aria-live="polite">
        <div className={s.spinner} aria-hidden />
        <strong>{WAITING[run.kind]}</strong>
        <span className="muted">This usually takes under a minute. You can leave this page.</span>
      </div>
    );
  }

  if (run.status === 'failed') {
    return (
      <div className={s.failed} role="alert">
        <strong>This didn't work.</strong>
        <p>{run.error ?? 'Something went wrong. Please try again.'}</p>
        {onRetry && <div style={{ marginTop: 12 }}>{onRetry}</div>}
      </div>
    );
  }

  switch (run.kind) {
    case 'resume_review':
      return <ReviewResult run={run as AiRun<Review>} />;
    default:
      return null;
  }
}
