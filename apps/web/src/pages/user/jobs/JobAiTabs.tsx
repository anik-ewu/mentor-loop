import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../../../api/jobs';
import type { AiRun, Job, JobAiRun } from '../../../api/types';
import { Button } from '../../../components/Button';
import { useToast } from '../../../components/Toast';
import { EmptyState } from '../../../components/ui';
import { formatDay } from '../../../lib/format';
import { GenerateForm } from '../ai/GenerateForm';
import { ReviewForm } from '../ai/ReviewForm';
import { RunView } from '../ai/RunView';
import a from '../ai/ai.module.css';
import s from './jobs.module.css';

const runsOf = (job: Job, kind: JobAiRun['kind']) => job.aiRuns.filter((r) => r.kind === kind);

/** Refreshes the job (its AI runs) and AI lists after a run starts. */
function useStarted(job: Job, then: (run: AiRun) => void) {
  const qc = useQueryClient();
  return (run: AiRun) => {
    qc.invalidateQueries({ queryKey: ['jobs', job.id] });
    qc.invalidateQueries({ queryKey: ['ai', 'runs'] });
    then(run);
  };
}

function RunList({ runs, label }: { runs: JobAiRun[]; label: string }) {
  return (
    <div className={a.history}>
      {runs.map((run) => (
        <Link key={run.id} to={`/app/ai/${run.id}`} className={a.historyItem}>
          <span className={a.scoreBadge}>{run.score ?? '✨'}</span>
          <span className={a.historyBody}>
            <strong>{label}</strong>
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
  );
}

/** Interview prep for one job: the question set with practice ticks, and a way to make one. */
export function JobPrepTab({ job }: { job: Job }) {
  const sets = runsOf(job, 'interview_questions').filter((r) => r.status !== 'failed');
  const [picked, setPicked] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const current = picked ?? sets[0]?.id ?? null;
  const started = useStarted(job, (run) => {
    setPicked(run.id);
    setShowForm(false);
  });

  const form = (
    <div className={a.panel}>
      <h3 className={s.panelTitle}>Generate interview questions</h3>
      <GenerateForm tool="questions" jobId={job.id} onStarted={started} />
    </div>
  );

  if (!current) {
    return (
      <div className="stack">
        <p className="muted">
          Get 15–25 questions this company is likely to ask for this role, with what a strong answer
          covers. Pick a resume review to add questions about your own projects.
        </p>
        {!job.jobDescription && (
          <p className="field-hint">
            Tip: paste the job description in Details first for more specific questions.
          </p>
        )}
        {form}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className={s.prepBar}>
        {sets.length > 1 && (
          <select
            className="input"
            aria-label="Question set"
            value={current}
            onChange={(e) => setPicked(e.target.value)}
          >
            {sets.map((r, i) => (
              <option key={r.id} value={r.id}>
                {i === 0 ? 'Latest set' : 'Earlier set'} · {formatDay(r.createdAt)}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          variant={showForm ? 'primary' : 'secondary'}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'Generate a new set'}
        </Button>
      </div>
      {showForm && form}
      <RunView id={current} />
    </div>
  );
}

/** Resume match and cover letter for one job. */
export function JobLetterTab({ job }: { job: Job }) {
  const qc = useQueryClient();
  const toast = useToast();
  const matches = runsOf(job, 'resume_review');
  const letters = runsOf(job, 'cover_letter');
  const [tool, setTool] = useState<'match' | 'letter' | null>(null);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [letter, setLetter] = useState(job.coverLetter ?? '');
  const started = useStarted(job, (run) => {
    setActiveRun(run.id);
    setTool(null);
  });

  const save = useMutation({
    mutationFn: () => jobsApi.update(job.id, { coverLetter: letter }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast('Cover letter saved');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <Button
          size="sm"
          variant={tool === 'match' ? 'primary' : 'secondary'}
          onClick={() => {
            setTool(tool === 'match' ? null : 'match');
            setActiveRun(null);
          }}
        >
          Check my resume against this job
        </Button>
        <Button
          size="sm"
          variant={tool === 'letter' ? 'primary' : 'secondary'}
          onClick={() => {
            setTool(tool === 'letter' ? null : 'letter');
            setActiveRun(null);
          }}
        >
          Draft cover letter with AI
        </Button>
      </div>

      {tool && (
        <div className={a.panel}>
          {tool === 'match' ? (
            <ReviewForm jobId={job.id} submitLabel="Check my match" onStarted={started} />
          ) : (
            <GenerateForm tool="letter" jobId={job.id} onStarted={started} />
          )}
        </div>
      )}
      {activeRun && (
        <div className="stack" style={{ gap: 8 }}>
          <RunView id={activeRun} onReplace={setActiveRun} />
          <Link to={`/app/ai/${activeRun}`}>Open full result →</Link>
        </div>
      )}

      <section className={a.panel}>
        <h3 className={s.panelTitle}>Your cover letter for this job</h3>
        <textarea
          className="input"
          rows={10}
          aria-label="Cover letter"
          placeholder="Write it here, or draft one with AI and click “Save to job”."
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={letter === (job.coverLetter ?? '')}
            onClick={() => save.mutate()}
          >
            Save letter
          </Button>
        </div>
      </section>

      <h3 className={s.panelTitle}>Resume matches</h3>
      {matches.length ? (
        <RunList runs={matches} label="Resume match" />
      ) : (
        <EmptyState
          icon="📄"
          title="No match yet"
          text="Check your resume against this job to see your score and what to fix."
        />
      )}
      {letters.length > 0 && (
        <>
          <h3 className={s.panelTitle}>AI drafts</h3>
          <RunList runs={letters} label="Cover letter draft" />
        </>
      )}
    </div>
  );
}
