import s from './HeartbeatLine.module.css';

const PATH =
  'M0 30 H70 L80 30 L88 12 L98 48 L108 4 L118 40 L124 30 H200 L210 30 L216 20 L224 38 L230 30 H300';

/** Animated ECG trace: the product's "heartbeat". */
export function HeartbeatLine({ stretch = false }: { stretch?: boolean }) {
  return (
    <svg
      className={stretch ? s.stretch : s.svg}
      viewBox="0 0 300 52"
      preserveAspectRatio={stretch ? 'none' : undefined}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="ml-ecg-gradient" x1="0" x2="1">
          <stop offset="0" stopColor="#5b4cf0" />
          <stop offset="0.5" stopColor="#8f4cf2" />
          <stop offset="1" stopColor="#d14bc6" />
        </linearGradient>
      </defs>
      <path
        className={s.track}
        d={PATH}
        vectorEffect="non-scaling-stroke"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        className={s.line}
        d={PATH}
        vectorEffect="non-scaling-stroke"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
