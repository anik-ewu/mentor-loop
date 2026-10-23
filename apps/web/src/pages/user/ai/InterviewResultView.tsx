import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../../api/ai';
import type { AiRun, InterviewResult } from '../../../api/types';
import { useToast } from '../../../components/Toast';
import s from './ai.module.css';

const CATEGORY: Record<InterviewResult['rounds'][number]['category'], string> = {
  technical: '🛠️ Technical',
  system_design: '🏗️ System design',
  behavioral: '🤝 Behavioral',
  role_specific: '🎯 Role-specific',
  company_culture: '🏢 Company and culture',
};

const DIFFICULTY_CLASS = { easy: s.low, medium: s.medium, hard: s.high } as const;

/** Ticks a question as practised, updating the cached run straight away. */
function usePractice(run: AiRun<InterviewResult>) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['ai', 'run', run.id];
  return useMutation({
    mutationFn: ({ q, done }: { q: string; done: boolean }) => aiApi.setPracticed(run.id, q, done),
    onMutate: ({ q, done }) => {
      const before = qc.getQueryData<AiRun<InterviewResult>>(key);
      qc.setQueryData<AiRun<InterviewResult>>(key, (old) =>
        old
          ? {
              ...old,
              practiced: done
                ? [...new Set([...old.practiced, q])]
                : old.practiced.filter((x) => x !== q),
            }
          : old,
      );
      return { before };
    },
    onError: (e, _vars, ctx) => {
      qc.setQueryData(key, ctx?.before);
      toast(e.message, 'error');
    },
    onSuccess: (practiced) =>
      qc.setQueryData<AiRun<InterviewResult>>(key, (old) => old && { ...old, practiced }),
  });
}

/**
 * Accordion by round; each question opens to show why it's asked and the answer points.
 * A checkbox per question tracks what the user has practised.
 */
export function InterviewResultView({ run }: { run: AiRun<InterviewResult> }) {
  const r = run.result!;
  const practice = usePractice(run);
  const done = new Set(run.practiced ?? []);
  const all = r.rounds.flatMap((x) => x.questions);
  const fromResume = all.filter((q) => q.fromResume).length;
  const pct = all.length ? Math.round((done.size / all.length) * 100) : 0;

  return (
    <div className={s.result}>
      <section className={`${s.panel} ${s.practice}`}>
        <div className={s.practiceHead}>
          <strong>
            {done.size} / {all.length} practised
          </strong>
          <span className="subtle">
            {fromResume > 0 && `${fromResume} about your own work · `}Tick a question once you can
            answer it out loud.
          </span>
        </div>
        <div
          className={s.barTrack}
          role="progressbar"
          aria-label="Questions practised"
          aria-valuemin={0}
          aria-valuemax={all.length}
          aria-valuenow={done.size}
        >
          <div className={s.barFill} style={{ width: `${pct}%` }} />
        </div>
      </section>

      {r.rounds.map((round, ri) => (
        <section key={round.category} className={`${s.panel} ${s.section} ${s.round}`}>
          <h3>
            {CATEGORY[round.category]}{' '}
            <span className="subtle">
              ({round.questions.filter((_, qi) => done.has(`${ri}-${qi}`)).length}/
              {round.questions.length})
            </span>
          </h3>
          <div className="stack" style={{ gap: 8 }}>
            {round.questions.map((q, qi) => {
              const key = `${ri}-${qi}`;
              const checked = done.has(key);
              return (
                <div key={key} className={`${s.practiceRow} ${checked ? s.practiced : ''}`}>
                  <input
                    type="checkbox"
                    className={s.check}
                    checked={checked}
                    aria-label={`Practised: ${q.question}`}
                    onChange={(e) => practice.mutate({ q: key, done: e.target.checked })}
                  />
                  <details className={s.question}>
                    <summary>
                      <span>{q.question}</span>
                      <span className={s.tags}>
                        {q.fromResume && (
                          <span className={`${s.chip} ${s.chipGood}`}>Your work</span>
                        )}
                        <span className={`${s.priority} ${DIFFICULTY_CLASS[q.difficulty]}`}>
                          {q.difficulty}
                        </span>
                      </span>
                    </summary>
                    <div className={s.questionBody}>
                      <p>
                        <strong>Why they ask:</strong> {q.whyAsked}
                      </p>
                      <strong>A strong answer covers</strong>
                      <ul className={s.bullets}>
                        {q.answerPoints.map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {r.questionsToAsk.length > 0 && (
        <section className={`${s.panel} ${s.section}`}>
          <h3>Questions you can ask them</h3>
          <ul className={s.bullets}>
            {r.questionsToAsk.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
