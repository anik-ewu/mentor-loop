import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/client';
import { jobsApi, type EventInput } from '../../../api/jobs';
import type { InterviewOutcome, Job, JobEvent } from '../../../api/types';
import { Button } from '../../../components/Button';
import { TrashIcon } from '../../../components/icons';
import { useToast } from '../../../components/Toast';
import { EmptyState, Field } from '../../../components/ui';
import { formatDay, formatTime } from '../../../lib/format';
import { STATUS_LABEL, errorMessage } from './jobMeta';
import s from './jobs.module.css';

type FormKind = 'interview' | 'follow_up' | 'note';

const FORM_TITLE: Record<FormKind, string> = {
  interview: 'Add interview round',
  follow_up: 'Log follow-up',
  note: 'Add note',
};

const ICON: Record<JobEvent['type'], string> = {
  status_change: '➜',
  interview: '🎤',
  follow_up: '📨',
  note: '📝',
};

function describe(e: JobEvent) {
  switch (e.type) {
    case 'status_change':
      return e.fromStatus
        ? `${STATUS_LABEL[e.fromStatus]} → ${STATUS_LABEL[e.toStatus!]}`
        : `Added as ${STATUS_LABEL[e.toStatus!]}`;
    case 'interview':
      return e.title || 'Interview round';
    case 'follow_up':
      return 'Followed up';
    case 'note':
      return e.title || 'Note';
  }
}

/** Day-and-time string for a <input type="datetime-local">, in local time. */
const localDateTime = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function Timeline({ job }: { job: Job }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<FormKind | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['jobs'] });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EventInput }) =>
      jobsApi.updateEvent(job.id, id, body),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => jobsApi.removeEvent(job.id, id),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div>
      <div className={s.timelineActions}>
        {(Object.keys(FORM_TITLE) as FormKind[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={open === k ? 'primary' : 'secondary'}
            onClick={() => setOpen(open === k ? null : k)}
            aria-expanded={open === k}
          >
            {FORM_TITLE[k]}
          </Button>
        ))}
      </div>

      {open && <EventForm key={open} job={job} kind={open} onDone={() => setOpen(null)} />}

      {job.events.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="No activity yet"
          text="Stage changes, interview rounds, follow-ups and notes show up here."
        />
      ) : (
        <ol className={s.timeline}>
          {job.events.map((e) => (
            <li key={e.id} className={s.event}>
              <span className={s.eventIcon} aria-hidden>
                {ICON[e.type]}
              </span>
              <div className={s.eventBody}>
                <strong>{describe(e)}</strong>
                {e.scheduledAt && (
                  <small>
                    {formatDay(e.scheduledAt)} at {formatTime(e.scheduledAt)}
                  </small>
                )}
                {e.notes && <p>{e.notes}</p>}
                <small>Logged {formatDay(e.createdAt)}</small>
              </div>
              <div className={s.eventTools}>
                {e.type === 'interview' && (
                  <select
                    value={e.outcome ?? 'pending'}
                    aria-label="Outcome"
                    onChange={(ev) =>
                      update.mutate({
                        id: e.id,
                        body: { outcome: ev.target.value as InterviewOutcome },
                      })
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                  </select>
                )}
                {e.type !== 'status_change' && (
                  <button
                    className={s.iconBtn}
                    aria-label="Delete entry"
                    onClick={() => remove.mutate(e.id)}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EventForm({ job, kind, onDone }: { job: Job; kind: FormKind; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: '',
    scheduledAt: localDateTime(new Date(Date.now() + 86_400_000)),
    notes: '',
    nextFollowUpAt: inAWeek,
  });
  const add = useMutation({
    mutationFn: () => {
      const body: EventInput = { type: kind, notes: form.notes };
      if (kind === 'interview') {
        body.title = form.title;
        body.scheduledAt = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : '';
      }
      if (kind === 'note') body.title = form.title;
      if (kind === 'follow_up') body.nextFollowUpAt = form.nextFollowUpAt;
      return jobsApi.addEvent(job.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast(kind === 'follow_up' ? 'Follow-up logged' : 'Added to the timeline');
      onDone();
    },
  });
  const errors = add.error instanceof ApiError ? add.error.fields : {};
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <form className={s.eventForm} onSubmit={submit} noValidate>
      {kind !== 'follow_up' && (
        <Field
          label={kind === 'interview' ? 'Round' : 'Title'}
          name="ev-title"
          placeholder={kind === 'interview' ? 'e.g. Technical interview' : 'Optional'}
          value={form.title}
          onChange={set('title')}
          error={errors.title?.[0]}
          autoFocus
        />
      )}
      {kind === 'interview' && (
        <Field
          label="When"
          name="ev-when"
          type="datetime-local"
          value={form.scheduledAt}
          onChange={set('scheduledAt')}
          error={errors.scheduledAt?.[0]}
        />
      )}
      {kind === 'follow_up' && (
        <Field
          label="Next follow-up"
          name="ev-next"
          type="date"
          value={form.nextFollowUpAt}
          onChange={set('nextFollowUpAt')}
          error={errors.nextFollowUpAt?.[0]}
          hint="We'll remind you on this day."
        />
      )}
      <Field
        label="Notes"
        name="ev-notes"
        multiline
        value={form.notes}
        onChange={set('notes')}
        error={errors.notes?.[0]}
        placeholder={kind === 'follow_up' ? 'Who you contacted and how' : undefined}
      />
      {add.error && !Object.keys(errors).length && (
        <p className="field-error">{add.error.message}</p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={add.isPending}>
          {FORM_TITLE[kind]}
        </Button>
      </div>
    </form>
  );
}
