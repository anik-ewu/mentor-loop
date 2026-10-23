import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AiUsage } from '../../api/types';
import { usageApi } from '../../api/usage';
import { EmptyState, Skeleton, usePageTitle } from '../../components/ui';
import { formatDay, formatTime } from '../../lib/format';
import { KIND_LABEL } from '../user/ai/RunHistory';
import d from '../dashboard.module.css';
import s from './usage.module.css';

const PERIODS = [7, 30, 90] as const;

/** Cents are too coarse for single runs on a cheap model, so small amounts keep 4 decimals. */
const money = (usd: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: usd > 0 && usd < 1 ? 4 : 2,
  }).format(usd);

const tokens = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const utcDay = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Every UTC day in the period, oldest first, with zero for days without runs. */
function fillDays(byDay: AiUsage['byDay'], days: number) {
  const known = new Map(byDay.map((x) => [x.day, x]));
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)),
    );
    const day = date.toISOString().slice(0, 10);
    return { day, label: utcDay.format(date), ...(known.get(day) ?? { runs: 0, costUsd: 0 }) };
  });
}

export function Usage() {
  usePageTitle('AI usage');
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const usage = useQuery({ queryKey: ['usage', days], queryFn: () => usageApi.get(days) });
  const data = usage.data;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1>AI usage</h1>
          <p>Where tokens and money go, what fails and who hits the limits.</p>
        </div>
        <div className={s.periods} role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={s.period}
              aria-pressed={days === p}
              onClick={() => setDays(p)}
            >
              {p} days
            </button>
          ))}
        </div>
      </div>

      {usage.isError ? (
        <EmptyState icon="📉" title="Couldn't load usage" text={(usage.error as Error).message} />
      ) : !data ? (
        <div className={s.stack}>
          <Skeleton height={96} style={{ borderRadius: 20 }} />
          <Skeleton height={240} style={{ borderRadius: 20 }} />
        </div>
      ) : (
        <div className={s.stack}>
          <BudgetMeter month={data.month} />

          <div className={d.stats}>
            <Stat label={`Cost · ${days} days`} value={money(data.totals.costUsd)} />
            <Stat label="AI runs" value={String(data.totals.runs)} />
            <Stat
              label="Tokens in"
              value={tokens(data.totals.inputTokens)}
              hint={`${tokens(data.totals.outputTokens)} out`}
            />
            <Stat
              label="Failed runs"
              value={String(data.totals.failed)}
              hint={
                data.totals.runs
                  ? `${Math.round((data.totals.failed / data.totals.runs) * 100)}% of runs`
                  : undefined
              }
            />
          </div>

          <section className="card">
            <div className={s.cardHead}>
              <h2>Cost per day</h2>
              <span className="subtle">UTC days · {data.model}</span>
            </div>
            <DailyCost days={fillDays(data.byDay, days)} />
          </section>

          <div className={s.grid}>
            <section className="card">
              <h2 className={s.title}>By feature</h2>
              {data.byKind.length ? (
                <Table head={['Feature', 'Runs', 'Cost']}>
                  {data.byKind.map((k) => (
                    <tr key={k.kind}>
                      <td>
                        <span className={s.who}>
                          {KIND_LABEL[k.kind]}
                          <small>
                            {tokens(k.inputTokens)} in · {tokens(k.outputTokens)} out
                          </small>
                        </span>
                      </td>
                      <td>{k.runs}</td>
                      <td>{money(k.costUsd)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <p className="subtle">No AI runs in this period.</p>
              )}
            </section>

            <section className="card">
              <h2 className={s.title}>Top users by cost</h2>
              {data.topUsers.length ? (
                <Table head={['User', 'Runs', 'Cost']}>
                  {data.topUsers.map((u, i) => (
                    <tr key={u.user?.id ?? i}>
                      <td>
                        <Who user={u.user} />
                      </td>
                      <td>{u.runs}</td>
                      <td>{money(u.costUsd)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <p className="subtle">No AI runs in this period.</p>
              )}
            </section>

            <section className="card">
              <h2 className={s.title}>Limit hits</h2>
              <p className={s.hits}>
                <span>
                  <strong>{data.limitHits.daily}</strong> daily limit
                </span>
                <span>
                  <strong>{data.limitHits.budget}</strong> monthly budget
                </span>
              </p>
              {data.limitHits.topUsers.length > 0 && (
                <Table head={['User', 'Times turned away']}>
                  {data.limitHits.topUsers.map((h, i) => (
                    <tr key={h.user?.id ?? i}>
                      <td>
                        <Who user={h.user} />
                      </td>
                      <td>{h.hits}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>

            <section className="card">
              <h2 className={s.title}>Recent failures</h2>
              {data.recentFailures.length ? (
                <ul className={s.failures}>
                  {data.recentFailures.map((f) => (
                    <li key={f.id}>
                      <div>
                        <strong>{KIND_LABEL[f.kind]}</strong>
                        <span className="subtle">
                          {' '}
                          · {formatDay(f.createdAt)} {formatTime(f.createdAt)}
                          {f.costUsd > 0 && ` · ${money(f.costUsd)} spent`}
                        </span>
                      </div>
                      <p>{f.error ?? 'Unknown error'}</p>
                      <Who user={f.user} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">No failures in this period.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={d.stat}>
      <span>{label}</span>
      <strong>
        {value}
        {hint && <small className={s.statHint}>{hint}</small>}
      </strong>
    </div>
  );
}

function Who({ user }: { user: AiUsage['topUsers'][number]['user'] }) {
  if (!user) return <span className="subtle">Deleted user</span>;
  return (
    <span className={s.who}>
      {user.name}
      <small>{user.email}</small>
    </span>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Month-to-date spend against AI_MONTHLY_BUDGET_USD (0 = no cap). */
function BudgetMeter({ month }: { month: AiUsage['month'] }) {
  if (!month.budgetUsd) {
    return (
      <section className={`card ${s.budget}`}>
        <div className={s.cardHead}>
          <h2>This month: {money(month.costUsd)}</h2>
          <span className="subtle">No monthly budget set (AI_MONTHLY_BUDGET_USD)</span>
        </div>
      </section>
    );
  }
  const pct = Math.round((month.costUsd / month.budgetUsd) * 100);
  const state = pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok';
  const note = {
    ok: 'Within budget',
    near: 'Close to the budget',
    over: 'Budget reached: AI is paused until next month',
  }[state];
  return (
    <section className={`card ${s.budget}`}>
      <div className={s.cardHead}>
        <h2>
          This month: {money(month.costUsd)}{' '}
          <span className="subtle">of {money(month.budgetUsd)}</span>
        </h2>
        <span className={s.budgetNote} data-state={state}>
          {state !== 'ok' && <span aria-hidden>⚠ </span>}
          {note} · {pct}%
        </span>
      </div>
      <div
        className={s.meter}
        role="meter"
        aria-label="Monthly AI budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        data-state={state}
      >
        <span style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </section>
  );
}

const CHART_H = 180;
const AXIS_W = 56;

/** Single-series bar chart; each bar is its own hover/focus target with a tooltip. */
function DailyCost({ days }: { days: (AiUsage['byDay'][number] & { label: string })[] }) {
  const [active, setActive] = useState<number | null>(null);
  // Drawn at the container's real width, so axis text stays 11px on a phone.
  const [width, setWidth] = useState(720);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(...days.map((x) => x.costUsd));
  if (max === 0) {
    // Keep the measured container mounted, so the chart sizes itself once there is data.
    return (
      <div className={s.chart} ref={ref}>
        <p className="subtle">No AI spend in this period.</p>
      </div>
    );
  }

  const plotW = width - AXIS_W;
  const slot = plotW / days.length;
  const gap = Math.min(2, slot / 4);
  const barW = slot - gap;
  const r = Math.min(4, barW / 2);
  const ticks = [0, max / 2, max];
  const y = (v: number) => CHART_H - (v / max) * CHART_H;
  // About one date label per 70px.
  const labelEvery = Math.ceil(days.length / Math.max(2, Math.floor(plotW / 70)));
  const hovered = active === null ? null : days[active];

  return (
    <div className={s.chart} ref={ref}>
      <svg viewBox={`0 0 ${width} ${CHART_H + 24}`} role="img" aria-label="Daily AI cost">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={AXIS_W} x2={width} y1={y(t)} y2={y(t)} className={s.grid} />
            <text
              x={AXIS_W - 8}
              y={y(t)}
              className={s.axis}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {money(t)}
            </text>
          </g>
        ))}
        {days.map((x, i) => {
          const h = (x.costUsd / max) * CHART_H;
          const left = AXIS_W + i * slot + gap / 2;
          const top = CHART_H - h;
          const rr = Math.min(r, h);
          return (
            <g
              key={x.day}
              tabIndex={0}
              className={s.barGroup}
              data-active={active === i || undefined}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${x.label}: ${money(x.costUsd)}, ${x.runs} runs`}
            >
              {/* Hit area: the full column, not only the painted bar. */}
              <rect x={AXIS_W + i * slot} y={0} width={slot} height={CHART_H} fill="transparent" />
              {h > 0 && (
                <path
                  className={s.bar}
                  d={`M${left},${CHART_H} V${top + rr} Q${left},${top} ${left + rr},${top} H${left + barW - rr} Q${left + barW},${top} ${left + barW},${top + rr} V${CHART_H} Z`}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={left + barW / 2} y={CHART_H + 16} className={s.axis} textAnchor="middle">
                  {x.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && active !== null && (
        <div
          className={s.tooltip}
          style={{ left: `${((AXIS_W + (active + 0.5) * slot) / width) * 100}%` }}
          role="status"
        >
          <strong>{money(hovered.costUsd)}</strong>
          <span>
            {hovered.label} · {hovered.runs} {hovered.runs === 1 ? 'run' : 'runs'}
          </span>
        </div>
      )}
    </div>
  );
}
