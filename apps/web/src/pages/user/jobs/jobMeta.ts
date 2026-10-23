import { useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../../../api/jobs';
import type { JobStatus, JobSummary, WorkMode } from '../../../api/types';
import { ApiError } from '../../../api/client';
import { useToast } from '../../../components/Toast';

export const STATUSES: JobStatus[] = [
  'wishlist',
  'applied',
  'assessment',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
  'ghosted',
];

export const FINAL: JobStatus[] = ['accepted', 'rejected', 'withdrawn', 'ghosted'];
export const ACTIVE: JobStatus[] = ['applied', 'assessment', 'interviewing', 'offer'];

export const STATUS_LABEL: Record<JobStatus, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  assessment: 'Assessment',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted: 'Ghosted',
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const isFollowUpDue = (j: Pick<JobSummary, 'status' | 'followUpAt'>) =>
  ACTIVE.includes(j.status) && !!j.followUpAt && new Date(j.followUpAt).getTime() <= Date.now();

/** Shared error toast for job mutations. */
export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong';

/** Moves a job on the board, updating the cached list right away. */
export function useMoveJob() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, status, position }: { id: string; status: JobStatus; position?: number }) =>
      jobsApi.move(id, status, position),
    onMutate: async ({ id, status, position }) => {
      await qc.cancelQueries({ queryKey: ['jobs', 'list'] });
      const lists = qc.getQueriesData<JobSummary[]>({ queryKey: ['jobs', 'list'] });
      for (const [key, jobs] of lists) {
        qc.setQueryData(
          key,
          jobs?.map((j) => (j.id === id ? { ...j, status, position: position ?? j.position } : j)),
        );
      }
      return { lists };
    },
    onError: (e, _vars, ctx) => {
      for (const [key, jobs] of ctx?.lists ?? []) qc.setQueryData(key, jobs);
      toast(errorMessage(e), 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
