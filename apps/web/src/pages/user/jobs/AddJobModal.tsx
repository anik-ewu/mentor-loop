import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/client';
import { jobsApi } from '../../../api/jobs';
import type { JobStatus } from '../../../api/types';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { Field } from '../../../components/ui';
import { STATUSES, STATUS_LABEL } from './jobMeta';

/** Quick add: company and title are enough; the rest goes in the drawer later. */
export function AddJobModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ company: '', title: '', jobUrl: '', status: 'wishlist' });
  const add = useMutation({
    mutationFn: () => jobsApi.create(form),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast(`${job.company} added to your tracker`);
      onCreated(job.id);
    },
  });
  const fields = add.error instanceof ApiError ? add.error.fields : {};
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <Modal title="Add a job" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <Field
          label="Company"
          name="company"
          value={form.company}
          onChange={set('company')}
          error={fields.company?.[0]}
          autoFocus
          required
        />
        <Field
          label="Job title"
          name="title"
          value={form.title}
          onChange={set('title')}
          error={fields.title?.[0]}
          required
        />
        <Field
          label="Link to the posting"
          name="jobUrl"
          type="url"
          placeholder="https://"
          value={form.jobUrl}
          onChange={set('jobUrl')}
          error={fields.jobUrl?.[0]}
          hint="Optional"
        />
        <div className="field">
          <label htmlFor="add-status">Stage</label>
          <select id="add-status" className="input" value={form.status} onChange={set('status')}>
            {STATUSES.map((st: JobStatus) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </div>
        {add.error && !Object.keys(fields).length && (
          <p className="field-error">{add.error.message}</p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={add.isPending}>
            Add job
          </Button>
        </div>
      </form>
    </Modal>
  );
}
