import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/client';
import { jobsApi, type JobInput } from '../../../api/jobs';
import type { Job, JobStatus } from '../../../api/types';
import { Button } from '../../../components/Button';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { TrashIcon } from '../../../components/icons';
import { useToast } from '../../../components/Toast';
import { Field, Skeleton } from '../../../components/ui';
import { STATUSES, STATUS_LABEL, WORK_MODE_LABEL, errorMessage, useMoveJob } from './jobMeta';
import { useAuth } from '../../../auth/AuthContext';
import { JobAiTab } from './JobAiTab';
import { Timeline } from './Timeline';
import s from './jobs.module.css';
import d from '../../dashboard.module.css';

type Tab = 'details' | 'timeline' | 'ai';

const TAB_LABEL: Record<Tab, string> = { details: 'Details', timeline: 'Timeline', ai: 'AI' };

/** Side panel with everything about one job. */
export function JobDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { config } = useAuth();
  const tabs: Tab[] = config.aiEnabled ? ['details', 'timeline', 'ai'] : ['details', 'timeline'];
  const [tab, setTab] = useState<Tab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const move = useMoveJob();
  const { data: job, isPending } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => jobsApi.get(jobId),
    // Keep AI results on the AI tab fresh while one is still being generated.
    refetchInterval: (q) =>
      q.state.data?.aiRuns.some((r) => r.status === 'processing') ? 3000 : false,
  });

  const remove = useMutation({
    mutationFn: () => jobsApi.remove(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast('Job deleted');
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !confirmDelete && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmDelete]);

  return createPortal(
    <>
      <div className={s.drawerBackdrop} onClick={onClose} />
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label="Job details">
        <div className={s.drawerHead}>
          <div className={s.drawerTitle}>
            {job ? (
              <>
                <h2>{job.company}</h2>
                <p>{job.title}</p>
              </>
            ) : (
              <Skeleton height={40} />
            )}
          </div>
          {job && (
            <select
              className="input"
              style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }}
              value={job.status}
              aria-label="Stage"
              onChange={(e) =>
                move.mutate(
                  { id: job.id, status: e.target.value as JobStatus },
                  { onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', jobId] }) },
                )
              }
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          )}
          <button className={s.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={s.drawerTabs}>
          <div className={d.tabs} role="tablist">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={d.tab}
                onClick={() => setTab(t)}
              >
                {TAB_LABEL[t]}
                {t === 'timeline' && job && <span className={d.count}>{job.events.length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className={s.drawerBody}>
          {isPending || !job ? (
            <div className="stack">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={44} />
              ))}
            </div>
          ) : tab === 'details' ? (
            <DetailsForm key={job.updatedAt} job={job} onDelete={() => setConfirmDelete(true)} />
          ) : tab === 'timeline' ? (
            <Timeline job={job} />
          ) : (
            <JobAiTab job={job} />
          )}
        </div>
      </aside>
      {confirmDelete && job && (
        <ConfirmModal
          title="Delete this job?"
          text={`${job.company} – ${job.title} and its timeline will be removed for good.`}
          confirmLabel="Delete job"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>,
    document.body,
  );
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

const TEXT_FIELDS = [
  'company',
  'title',
  'jobUrl',
  'location',
  'currency',
  'source',
  'contactName',
  'contactEmail',
  'jobDescription',
  'notes',
] as const;

function initialForm(job: Job) {
  const form = {} as Record<(typeof TEXT_FIELDS)[number], string>;
  for (const k of TEXT_FIELDS) form[k] = job[k] ?? '';
  return {
    ...form,
    workMode: job.workMode ?? '',
    salaryMin: job.salaryMin?.toString() ?? '',
    salaryMax: job.salaryMax?.toString() ?? '',
    priority: String(job.priority),
    appliedAt: toDateInput(job.appliedAt),
    followUpAt: toDateInput(job.followUpAt),
    deadline: toDateInput(job.deadline),
  };
}

function DetailsForm({ job, onDelete }: { job: Job; onDelete: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => initialForm(job));
  const save = useMutation({
    mutationFn: (body: JobInput) => jobsApi.update(job.id, body),
    onSuccess: (updated) => {
      qc.setQueryData<Job>(['jobs', job.id], (old) => old && { ...old, ...updated });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast('Saved');
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fields : {};

  const field = (name: keyof typeof form, label: string, extra: Record<string, unknown> = {}) => (
    <Field
      label={label}
      name={name}
      id={`job-${name}`}
      value={form[name]}
      onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
      error={errors[name]?.[0]}
      {...extra}
    />
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className={s.grid2}>
        {field('company', 'Company')}
        {field('title', 'Job title')}
      </div>
      {field('jobUrl', 'Link to the posting', { type: 'url', placeholder: 'https://' })}
      <div className={s.grid2}>
        {field('location', 'Location')}
        <div className="field">
          <label htmlFor="job-workMode">Work mode</label>
          <select
            id="job-workMode"
            className="input"
            value={form.workMode}
            onChange={(e) => setForm((f) => ({ ...f, workMode: e.target.value }))}
          >
            <option value="">Not set</option>
            {Object.entries(WORK_MODE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={s.grid2}>
        {field('salaryMin', 'Salary from', { type: 'number', min: 0, inputMode: 'numeric' })}
        {field('salaryMax', 'Salary to', { type: 'number', min: 0, inputMode: 'numeric' })}
      </div>
      <div className={s.grid2}>
        {field('currency', 'Currency', { placeholder: 'USD, BDT…' })}
        {field('source', 'Source', { placeholder: 'LinkedIn, referral…' })}
      </div>
      <div className={s.grid2}>
        <div className="field">
          <label htmlFor="job-priority">Priority</label>
          <select
            id="job-priority"
            className="input"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          >
            <option value="3">★★★ High</option>
            <option value="2">★★ Medium</option>
            <option value="1">★ Low</option>
          </select>
        </div>
        {field('deadline', 'Application deadline', { type: 'date' })}
      </div>
      <div className={s.grid2}>
        {field('appliedAt', 'Applied on', { type: 'date' })}
        {field('followUpAt', 'Follow up on', { type: 'date' })}
      </div>
      <div className={s.grid2}>
        {field('contactName', 'Contact name')}
        {field('contactEmail', 'Contact email', { type: 'email' })}
      </div>
      {field('jobDescription', 'Job description', {
        multiline: true,
        rows: 6,
        hint: 'Paste the posting. The AI tools use it to tailor your resume and prep.',
      })}
      {field('notes', 'Notes', { multiline: true, rows: 3 })}
      {save.error && !Object.keys(errors).length && (
        <p className="field-error">{save.error.message}</p>
      )}
      <div className={s.formActions}>
        <Button type="button" variant="ghost" onClick={onDelete}>
          <TrashIcon /> Delete
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
