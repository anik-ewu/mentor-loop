import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { servicesApi, type ServiceInput } from '../../api/services';
import type { Service } from '../../api/types';
import { Button } from '../../components/Button';
import { PlusIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { EmptyState, Field, Skeleton } from '../../components/ui';
import s from './admin.module.css';

const EMPTY: ServiceInput = { name: '', description: '', durationMin: 45, isActive: true };

export function Services() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ['services', 'all'],
    queryFn: servicesApi.listAll,
  });

  const toggle = useMutation({
    mutationFn: (svc: Service) => servicesApi.update(svc.id, { isActive: !svc.isActive }),
    onSuccess: (svc) => {
      toast(svc.isActive ? `${svc.name} is live` : `${svc.name} is hidden from clients`);
      qc.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>Services</h1>
          <p>What clients can book. Hidden services stay in past bookings.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <PlusIcon /> New service
        </Button>
      </div>

      <div className={s.serviceGrid}>
        {isPending && [0, 1].map((i) => <Skeleton key={i} height={180} />)}
        {data?.length === 0 && (
          <EmptyState
            icon="🧩"
            title="No services yet"
            text="Create your first service to start taking bookings."
          />
        )}
        {data?.map((svc, i) => (
          <article
            key={svc.id}
            className={`${s.service} ${svc.isActive ? '' : s.inactive}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <h3 style={{ fontSize: 17 }}>{svc.name}</h3>
            <p>{svc.description}</p>
            <span className="subtle">⏱ {svc.durationMin} min</span>
            <div className={s.serviceFoot}>
              <label className={s.switch}>
                <input type="checkbox" checked={svc.isActive} onChange={() => toggle.mutate(svc)} />
                {svc.isActive ? 'Active' : 'Hidden'}
              </label>
              <Button size="sm" variant="ghost" onClick={() => setEditing(svc)}>
                Edit
              </Button>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ServiceForm({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<ServiceInput>(service ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => (service ? servicesApi.update(service.id, form) : servicesApi.create(form)),
    onSuccess: () => {
      toast(service ? 'Service updated' : 'Service created');
      qc.invalidateQueries({ queryKey: ['services'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0]!])));
      } else toast(e.message, 'error');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    save.mutate();
  };

  return (
    <Modal title={service ? 'Edit service' : 'New service'} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <Field
          label="Name"
          name="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          autoFocus
        />
        <Field
          label="Description"
          name="description"
          multiline
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          error={errors.description}
        />
        <Field
          label="Duration (minutes)"
          name="durationMin"
          type="number"
          min={15}
          max={240}
          step={15}
          value={form.durationMin}
          onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
          error={errors.durationMin}
        />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {service ? 'Save changes' : 'Create service'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
