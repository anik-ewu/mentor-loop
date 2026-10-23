import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import { jobsApi } from '../../../api/jobs';
import type { AiRun, LetterLength, LetterTone } from '../../../api/types';
import { Button, ButtonLink } from '../../../components/Button';
import { formatDay } from '../../../lib/format';
import { runTitle } from './RunHistory';

export type GenerateTool = 'questions' | 'letter';

export const GENERATE_LABEL: Record<GenerateTool, string> = {
  questions: 'Generate interview questions',
  letter: 'Draft cover letter',
};

interface Props {
  tool: GenerateTool;
  /** Fixed job (the job drawer). Without it, the user picks one of their saved jobs. */
  jobId?: string;
  /** Preselect this job in the picker, e.g. from a review's "Next steps". */
  initialJobId?: string;
  /** Preselect this review, if it is one of the user's finished reviews. */
  initialReviewId?: string;
  onStarted: (run: AiRun) => void;
}

/** Interview questions (review optional) or a cover letter (review required) for a saved job. */
export function GenerateForm({ tool, jobId, initialJobId, initialReviewId, onStarted }: Props) {
  const jobs = useQuery({
    queryKey: ['jobs', 'list', { sort: 'updated' }],
    queryFn: () => jobsApi.list({ sort: 'updated' }),
    enabled: !jobId,
  });
  const reviews = useQuery({
    queryKey: ['ai', 'runs', 'resume_review'],
    queryFn: () => aiApi.runs({ kind: 'resume_review' }),
  });
  const [pickedJob, setPickedJob] = useState<string | null>(null);
  const [pickedReview, setPickedReview] = useState<string | null>(null);
  const [tone, setTone] = useState<LetterTone>('formal');
  const [length, setLength] = useState<LetterLength>('standard');

  const jobList = jobs.data ?? [];
  const selectedJob =
    jobId ??
    pickedJob ??
    (jobList.some((j) => j.id === initialJobId) ? initialJobId : jobList[0]?.id) ??
    '';

  // Finished reviews only; ones matched to the selected job first.
  const done = (reviews.data ?? [])
    .filter((r) => r.status === 'done')
    .sort((x, y) => Number(y.jobId === selectedJob) - Number(x.jobId === selectedJob));
  const reviewId =
    pickedReview ??
    (done.some((r) => r.id === initialReviewId) ? initialReviewId : done[0]?.id) ??
    '';

  const start = useMutation({
    mutationFn: () =>
      tool === 'questions'
        ? aiApi.createInterviewQuestions({ jobId: selectedJob, reviewId: reviewId || undefined })
        : aiApi.createCoverLetter({ jobId: selectedJob, reviewId, tone, length }),
    onSuccess: onStarted,
  });

  if (reviews.isPending || (!jobId && jobs.isPending)) {
    return <p className="muted">Loading your jobs and reviews…</p>;
  }
  if (!jobId && jobList.length === 0) {
    return (
      <div className="stack">
        <p className="muted">
          {tool === 'questions' ? 'Interview questions are' : 'A cover letter is'} written for a
          specific job. Save the job first, ideally with its description.
        </p>
        <ButtonLink to="/app/jobs" variant="primary">
          Add a job first
        </ButtonLink>
      </div>
    );
  }
  if (tool === 'letter' && done.length === 0) {
    return (
      <p className="muted">
        A cover letter is built from a resume review, so it only uses facts from your resume. Run a
        resume review first: “Check my resume against this job” on the job, or the Reviews tab in{' '}
        <Link to="/app/ai">AI Coach</Link>.
      </p>
    );
  }

  return (
    <div className="stack">
      {!jobId && (
        <div className="field">
          <label htmlFor="gen-job">Saved job</label>
          <select
            id="gen-job"
            className="input"
            value={selectedJob}
            onChange={(e) => {
              setPickedJob(e.target.value);
              setPickedReview(null);
            }}
          >
            {jobList.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.company}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="gen-review">Based on resume review</label>
        <select
          id="gen-review"
          className="input"
          value={reviewId}
          onChange={(e) => setPickedReview(e.target.value)}
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
      <Button
        variant="primary"
        loading={start.isPending}
        disabled={!selectedJob}
        onClick={() => start.mutate()}
      >
        {GENERATE_LABEL[tool]}
      </Button>
    </div>
  );
}
