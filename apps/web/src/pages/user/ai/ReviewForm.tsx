import { useState, type DragEvent, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import { ApiError } from '../../../api/client';
import type { AiRun } from '../../../api/types';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/ui';
import s from './ai.module.css';
import d from '../../dashboard.module.css';

const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  /** Match against this saved job instead of asking for a target. */
  jobId?: string;
  submitLabel?: string;
  onStarted: (run: AiRun) => void;
}

/** Resume input (PDF or pasted text) plus an optional target, used by AI Coach and the job drawer. */
export function ReviewForm({ jobId, submitLabel = 'Review my resume', onStarted }: Props) {
  const [mode, setMode] = useState<'pdf' | 'text'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [showTarget, setShowTarget] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      aiApi.createReview({
        file: mode === 'pdf' ? (file ?? undefined) : undefined,
        text: mode === 'text' ? text : undefined,
        jobId,
        targetRole: jobId ? undefined : targetRole,
        jobDescription: jobId ? undefined : jobDescription,
      }),
    onSuccess: onStarted,
  });
  const fields = start.error instanceof ApiError ? start.error.fields : {};

  const pick = (f: File | undefined) => {
    setLocalError(null);
    if (!f) return;
    if (f.type !== 'application/pdf') return setLocalError('Please choose a PDF file.');
    if (f.size > MAX_BYTES) return setLocalError('The PDF must be 5 MB or smaller.');
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files[0]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'pdf' && !file) return setLocalError('Choose your resume PDF first.');
    if (mode === 'text' && !text.trim()) return setLocalError('Paste your resume text first.');
    start.mutate();
  };

  const error = localError ?? fields.resume?.[0] ?? fields.text?.[0] ?? start.error?.message;

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className={d.tabs} role="tablist" aria-label="Resume input" style={{ marginBottom: 0 }}>
        {(['pdf', 'text'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={d.tab}
            onClick={() => {
              setMode(m);
              setLocalError(null);
            }}
          >
            {m === 'pdf' ? 'Upload PDF' : 'Paste text'}
          </button>
        ))}
      </div>

      {mode === 'pdf' ? (
        file ? (
          <div className={s.fileChip}>
            <span>📄 {file.name}</span>
            <button type="button" aria-label="Remove file" onClick={() => setFile(null)}>
              ×
            </button>
          </div>
        ) : (
          <label
            className={`${s.dropzone} ${dragOver ? s.dragOver : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <span className={s.dropIcon} aria-hidden>
              📄
            </span>
            <strong>Drop your resume PDF here</strong>
            <small>or click to choose · max 5 MB</small>
            <input
              type="file"
              accept="application/pdf"
              className="visually-hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        )
      ) : (
        <Field
          label="Resume text"
          name="resume-text"
          multiline
          rows={10}
          maxLength={30_000}
          placeholder="Paste the full text of your resume"
          value={text}
          onChange={(e) => setText(e.target.value)}
          hint={`${text.length.toLocaleString()} / 30,000 characters`}
        />
      )}

      {!jobId &&
        (showTarget ? (
          <>
            <Field
              label="Target role"
              name="targetRole"
              placeholder="e.g. Junior QA Engineer"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              error={fields.targetRole?.[0]}
            />
            <Field
              label="Job description"
              name="jobDescription"
              multiline
              rows={5}
              placeholder="Paste the posting for a job match score"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              error={fields.jobDescription?.[0]}
              hint="Optional"
            />
          </>
        ) : (
          <button type="button" className={s.toggle} onClick={() => setShowTarget(true)}>
            + Add a target role or job (optional)
          </button>
        ))}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={start.isPending}>
        {submitLabel}
      </Button>
      <p className={s.privacy}>
        Your PDF is sent to our AI provider for this review and is not stored. We keep the results,
        which you can delete any time.
      </p>
    </form>
  );
}
