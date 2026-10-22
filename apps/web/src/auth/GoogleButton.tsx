import { useEffect, useRef } from 'react';
import { authApi } from '../api/auth';
import type { User } from '../api/types';
import { useAuth } from './AuthContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: {
            client_id: string;
            callback: (r: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  if (window.google) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed to load'));
    document.head.appendChild(script);
  });
}

/** "Continue with Google". Renders nothing when Google sign-in is not configured. */
export function GoogleButton({
  onSuccess,
  onError,
}: {
  onSuccess: (user: User) => void;
  onError: (msg: string) => void;
}) {
  const { config } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const clientId = config.googleClientId;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) =>
            authApi.google(credential).then(onSuccess, (e: Error) => onError(e.message)),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(ref.current.offsetWidth || 360, 400),
        });
      })
      .catch(() => onError('Google sign-in is unavailable right now'));
    return () => {
      cancelled = true;
    };
  }, [clientId, onSuccess, onError]);

  if (!clientId) return null;
  return <div ref={ref} style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }} />;
}
