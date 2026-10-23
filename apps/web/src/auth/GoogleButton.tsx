import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import type { User } from '../api/types';
import { currentTheme, type Theme } from '../components/ui';
import { useAuth } from './AuthContext';
import s from './GoogleButton.module.css';

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

/**
 * In-app browsers (LinkedIn, Facebook, Instagram, Gmail/Google app, Android WebViews...).
 * Google blocks sign-in inside them ("disallowed_useragent"), so the button would never appear.
 */
const IN_APP_BROWSER = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|; wv\)|GSA\/|MicroMessenger/i;
const isInAppBrowser = () => IN_APP_BROWSER.test(navigator.userAgent);

/** How long Google gets to draw its button before we show the email fallback note. */
const RENDER_TIMEOUT_MS = 3000;

type Status = 'loading' | 'ready' | 'in-app' | 'failed';

function InAppHint() {
  const [copied, setCopied] = useState<boolean | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={s.note} role="note">
      <p>
        Google sign-in isn't available in this in-app browser. Open this page in Safari or Chrome,
        or use email below.
      </p>
      <button type="button" className={s.copy} onClick={copy}>
        {copied === null
          ? 'Copy link'
          : copied
            ? 'Link copied ✓'
            : 'Copy failed: use the menu to open in browser'}
      </button>
    </div>
  );
}

/**
 * "Continue with Google", followed by `divider`. Renders nothing when Google sign-in is not
 * configured, and a short note instead of an empty space when Google can't load.
 */
export function GoogleButton({
  onSuccess,
  onError,
  divider,
}: {
  onSuccess: (user: User) => void;
  onError: (msg: string) => void;
  divider: ReactNode;
}) {
  const { config } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const clientId = config.googleClientId;
  const theme = useTheme();
  const [status, setStatus] = useState<Status>(() => (isInAppBrowser() ? 'in-app' : 'loading'));
  const unavailable = status === 'in-app' || status === 'failed';

  useEffect(() => {
    if (!clientId || unavailable) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
        // Blockers and some browsers let the script load but never draw the button.
        timer = setTimeout(() => {
          if (!cancelled) setStatus(ref.current?.childElementCount ? 'ready' : 'failed');
        }, RENDER_TIMEOUT_MS);
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clientId, theme, unavailable, onSuccess, onError]);

  if (!clientId) return null;
  if (status === 'in-app') {
    return (
      <>
        <InAppHint />
        {divider}
      </>
    );
  }
  if (status === 'failed') {
    return <p className={s.failed}>Google sign-in couldn't load here. You can still use email.</p>;
  }
  // Google's button is an iframe with a light color scheme. In a dark page the browser paints a
  // mismatched iframe with an opaque white backdrop, so keep its container light to stay transparent.
  return (
    <>
      <div
        ref={ref}
        style={{ minHeight: 44, display: 'flex', justifyContent: 'center', colorScheme: 'light' }}
      />
      {divider}
    </>
  );
}
