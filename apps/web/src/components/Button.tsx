import { type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import s from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
type Size = 'sm' | 'md' | 'lg';

interface StyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const classes = ({ variant = 'secondary', size = 'md', block }: StyleProps, extra?: string) =>
  [s.btn, variant !== 'secondary' && s[variant], size !== 'md' && s[size], block && s.block, extra]
    .filter(Boolean)
    .join(' ');

/** Material-style ripple from the click point; purely decorative. */
function ripple(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const dot = document.createElement('span');
  dot.className = s.ripple;
  dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  el.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove());
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean;
}

export function Button({
  variant,
  size,
  block,
  loading,
  className,
  children,
  onClick,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        ripple(e);
        onClick?.(e);
      }}
      {...rest}
    >
      {loading && <span className={s.spinner} aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  onClick,
  ...rest
}: LinkProps & StyleProps) {
  return (
    <Link
      className={classes({ variant, size, block }, className)}
      onClick={(e) => {
        ripple(e);
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
