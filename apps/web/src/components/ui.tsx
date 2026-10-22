import {
  useEffect,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import type { BookingStatus } from '../api/types';
import { initials } from '../lib/format';
import s from './ui.module.css';

export function Skeleton({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: number | string;
  style?: CSSProperties;
}) {
  return <div className={s.skeleton} style={{ height, width, ...style }} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <div className={s.emptyIcon} aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`${s.badge} ${s[status]}`}>{status}</span>;
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className={s.logo} aria-label="MentorLoop home">
      <img className={s.logoMark} src="/favicon.svg" alt="" />
      MentorLoop
    </Link>
  );
}

type Theme = 'light' | 'dark';

const currentTheme = (): Theme =>
  (document.documentElement.dataset.theme as Theme | undefined) ??
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('ml-theme', next);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    setTheme(next);
  };

  return (
    <button
      className={s.themeToggle}
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
}

export function Field({ label, error, hint, multiline, id, ...rest }: FieldProps) {
  const inputId = id ?? rest.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const common = {
    id: inputId,
    className: 'input',
    'aria-invalid': !!error,
    'aria-describedby': describedBy,
  };
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {multiline ? (
        <textarea {...common} {...(rest as InputHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...common} {...rest} />
      )}
      {error ? (
        <span id={`${inputId}-error`} className="field-error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${inputId}-hint`} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

/** Animates a number from 0 to `value`. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{shown}</>;
}

/** Live days/hours/minutes/seconds countdown to a date. */
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, new Date(to).getTime() - now);
  const units = [
    ['days', Math.floor(diff / 86_400_000)],
    ['hrs', Math.floor(diff / 3_600_000) % 24],
    ['min', Math.floor(diff / 60_000) % 60],
    ['sec', Math.floor(diff / 1000) % 60],
  ] as const;

  return (
    <div className={s.countdown} aria-label="Time until session">
      {units.map(([label, n]) => (
        <div key={label} className={s.unit}>
          <strong>{String(n).padStart(2, '0')}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
