import { useCallback, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import type { LoginResult } from '../api/types';
import { homeFor, useAuth } from '../auth/AuthContext';
import { DemoButtons } from '../auth/DemoButtons';
import { GoogleButton } from '../auth/GoogleButton';
import { Button } from '../components/Button';
import { CursorGlow } from '../components/Interactive';
import { useToast } from '../components/Toast';
import { Field, usePageTitle } from '../components/ui';
import s from './Auth.module.css';

type Mode = 'login' | 'signup';
type Errors = Record<string, string | undefined>;

const STRENGTH_COLORS = ['var(--danger)', 'var(--warning)', 'var(--info)', 'var(--success)'];

/** 0-4 score: length, mixed case, digits, symbols. Just a hint, the API enforces the rules. */
function passwordScore(pw: string) {
  if (!pw) return 0;
  return [
    pw.length >= 12,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length;
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, setUser, config, configLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const state = location.state as { from?: string; ticket?: string } | null;
  const from = state?.from;
  // Set when the first login step passed and the authenticator code is still needed.
  const [ticket, setTicket] = useState(state?.ticket ?? null);
  const [code, setCode] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const isSignup = mode === 'signup';
  usePageTitle(isSignup ? 'Sign up' : 'Log in');

  const onResult = useCallback(
    (result: LoginResult) => {
      if (!('user' in result)) {
        setTicket(result.ticket);
        return;
      }
      const u = result.user;
      setUser(u);
      toast(
        isSignup
          ? `Welcome to MentorLoop, ${u.name.split(' ')[0]}!`
          : `Welcome back, ${u.name.split(' ')[0]}!`,
      );
      navigate(from ?? homeFor(u), { replace: true });
    },
    [setUser, toast, navigate, from, isSignup],
  );
  const onGoogleError = useCallback((msg: string) => setAlert(msg), []);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await authApi.signup(form);
        setCheckEmail(true);
      } else {
        onResult(await authApi.login({ email: form.email, password: form.password }));
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, v[0]])));
      } else {
        setAlert((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    setSubmitting(true);
    try {
      onResult({ user: await authApi.twoFactorLogin({ ticket: ticket!, code }) });
    } catch (err) {
      setAlert((err as Error).message);
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const score = passwordScore(form.password);

  if (ticket) {
    return (
      <CursorGlow className={s.wrap}>
        <div className={s.card}>
          <h1>Enter your code</h1>
          <p className={s.sub}>Open your authenticator app and type the 6-digit code.</p>
          <form className={s.form} onSubmit={submitCode} noValidate>
            {alert && (
              <div className={s.alert} role="alert">
                {alert}
              </div>
            )}
            <Field
              label="Code"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint="Lost your phone? Enter a recovery code instead."
              required
            />
            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              Log in
            </Button>
          </form>
          <p className={s.footer}>
            {/* The ticket expires after 5 minutes, and may be in the location state after a reset. */}
            <Link
              to="/login"
              replace
              state={null}
              onClick={() => {
                setTicket(null);
                setAlert(null);
              }}
            >
              Back to log in
            </Link>
          </p>
        </div>
      </CursorGlow>
    );
  }

  if (checkEmail) {
    return (
      <CursorGlow className={s.wrap}>
        <div className={s.card}>
          <h1>Check your email</h1>
          <p className={s.notice} role="status">
            We sent a message to <b>{form.email}</b> with what to do next. If you don't see it,
            check your spam folder.
          </p>
          <p className={s.footer}>
            Already confirmed? <Link to="/login">Log in</Link>
          </p>
        </div>
      </CursorGlow>
    );
  }

  // Before the config arrives the form stays visible, so a slow API doesn't make it flicker away.
  const showForm = !isSignup || !configLoaded || config.emailSignupEnabled;

  return (
    <CursorGlow className={s.wrap}>
      <div className={s.card}>
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className={s.sub}>
          {isSignup
            ? 'Track your job search, sharpen your resume and get help when you need it.'
            : 'Log in to pick up your job search where you left off.'}
        </p>

        <GoogleButton
          onSuccess={onResult}
          onError={onGoogleError}
          divider={<div className={s.divider}>or with email</div>}
        />

        {!showForm && (
          <>
            {alert && (
              <div className={s.alert} role="alert">
                {alert}
              </div>
            )}
            <p className={s.notice} role="status">
              Sign-up with email is unavailable right now. Continue with Google above to create your
              account.
            </p>
          </>
        )}

        {showForm && (
          <form className={s.form} onSubmit={submit} noValidate>
            {alert && (
              <div className={s.alert} role="alert">
                {alert}
              </div>
            )}
            {isSignup && (
              <Field
                label="Full name"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={update('name')}
                error={errors.name}
                required
              />
            )}
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              required
            />
            <div className="field" style={{ gap: 6 }}>
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={update('password')}
                error={errors.password}
                hint={isSignup ? 'At least 12 characters' : undefined}
                required
              />
              {isSignup && form.password && (
                <div className={s.strength} aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      style={i < score ? { background: STRENGTH_COLORS[score - 1] } : undefined}
                    />
                  ))}
                </div>
              )}
              {!isSignup && config.passwordResetEnabled && (
                <Link to="/forgot-password" className={s.forgot}>
                  Forgot password?
                </Link>
              )}
            </div>
            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              {isSignup ? 'Create account' : 'Log in'}
            </Button>
          </form>
        )}

        <p className={s.footer}>
          {isSignup ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/signup">Create an account</Link>
            </>
          )}
        </p>

        <DemoSection />
      </div>
    </CursorGlow>
  );
}

function DemoSection() {
  const { config } = useAuth();
  if (!config.demoMode) return null;
  return (
    <div className={s.demo}>
      <span className="subtle">Just looking? Explore with a demo account</span>
      <DemoButtons size="sm" />
    </div>
  );
}
