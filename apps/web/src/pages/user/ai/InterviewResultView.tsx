import type { AiRun, InterviewResult } from '../../../api/types';
import s from './ai.module.css';

const CATEGORY: Record<InterviewResult['rounds'][number]['category'], string> = {
  technical: '🛠️ Technical',
  system_design: '🏗️ System design',
  behavioral: '🤝 Behavioral',
  role_specific: '🎯 Role-specific',
  company_culture: '🏢 Company and culture',
};

const DIFFICULTY_CLASS = { easy: s.low, medium: s.medium, hard: s.high } as const;

/** Accordion by round; each question opens to show why it's asked and the answer points. */
export function InterviewResultView({ run }: { run: AiRun<InterviewResult> }) {
  const r = run.result!;
  const total = r.rounds.reduce((n, round) => n + round.questions.length, 0);
  const fromResume = r.rounds.flatMap((x) => x.questions).filter((q) => q.fromResume).length;

  return (
    <div className={s.result}>
      <p className="muted">
        {total} questions{fromResume > 0 && `, ${fromResume} about your own work`}. Open one to see
        what the interviewer is looking for.
      </p>
      {r.rounds.map((round) => (
        <section key={round.category} className={`${s.panel} ${s.section} ${s.round}`}>
          <h3>
            {CATEGORY[round.category]} <span className="subtle">({round.questions.length})</span>
          </h3>
          <div className="stack" style={{ gap: 8 }}>
            {round.questions.map((q, i) => (
              <details key={i} className={s.question}>
                <summary>
                  <span>{q.question}</span>
                  <span className={s.tags}>
                    {q.fromResume && <span className={`${s.chip} ${s.chipGood}`}>Your work</span>}
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
            ))}
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
