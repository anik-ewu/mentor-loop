import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { servicesApi } from '../../../api/services';
import type { AiRun, ReviewResult as Review } from '../../../api/types';
import { ButtonLink } from '../../../components/Button';
import { ArrowRightIcon } from '../../../components/icons';
import { useToast } from '../../../components/Toast';
import s from './ai.module.css';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function ScoreRing({ value, label }: { value: number; label: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const color = value >= 75 ? 'var(--success)' : value >= 55 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className={s.ring}>
      <div className={s.ringSvg} role="img" aria-label={`${label}: ${value} out of 100`}>
        <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden>
          <circle cx="46" cy="46" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
          <circle
            cx="46"
            cy="46"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            style={{ transition: 'stroke-dashoffset 0.9s var(--ease-out)' }}
          />
        </svg>
        <span className={s.ringValue}>{value}</span>
      </div>
      {label}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={s.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast('Could not copy. Select the text and copy it instead.', 'error');
        }
      }}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

/** Interview prep and a cover letter, prefilled with this review and its job. */
function NextSteps({ run }: { run: AiRun<Review> }) {
  const link = (tab: string) => {
    const params = new URLSearchParams({ tab, review: run.id });
    if (run.jobId) params.set('job', run.jobId);
    return `/app/ai?${params}`;
  };
  return (
    <section className={`${s.panel} ${s.section}`}>
      <h3>Next steps</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Use this review to prepare for {run.job ? `${run.job.company}` : 'a saved job'}: practise
        likely questions, including ones about your own projects, or draft a cover letter built only
        from your resume.
      </p>
      <div className="row">
        <ButtonLink to={link('interview_questions')} variant="primary">
          Generate interview questions
        </ButtonLink>
        <ButtonLink to={link('cover_letter')}>Draft cover letter</ButtonLink>
      </div>
    </section>
  );
}

/** Link to book a human Resume Deep-Dive with this review attached. */
function BookCta({ reviewId }: { reviewId: string }) {
  const services = useQuery({ queryKey: ['services', 'active'], queryFn: servicesApi.listActive });
  const deepDive =
    services.data?.find((sv) => /resume/i.test(sv.name)) ?? services.data?.[0] ?? null;
  const params = new URLSearchParams({ tab: 'book', review: reviewId });
  if (deepDive) params.set('service', deepDive.id);
  return (
    <div className={s.cta}>
      <div>
        <h3>Want a human to go deeper?</h3>
        <p>Book a Resume Deep-Dive and your mentor gets this review before the call.</p>
      </div>
      <ButtonLink to={`/app/sessions?${params}`} variant="light">
        Book a Resume Deep-Dive with this review <ArrowRightIcon />
      </ButtonLink>
    </div>
  );
}

export function ReviewResult({ run }: { run: AiRun<Review> }) {
  const r = run.result!;
  const improvements = [...r.improvements].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  return (
    <div className={s.result}>
      <section className={`${s.panel} ${s.rings}`}>
        <ScoreRing value={r.overallScore} label="Overall" />
        <ScoreRing value={r.atsScore} label="ATS" />
        {r.jobMatch && <ScoreRing value={r.jobMatch.score} label="Job match" />}
        <div className={s.summary}>
          <strong style={{ textTransform: 'capitalize' }}>{r.seniority} level</strong>
          <p>{r.summary}</p>
        </div>
      </section>

      {r.jobMatch && (
        <section className={`${s.panel} ${s.section}`}>
          <h3>
            Match for {run.job ? `${run.job.title} at ${run.job.company}` : run.input.targetRole}
          </h3>
          <p style={{ marginBottom: 12 }}>{r.jobMatch.verdict}</p>
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <small className="subtle">You have</small>
              <div className={s.chips}>
                {r.jobMatch.matchedSkills.map((k) => (
                  <span key={k} className={`${s.chip} ${s.chipGood}`}>
                    ✓ {k}
                  </span>
                ))}
              </div>
            </div>
            {r.jobMatch.missingSkills.length > 0 && (
              <div>
                <small className="subtle">Missing</small>
                <div className={s.chips}>
                  {r.jobMatch.missingSkills.map((k) => (
                    <span key={k} className={`${s.chip} ${s.chipBad}`}>
                      ✗ {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className={`${s.panel} ${s.section}`}>
        <h3>What to fix first</h3>
        <ul className={s.list}>
          {improvements.map((imp, i) => (
            <li key={i} className={s.fix}>
              <span className={`${s.priority} ${s[imp.priority]}`}>{imp.priority}</span>
              <div>
                <strong>{imp.issue}</strong>
                <p>{imp.fix}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {r.bulletRewrites.length > 0 && (
        <section className={`${s.panel} ${s.section}`}>
          <h3>Stronger bullet points</h3>
          <ul className={s.list}>
            {r.bulletRewrites.map((b, i) => (
              <li key={i} className={s.rewrite}>
                <span className={s.before}>{b.original}</span>
                <span className={s.after}>
                  → {b.improved}
                  <CopyButton text={b.improved} />
                </span>
                <span className={s.why}>{b.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${s.panel} ${s.section}`}>
        <h3>Section scores</h3>
        <div className={s.bars}>
          {r.sections.map((sec) => (
            <div key={sec.name} className={s.bar}>
              <div className={s.barHead}>
                <span>{sec.name}</span>
                <span>{sec.score}</span>
              </div>
              <div className={s.barTrack}>
                <div className={s.barFill} style={{ width: `${sec.score}%` }} />
              </div>
              <p>{sec.feedback}</p>
            </div>
          ))}
        </div>
      </section>

      {(r.missingKeywords.length > 0 || r.strengths.length > 0) && (
        <section className={`${s.panel} ${s.section}`}>
          {r.missingKeywords.length > 0 && (
            <>
              <h3>Keywords to add</h3>
              <div className={s.chips} style={{ marginBottom: 16 }}>
                {r.missingKeywords.map((k) => (
                  <span key={k} className={s.chip}>
                    {k}
                  </span>
                ))}
              </div>
            </>
          )}
          {r.strengths.length > 0 && (
            <>
              <h3>Strengths</h3>
              <ul className={s.bullets}>
                {r.strengths.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {r.redFlags.length > 0 && (
        <section className={`${s.panel} ${s.section}`}>
          <h3>Red flags</h3>
          <ul className={s.bullets}>
            {r.redFlags.map((x, i) => (
              <li key={i}>⚠️ {x}</li>
            ))}
          </ul>
        </section>
      )}

      <NextSteps run={run} />
      <BookCta reviewId={run.id} />
    </div>
  );
}
