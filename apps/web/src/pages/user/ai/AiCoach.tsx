import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import type { AiKind } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { ButtonLink } from '../../../components/Button';
import { EmptyState, Skeleton } from '../../../components/ui';
import { ReviewForm } from './ReviewForm';
import { RunHistory } from './RunHistory';
import s from './ai.module.css';
import d from '../../dashboard.module.css';

const TABS: { kind: AiKind; label: string; empty: string }[] = [
  {
    kind: 'resume_review',
    label: 'Reviews',
    empty: 'Your resume reviews and job matches show up here.',
  },
  {
    kind: 'interview_questions',
    label: 'Interview prep',
    empty: 'Generate questions from a saved job: open it in Jobs, then the AI tab.',
  },
  {
    kind: 'cover_letter',
    label: 'Cover letters',
    empty: 'Draft a cover letter from a saved job and a resume review.',
  },
];

export function AiCoach() {
  const { config } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<AiKind>('resume_review');
  const runs = useQuery({
    queryKey: ['ai', 'runs', kind],
    queryFn: () => aiApi.runs({ kind }),
    enabled: config.aiEnabled,
  });
  const tab = TABS.find((t) => t.kind === kind)!;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>AI Coach</h1>
          <p>Score your resume, match it to a job and get specific fixes in about a minute.</p>
        </div>
      </div>

      {!config.aiEnabled ? (
        <EmptyState
          icon="🤖"
          title="AI coach is not available"
          text="The AI features are turned off on this server. You can still track jobs and book a mentor."
          action={
            <ButtonLink to="/app/jobs" variant="primary">
              Go to Jobs
            </ButtonLink>
          }
        />
      ) : (
        <div className={s.layout}>
          <section className={s.panel}>
            <h2>New resume review</h2>
            <ReviewForm onStarted={(run) => navigate(`/app/ai/${run.id}`)} />
          </section>

          <section>
            <div className={d.tabs} role="tablist" aria-label="History">
              {TABS.map((t) => (
                <button
                  key={t.kind}
                  role="tab"
                  aria-selected={kind === t.kind}
                  className={d.tab}
                  onClick={() => setKind(t.kind)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {runs.isPending ? (
              <div className="stack" style={{ gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={66} />
                ))}
              </div>
            ) : runs.data?.length ? (
              <RunHistory runs={runs.data} />
            ) : (
              <EmptyState icon="✨" title="Nothing here yet" text={tab.empty} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
