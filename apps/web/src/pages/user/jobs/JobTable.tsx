import type { JobSummary } from '../../../api/types';
import { formatDay } from '../../../lib/format';
import { WORK_MODE_LABEL, isFollowUpDue } from './jobMeta';
import { StatusPill } from './StatusPill';
import s from './jobs.module.css';

export function JobTable({ jobs, onOpen }: { jobs: JobSummary[]; onOpen: (id: string) => void }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Job</th>
            <th>Stage</th>
            <th className={s.hideSm}>Applied</th>
            <th className={s.hideSm}>Follow up</th>
            <th className={s.hideSm}>Priority</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} onClick={() => onOpen(job.id)}>
              <td>
                <button className={s.rowLink} onClick={() => onOpen(job.id)}>
                  <strong>{job.company}</strong>
                  <span>
                    {job.title}
                    {job.workMode && ` · ${WORK_MODE_LABEL[job.workMode]}`}
                  </span>
                </button>
              </td>
              <td>
                <StatusPill status={job.status} />
              </td>
              <td className={s.hideSm}>{job.appliedAt ? formatDay(job.appliedAt) : '—'}</td>
              <td className={s.hideSm}>
                {job.followUpAt ? (
                  <span className={isFollowUpDue(job) ? `${s.tag} ${s.tagWarn}` : undefined}>
                    {formatDay(job.followUpAt)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className={s.hideSm}>
                <span className={s.stars} aria-label={`Priority ${job.priority} of 3`}>
                  {'★'.repeat(job.priority)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
