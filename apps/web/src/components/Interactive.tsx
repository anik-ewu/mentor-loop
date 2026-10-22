import { useEffect, useRef, type HTMLAttributes, type PointerEvent } from 'react';
import s from './Interactive.module.css';

const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Section with a soft glow that follows the mouse. */
export function CursorGlow({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`);
    el.style.setProperty('--y', `${e.clientY - r.top}px`);
  };

  return (
    <div ref={ref} className={`${s.glow} ${className ?? ''}`} onPointerMove={onMove} {...rest}>
      {children}
    </div>
  );
}

/** Card that tilts slightly toward the cursor, with a spotlight. No-op on touch screens. */
export function TiltCard({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const MAX_DEG = 6;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !canHover()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${(px - 0.5) * MAX_DEG * 2}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * MAX_DEG * 2}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };

  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };

  return (
    <div
      ref={ref}
      className={`${s.tilt} ${className ?? ''}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Fades children in when they scroll into view. */
export function Reveal({
  className,
  children,
  delay = 0,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add('is-visible');
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className ?? ''}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </div>
  );
}
