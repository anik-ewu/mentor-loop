import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import s from './Toast.module.css';

type Kind = 'success' | 'error';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: Kind = 'success') => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-2), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={s.region} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${s.toast} ${s[t.kind]}`}>
            <span className={s.icon} aria-hidden>
              {t.kind === 'success' ? '✓' : '!'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
