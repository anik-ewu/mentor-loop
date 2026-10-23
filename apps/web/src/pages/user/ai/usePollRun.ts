import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';

/** Loads an AI run and polls every 2 s while it is still processing. */
export function usePollRun<R>(id: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ai', 'run', id],
    queryFn: () => aiApi.run<R>(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 2000 : false),
  });

  // Once it settles, history lists and the job's AI tab need the new status and score.
  const status = query.data?.status;
  useEffect(() => {
    if (status && status !== 'processing') {
      qc.invalidateQueries({ queryKey: ['ai', 'runs'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    }
  }, [status, qc]);

  return query;
}
