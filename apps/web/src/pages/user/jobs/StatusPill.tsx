import type { JobStatus } from '../../../api/types';
import { STATUS_LABEL } from './jobMeta';
import s from './jobs.module.css';

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`${s.pill} ${s[status] ?? ''}`}>{STATUS_LABEL[status]}</span>;
}
