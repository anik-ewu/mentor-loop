import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.header}>
          <h2>{title}</h2>
          <button className={s.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
