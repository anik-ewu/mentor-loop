import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/client';
import { goalsApi } from '../../../api/goals';
import type { CurrentGoals, GoalMetric } from '../../../api/types';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import s from './home.module.css';

export const METRIC_LABEL: Record<GoalMetric, string> = {
  applications: 'Applications sent',
  interviews: 'Interviews logged',
  follow_ups: 'Follow-ups',
  resume_matches: 'Resume matches',
  interview_preps: 'Interview preps',
};

const METRICS = Object.keys(METRIC_LABEL) as GoalMetric[];

const DEFAULT_TARGETS: Record<GoalMetric, number> = {
  applications: 5,
  interviews: 2,
  follow_ups: 3,
  resume_matches: 2,
  interview_preps: 1,
};

/** This week's goals with progress bars; the targets are edited in a modal. */
export function GoalsCard({ data }: { data: CurrentGoals }) {
  const [editing, setEditing] = useState(false);

  return (
    <section className={`${s.card} ${s.wide}`} aria-labelledby="goals-title">
      <div className={s.cardHead}>
        <h2 id="goals-title">This week's goals</h2>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {data.goals.length ? 'Edit goals' : 'Set goals'}
        </Button>
      </div>
      {data.goals.length === 0 ? (
        <div className={s.empty}>
          <p>Small weekly targets keep a job search moving. Try 5 applications and 2 interviews.</p>
          <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
            Set your first goals
          </Button>
        </div>
      ) : (
        <>
          {data.goals.map((g) => {
            const pct = Math.min(100, Math.round((g.actual / g.target) * 100));
            return (
              <div key={g.metric} className={s.goal}>
                <div className={s.goalHead}>
                  <span>
                    {g.met ? '✅ ' : ''}
                    {METRIC_LABEL[g.metric]}
                  </span>
                  <span>
                    {g.actual} / {g.target}
                  </span>
                </div>
                <div
                  className={s.track}
                  role="progressbar"
                  aria-label={METRIC_LABEL[g.metric]}
                  aria-valuemin={0}
                  aria-valuemax={g.target}
                  aria-valuenow={Math.min(g.actual, g.target)}
                >
                  <div
                    className={`${s.fill} ${g.met ? s.fillDone : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {data.allMet && <p className="muted">🎉 Every goal met this week. Nice work.</p>}
          {data.carriedOver && <p className="subtle">Carried over from last week.</p>}
        </>
      )}
      {editing && <EditGoalsModal data={data} onClose={() => setEditing(false)} />}
    </section>
  );
}

function EditGoalsModal({ data, onClose }: { data: CurrentGoals; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const current = new Map(data.goals.map((g) => [g.metric, g.target]));
  const [rows, setRows] = useState(() =>
    METRICS.map((metric) => ({
      metric,
      on: current.has(metric) || (current.size === 0 && metric === 'applications'),
      target: String(current.get(metric) ?? DEFAULT_TARGETS[metric]),
    })),
  );

  const save = useMutation({
    mutationFn: () =>
      goalsApi.setCurrent(
        rows.filter((r) => r.on).map((r) => ({ metric: r.metric, target: Number(r.target) })),
      ),
    onSuccess: (next) => {
      qc.setQueryData(['goals', 'current'], next);
      toast('Goals saved');
      onClose();
    },
  });
  const error =
    save.error instanceof ApiError
      ? (Object.values(save.error.fields).flat()[0] ?? save.error.message)
      : save.error?.message;

  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal title="Weekly goals" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>
        Pick up to 5. Progress counts from what you log, Monday to Sunday in your timezone (
        {data.timezone}).
      </p>
      {rows.map((r, i) => (
        <div key={r.metric} className={s.goalRow}>
          <label>
            <input
              type="checkbox"
              checked={r.on}
              onChange={(e) => update(i, { on: e.target.checked })}
            />
            {METRIC_LABEL[r.metric]}
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            aria-label={`Target for ${METRIC_LABEL[r.metric]}`}
            value={r.target}
            disabled={!r.on}
            onChange={(e) => update(i, { target: e.target.value })}
          />
        </div>
      ))}
      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!rows.some((r) => r.on)}
          onClick={() => save.mutate()}
        >
          Save goals
        </Button>
      </div>
    </Modal>
  );
}
