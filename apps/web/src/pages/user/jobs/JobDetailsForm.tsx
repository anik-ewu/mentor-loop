import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/client';
import { jobsApi, type JobInput } from '../../../api/jobs';
import type { Job } from '../../../api/types';
import { Button } from '../../../components/Button';
import { useToast } from '../../../components/Toast';
import { Field } from '../../../components/ui';
import { WORK_MODE_LABEL } from './jobMeta';
import s from './jobs.module.css';

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

/** Every field of a job, editable. The cover letter has its own tab. */
export function JobDetailsForm({ job }: { job: Job }) {
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
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
