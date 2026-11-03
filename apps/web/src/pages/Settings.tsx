import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { Field, usePageTitle } from '../components/ui';
import s from './Settings.module.css';

/** Inline message for a field, or the general message when the API named no field. */
function fieldError(err: unknown, field: string) {
  if (err instanceof ApiError && err.fields[field]) return err.fields[field]![0];
  return (err as Error).message;
}

function ChangePassword() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      setUser(await authApi.changePassword(form));
      setForm({ currentPassword: '', newPassword: '' });
      toast('Password changed. Other devices have been logged out.');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, v[0]])));
      } else {
        setErrors({ currentPassword: (err as Error).message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        error={errors.currentPassword}
        required
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        value={form.newPassword}
        onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
        error={errors.newPassword}
        hint="At least 12 characters"
        required
      />
      <Button type="submit" variant="primary" loading={submitting}>
        Change password
      </Button>
    </form>
  );
}

type Setup = { secret: string; qr: string };

function TwoFactor() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const run = (field: string, action: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(fieldError(err, field));
    } finally {
      setSubmitting(false);
    }
  };

  const start = run('password', async () => {
    const { secret, otpauthUrl } = await authApi.twoFactorSetup(password || undefined);
    // Loaded only here: almost nobody needs the QR code library.
    const { toDataURL } = await import('qrcode');
    setSetup({ secret, qr: await toDataURL(otpauthUrl, { margin: 1, width: 200 }) });
    setPassword('');
  });

  const enable = run('code', async () => {
    const codes = await authApi.twoFactorEnable(code);
    setRecoveryCodes(codes);
    setSetup(null);
    setCode('');
    toast('Two-factor login is on');
  });

  const disable = run('code', async () => {
    setUser(await authApi.twoFactorDisable(code));
    setCode('');
    toast('Two-factor login is off');
  });

  if (recoveryCodes) {
    return (
      <div className={s.form}>
        <p className={s.note} role="status">
          Save these recovery codes somewhere safe. Each works once if you lose your phone, and they
          won't be shown again.
        </p>
        <ul className={s.codes}>
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          variant="primary"
          // Updates the page only now: refreshing the user earlier would unmount these codes.
          onClick={async () => {
            setUser(await authApi.me());
            setRecoveryCodes(null);
          }}
        >
          I've saved them
        </Button>
      </div>
    );
  }

  if (user?.twoFactorEnabled) {
    return (
      <form className={s.form} onSubmit={disable} noValidate>
        <p className={s.note}>Two-factor login is on for this account.</p>
        <Field
          label="Code from your app, or a recovery code"
          name="code"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" variant="ghost" loading={submitting}>
          Turn off two-factor login
        </Button>
      </form>
    );
  }

  if (setup) {
    return (
      <form className={s.form} onSubmit={enable} noValidate>
        <p className={s.note}>
          Scan this with an authenticator app such as Google Authenticator, or enter the key by
          hand, then type the 6-digit code it shows.
        </p>
        <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} />
        <code className={s.secret}>{setup.secret}</code>
        <Field
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" variant="primary" loading={submitting}>
          Turn on
        </Button>
      </form>
    );
  }

  return (
    <form className={s.form} onSubmit={start} noValidate>
      <p className={s.note}>
        Ask for a code from your phone at every login, so a stolen password isn't enough to get in.
      </p>
      {user?.hasPassword ? (
        <Field
          label="Your password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          required
        />
      ) : (
        error && (
          <p className={s.note} role="alert">
            {error}
          </p>
        )
      )}
      <Button type="submit" variant="primary" loading={submitting}>
        Set up two-factor login
      </Button>
    </form>
  );
}

export function Settings() {
  usePageTitle('Settings');
  const { user, config } = useAuth();

  return (
    <div className={s.page}>
      <h1>Settings</h1>
      {user?.isDemo ? (
        <section className="card">
          <p className={s.note}>
            This is a shared demo account, so its security settings are locked.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Password</h2>
            {user?.hasPassword ? (
              <ChangePassword />
            ) : (
              <p className={s.note}>
                You sign in with Google, so there's no password yet.{' '}
                {config.passwordResetEnabled ? (
                  <Link to="/forgot-password">Add one by email</Link>
                ) : (
                  'Adding one by email is not available on this site right now.'
                )}
              </p>
            )}
          </section>
          {user?.role === 'admin' && (
            <section className="card">
              <h2>Two-factor login</h2>
              <TwoFactor />
            </section>
          )}
        </>
      )}
    </div>
  );
}
