import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import type { AiKind } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { ButtonLink } from '../../../components/Button';
import { EmptyState, Skeleton, usePageTitle } from '../../../components/ui';
import { GenerateForm } from './GenerateForm';
import { ReviewForm } from './ReviewForm';
import { RunHistory } from './RunHistory';
import s from './ai.module.css';
import d from '../../dashboard.module.css';

const TABS: { kind: AiKind; label: string; title: string; empty: string }[] = [
  {
    kind: 'resume_review',
    label: 'Reviews',
    title: 'New resume review',
    empty: 'Your resume reviews and job matches show up here.',
  },
  {
    kind: 'interview_questions',
    label: 'Interview prep',
    title: 'New interview prep',
    empty: 'Pick a saved job on the left to generate likely interview questions.',
  },
  {
    kind: 'cover_letter',
    label: 'Cover letters',
    title: 'New cover letter',
    empty: 'Pick a saved job and a resume review on the left to draft a cover letter.',
  },
];

export function AiCoach() {
  usePageTitle('AI Coach');
  const { config } = useAuth();
  const navigate = useNavigate();
  // The tab lives in the URL so review results can link straight to a prefilled form.
  const [params, setParams] = useSearchParams();
  const kind = TABS.find((t) => t.kind === params.get('tab'))?.kind ?? 'resume_review';
  const setKind = (k: AiKind) =>
    setParams(k === 'resume_review' ? {} : { tab: k }, { replace: true });
  const openRun = (run: { id: string }) => navigate(`/app/ai/${run.id}`);
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
            <h2>{tab.title}</h2>
            {kind === 'resume_review' ? (
              <ReviewForm onStarted={openRun} />
            ) : (
              <GenerateForm
                key={kind}
                tool={kind === 'interview_questions' ? 'questions' : 'letter'}
                initialJobId={params.get('job') ?? undefined}
                initialReviewId={params.get('review') ?? undefined}
                onStarted={openRun}
              />
            )}
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
