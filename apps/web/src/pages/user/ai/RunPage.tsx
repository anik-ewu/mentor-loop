import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import { Button, ButtonLink } from '../../../components/Button';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { TrashIcon } from '../../../components/icons';
import { useToast } from '../../../components/Toast';
import { formatDay } from '../../../lib/format';
import { RunView } from './RunView';
import { runTitle } from './RunHistory';
import { usePollRun } from './usePollRun';

const HEADING = {
  resume_review: 'Resume review',
  interview_questions: 'Interview prep',
  cover_letter: 'Cover letter',
} as const;

/** /app/ai/:runId: one AI result, polled until it is ready. */
export function RunPage() {
  const { runId } = useParams() as { runId: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const { data: run } = usePollRun(runId);

  const remove = useMutation({
    mutationFn: () => aiApi.remove(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai', 'runs'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast('Deleted');
      navigate('/app/ai', { replace: true });
    },
  });

  return (
    <div className="animate-in">
      <Link to="/app/ai" className="subtle">
        ← AI Coach
      </Link>
      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <h1>{run ? HEADING[run.kind] : 'AI result'}</h1>
          {run && (
            <p>
              {runTitle(run)} · {formatDay(run.createdAt)}
            </p>
          )}
        </div>
        {run && run.status !== 'processing' && (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <TrashIcon /> Delete
          </Button>
        )}
      </div>

      <RunView
        id={runId}
        onRetry={
          <ButtonLink to={run?.jobId ? `/app/jobs?job=${run.jobId}` : '/app/ai'} variant="primary">
            Try again
          </ButtonLink>
        }
      />

      {confirm && (
        <ConfirmModal
          title="Delete this result?"
          text="The result and the profile extracted from your resume will be removed for good."
          confirmLabel="Delete"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
