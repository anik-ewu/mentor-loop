import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { homeFor, useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { CursorGlow } from '../components/Interactive';
import { useToast } from '../components/Toast';
import { Field } from '../components/ui';
import s from './Auth.module.css';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.email?.[0] ?? err.message) : 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CursorGlow className={s.wrap}>
      <div className={s.card}>
        <h1>Reset your password</h1>
        {sent ? (
          <p className={s.notice} role="status">
            If an account exists for <b>{email}</b>, a reset link is on its way. It expires in 1
            hour, so check your inbox (and spam folder).
          </p>
        ) : (
          <>
            <p className={s.sub}>
              Enter your email and we'll send a link to set a new password. Signed up with Google?
              This also lets you add a password.
            </p>
            <form className={s.form} onSubmit={submit} noValidate>
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                required
              />
              <Button type="submit" variant="primary" size="lg" block loading={submitting}>
                Send reset link
              </Button>
            </form>
          </>
        )}
        <p className={s.footer}>
          Remembered it? <Link to="/login">Log in</Link>
        </p>
      </div>
    </CursorGlow>
  );
}

export function ResetPassword() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // Read once, then dropped from the URL so the token doesn't sit in history or get shared.
  const [token] = useState(() => params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (params.has('token')) setParams({}, { replace: true });
  }, [params, setParams]);

  if (!token) return <Navigate to="/forgot-password" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setAlert(null);
    setSubmitting(true);
    try {
      const u = await authApi.resetPassword({ token, password });
      setUser(u);
      toast('Password updated, you are logged in');
      navigate(homeFor(u), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields.password) setError(err.fields.password[0]);
      else setAlert((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <CursorGlow className={s.wrap}>
      <meta name="referrer" content="no-referrer" />
      <div className={s.card}>
        <h1>Choose a new password</h1>
        <p className={s.sub}>You'll be logged in right after.</p>
        <form className={s.form} onSubmit={submit} noValidate>
          {alert && (
            <div className={s.alert} role="alert">
              {alert} <Link to="/forgot-password">Send a new link</Link>
            </div>
          )}
          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            hint="At least 8 characters"
            required
          />
          <Button type="submit" variant="primary" size="lg" block loading={submitting}>
            Set password
          </Button>
        </form>
      </div>
    </CursorGlow>
  );
}
