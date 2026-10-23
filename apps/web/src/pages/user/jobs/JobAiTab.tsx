import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import type { AiRun, Job, LetterLength, LetterTone } from '../../../api/types';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/ui';
import { formatDay } from '../../../lib/format';
import { ReviewForm } from '../ai/ReviewForm';
import { RunView } from '../ai/RunView';
import { runTitle } from '../ai/RunHistory';
import a from '../ai/ai.module.css';

const KIND_LABEL = {
  resume_review: 'Resume match',
  interview_questions: 'Interview prep',
  cover_letter: 'Cover letter',
} as const;

type Tool = 'review' | 'questions' | 'letter';

const TOOL_LABEL: Record<Tool, string> = {
  review: 'Check my resume against this job',
  questions: 'Generate interview questions',
  letter: 'Draft cover letter',
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
            <GenerateForm key={tool} job={job} tool={tool} onStarted={started} />
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

/** Interview questions (review optional) or a cover letter (review required). */
function GenerateForm({
  job,
  tool,
  onStarted,
}: {
  job: Job;
  tool: 'questions' | 'letter';
  onStarted: (run: AiRun) => void;
}) {
  const reviews = useQuery({
    queryKey: ['ai', 'runs', 'resume_review'],
    queryFn: () => aiApi.runs({ kind: 'resume_review' }),
  });
  // Finished reviews only; ones matched to this job first.
  const done = (reviews.data ?? [])
    .filter((r) => r.status === 'done')
    .sort((x, y) => Number(y.jobId === job.id) - Number(x.jobId === job.id));
  const [picked, setPicked] = useState<string | null>(null);
  const reviewId = picked ?? done[0]?.id ?? '';
  const [tone, setTone] = useState<LetterTone>('formal');
  const [length, setLength] = useState<LetterLength>('standard');

  const start = useMutation({
    mutationFn: () =>
      tool === 'questions'
        ? aiApi.createInterviewQuestions({ jobId: job.id, reviewId: reviewId || undefined })
        : aiApi.createCoverLetter({ jobId: job.id, reviewId, tone, length }),
    onSuccess: onStarted,
  });

  if (reviews.isPending) return <p className="muted">Loading your reviews…</p>;
  if (tool === 'letter' && done.length === 0) {
    return (
      <p className="muted">
        A cover letter is built from a resume review, so it only uses facts from your resume. Run
        “Check my resume against this job” first.
      </p>
    );
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="gen-review">Based on resume review</label>
        <select
          id="gen-review"
          className="input"
          value={reviewId}
          onChange={(e) => setPicked(e.target.value)}
        >
          {tool === 'questions' && <option value="">None (job only)</option>}
          {done.map((r) => (
            <option key={r.id} value={r.id}>
              {runTitle(r)} · {formatDay(r.createdAt)}
              {r.score != null && ` · ${r.score}/100`}
            </option>
          ))}
        </select>
        {tool === 'questions' && (
          <span className="field-hint">With a review, some questions are about your projects.</span>
        )}
      </div>
      {tool === 'letter' && (
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="gen-tone">Tone</label>
            <select
              id="gen-tone"
              className="input"
              value={tone}
              onChange={(e) => setTone(e.target.value as LetterTone)}
            >
              <option value="formal">Formal</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="gen-length">Length</label>
            <select
              id="gen-length"
              className="input"
              value={length}
              onChange={(e) => setLength(e.target.value as LetterLength)}
            >
              <option value="short">Short</option>
              <option value="standard">Standard</option>
            </select>
          </div>
        </div>
      )}
      {start.error && (
        <p className="field-error" role="alert">
          {start.error.message}
        </p>
      )}
      <Button variant="primary" loading={start.isPending} onClick={() => start.mutate()}>
        {TOOL_LABEL[tool]}
      </Button>
    </div>
  );
}
