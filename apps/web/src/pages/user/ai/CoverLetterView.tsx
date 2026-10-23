import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import { jobsApi } from '../../../api/jobs';
import type { AiRun, CoverLetterResult, LetterLength, LetterTone } from '../../../api/types';
import { Button } from '../../../components/Button';
import { useToast } from '../../../components/Toast';
import { CopyButton } from './ReviewResult';
import s from './ai.module.css';

export const letterText = (l: CoverLetterResult) =>
  [l.greeting, ...l.paragraphs, l.closing].join('\n\n');

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Editable letter with copy, download, regenerate and save to the job. */
export function CoverLetterView({
  run,
  onReplace,
}: {
  run: AiRun<CoverLetterResult>;
  onReplace?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(() => letterText(run.result!));
  const [tone, setTone] = useState<LetterTone>((run.input.tone as LetterTone) ?? 'formal');
  const [length, setLength] = useState<LetterLength>(
    (run.input.length as LetterLength) ?? 'standard',
  );
  const reviewId = run.sourceRunId;

  const save = useMutation({
    mutationFn: () => jobsApi.update(run.jobId!, { coverLetter: text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast('Saved to the job');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const regenerate = useMutation({
    mutationFn: () =>
      aiApi.createCoverLetter({ jobId: run.jobId!, reviewId: reviewId!, tone, length }),
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ['ai', 'runs'] });
      qc.invalidateQueries({ queryKey: ['jobs', run.jobId] });
      onReplace?.(next.id);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <div className={s.result}>
      <section className={`${s.panel} stack`}>
        <div className="field">
          <label htmlFor="letter-subject">Subject</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="letter-subject" className="input" readOnly value={run.result!.subject} />
            <CopyButton text={run.result!.subject} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="letter-body">Your letter (edit freely)</label>
          <textarea
            id="letter-body"
            className={`input ${s.letter}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="row">
          {run.jobId && (
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save to job
            </Button>
          )}
          <CopyButton text={text} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => download(`cover-letter-${run.job?.company ?? 'job'}.txt`, text)}
          >
            Download .txt
          </Button>
        </div>
      </section>

      {run.jobId && reviewId && (
        <section className={`${s.panel} ${s.letterTools}`}>
          <div className="field">
            <label htmlFor="letter-tone">Tone</label>
            <select
              id="letter-tone"
              className="input"
              value={tone}
              onChange={(e) => setTone(e.target.value as LetterTone)}
            >
              <option value="formal">Formal</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="letter-length">Length</label>
            <select
              id="letter-length"
              className="input"
              value={length}
              onChange={(e) => setLength(e.target.value as LetterLength)}
            >
              <option value="short">Short (~150 words)</option>
              <option value="standard">Standard (~300 words)</option>
            </select>
          </div>
          <Button loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
            Regenerate
          </Button>
        </section>
      )}

      {run.result!.highlightsUsed.length > 0 && (
        <section className={`${s.panel} ${s.section}`}>
          <h3>Facts from your profile used</h3>
          <ul className={s.bullets}>
            {run.result!.highlightsUsed.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
