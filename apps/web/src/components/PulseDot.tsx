import type { CSSProperties } from 'react';
import s from './PulseDot.module.css';

/** A "live" status dot with a soft expanding ring. */
export function PulseDot({ color, size = 10 }: { color?: string; size?: number }) {
  const style = { '--size': `${size}px`, ...(color && { '--color': color }) } as CSSProperties;
  return <span className={s.dot} style={style} aria-hidden />;
}
