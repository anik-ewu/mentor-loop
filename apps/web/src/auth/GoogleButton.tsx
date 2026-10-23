import { useEffect, useRef, useState } from 'react';
import { authApi } from '../api/auth';
import type { User } from '../api/types';
import { currentTheme, type Theme } from '../components/ui';
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

/** Follows the theme toggle (data-theme) and the OS setting, so the button can be redrawn to match. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const update = () => setTheme(currentTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);
  return theme;
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
  const theme = useTheme();

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
        ref.current.replaceChildren();
        window.google.accounts.id.renderButton(ref.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
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
  }, [clientId, theme, onSuccess, onError]);

  if (!clientId) return null;
  // Google's button is an iframe with a light color scheme. In a dark page the browser paints a
  // mismatched iframe with an opaque white backdrop, so keep its container light to stay transparent.
  return (
    <div
      ref={ref}
      style={{ minHeight: 44, display: 'flex', justifyContent: 'center', colorScheme: 'light' }}
    />
  );
}
