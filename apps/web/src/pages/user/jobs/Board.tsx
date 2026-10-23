import { useState, type DragEvent } from 'react';
import type { JobStatus, JobSummary } from '../../../api/types';
import { formatDay } from '../../../lib/format';
import {
  FINAL,
  STATUSES,
  STATUS_LABEL,
  WORK_MODE_LABEL,
  isFollowUpDue,
  useMoveJob,
} from './jobMeta';
import s from './jobs.module.css';

interface Props {
  jobs: JobSummary[];
  onOpen: (id: string) => void;
}

/** Position between two neighbours, so only the moved card needs saving. */
function positionBetween(before?: JobSummary, after?: JobSummary) {
  if (!before && !after) return 0;
  if (!before) return after!.position - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}

/** Kanban by status: native drag and drop, plus a status select for touch and keyboard. */
export function Board({ jobs, onOpen }: Props) {
  const move = useMoveJob();
  const [showClosed, setShowClosed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: JobStatus; beforeId: string | null } | null>(null);

  const columns = STATUSES.filter((st) => showClosed || !FINAL.includes(st));
  const byStatus = (st: JobStatus) =>
    jobs.filter((j) => j.status === st).sort((a, b) => a.position - b.position);

  const drop = (status: JobStatus, beforeId: string | null) => {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (!id) return;
    const column = byStatus(status).filter((j) => j.id !== id);
    const idx = beforeId ? column.findIndex((j) => j.id === beforeId) : column.length;
    const at = idx < 0 ? column.length : idx;
    const position = positionBetween(column[at - 1], column[at]);
    const job = jobs.find((j) => j.id === id);
    if (job && (job.status !== status || job.position !== position)) {
      move.mutate({ id, status, position });
    }
  };

  const allowDrop = (e: DragEvent, status: JobStatus, beforeId: string | null) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    if (over?.status !== status || over.beforeId !== beforeId) setOver({ status, beforeId });
  };

  return (
    <div className={s.boardWrap}>
      <div className={s.board}>
        {columns.map((status) => {
          const items = byStatus(status);
          return (
            <section
              key={status}
              className={`${s.column} ${over?.status === status ? s.dropTarget : ''}`}
              aria-label={`${STATUS_LABEL[status]}, ${items.length} jobs`}
              onDragOver={(e) => allowDrop(e, status, null)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(status, over?.status === status ? over.beforeId : null);
              }}
            >
              <div className={s.columnHead}>
                <span>{STATUS_LABEL[status]}</span>
                <span className={s.columnCount}>{items.length}</span>
              </div>
              {items.length === 0 && <div className={s.columnEmpty}>Drop a job here</div>}
              {items.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  dragging={dragId === job.id}
                  dropBefore={over?.beforeId === job.id && dragId !== job.id}
                  onOpen={() => onOpen(job.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', job.id);
                    setDragId(job.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => allowDrop(e, status, job.id)}
                  onMove={(to) => to !== job.status && move.mutate({ id: job.id, status: to })}
                />
              ))}
            </section>
          );
        })}
        <button className={s.showClosed} onClick={() => setShowClosed((v) => !v)}>
          {showClosed
            ? 'Hide closed'
            : `Show closed (${jobs.filter((j) => FINAL.includes(j.status)).length})`}
        </button>
      </div>
    </div>
  );
}

interface CardProps {
  job: JobSummary;
  dragging: boolean;
  dropBefore: boolean;
  onOpen: () => void;
  onMove: (status: JobStatus) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
}

function JobCard({ job, dragging, dropBefore, onOpen, onMove, ...drag }: CardProps) {
  const due = isFollowUpDue(job);
  return (
    <article
      className={`${s.card} ${dragging ? s.dragging : ''} ${dropBefore ? s.dropBefore : ''}`}
      draggable
      {...drag}
    >
      <button className={s.cardOpen} onClick={onOpen}>
        <strong>{job.company}</strong>
        <span>{job.title}</span>
      </button>
      <div className={s.cardMeta}>
        <span className={s.stars} aria-label={`Priority ${job.priority} of 3`}>
          {'★'.repeat(job.priority)}
        </span>
        {job.workMode && <span className={s.tag}>{WORK_MODE_LABEL[job.workMode]}</span>}
        {due && <span className={`${s.tag} ${s.tagWarn}`}>Follow up due</span>}
        {job.nextInterviewAt && (
          <span className={`${s.tag} ${s.tagBrand}`}>
            Interview {formatDay(job.nextInterviewAt)}
          </span>
        )}
      </div>
      <select
        className={s.cardSelect}
        value={job.status}
        aria-label={`Stage for ${job.company}`}
        onChange={(e) => onMove(e.target.value as JobStatus)}
      >
        {STATUSES.map((st) => (
          <option key={st} value={st}>
            {STATUS_LABEL[st]}
          </option>
        ))}
      </select>
    </article>
  );
}
