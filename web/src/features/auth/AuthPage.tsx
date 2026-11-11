import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '../../../../shared/types';
import { api, ApiRequestError, errorMessage } from '../../lib/api';
import { clearCachedData, qk } from '../../lib/queryClient';
import { Button, Segmented, TextField } from '../../components/ui';
import { Logo } from '../shell/Logo';

type Mode = 'login' | 'register';
type Errors = Partial<Record<'displayName' | 'email' | 'password' | 'form', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function fieldErrorsFromDetails(details: unknown): Errors {
  // zod-style details: [{ path: ['email'], message }] or { fieldErrors: { email: [..] } }
  const out: Errors = {};
  const set = (k: string, m: string) => {
    if ((k === 'email' || k === 'password' || k === 'displayName') && !out[k]) out[k] = m;
  };
  if (Array.isArray(details)) {
    for (const d of details as Array<{ path?: unknown[]; message?: string }>)
      if (d?.path?.[0] && d.message) set(String(d.path[0]), d.message);
  } else if (details && typeof details === 'object' && 'fieldErrors' in details) {
    const fe = (details as { fieldErrors: Record<string, string[]> }).fieldErrors;
    for (const [k, v] of Object.entries(fe ?? {})) if (v?.[0]) set(k, v[0]);
  }
  return out;
}

export function AuthPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (mode === 'register' && !displayName.trim()) e.displayName = 'Tell us what to call you.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address.';
    if (mode === 'register' && password.length < 8) e.password = 'Use at least 8 characters.';
    if (mode === 'login' && !password) e.password = 'Enter your password.';
    return e;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const user: User =
        mode === 'login'
          ? await api.login({ email: email.trim(), password })
          : await api.register({ email: email.trim(), password, displayName: displayName.trim(), timezone: detectTimezone() });
      // Fresh account context: never show a previous user's cached data.
      const prev = qc.getQueryData<User | null>(qk.me);
      if (!prev || prev.id !== user.id) clearCachedData();
      qc.setQueryData(qk.me, user);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 401) setErrors({ form: 'Wrong email or password.' });
        else if (err.status === 409) setErrors({ email: 'An account with this email already exists. Try logging in.' });
        else if (err.status === 429)
          setErrors({
            form: `Too many attempts. Try again${err.retryAfterSec ? ` in ${Math.ceil(err.retryAfterSec / 60)} min` : ' later'}.`,
          });
        else if (err.status === 400) {
          const fe = fieldErrorsFromDetails(err.details);
          setErrors(Object.keys(fe).length ? fe : { form: err.message });
        } else setErrors({ form: errorMessage(err) });
      } else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-16" />
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">Lift More</h1>
          <p className="mt-2 text-muted">Log fast. Know exactly what to lift next.</p>
        </div>

        <Segmented<Mode>
          label="Account"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErrors({});
          }}
          options={[
            { value: 'login', label: 'Log in' },
            { value: 'register', label: 'Create account' },
          ]}
          className="mb-6"
        />

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {mode === 'register' && (
            <TextField
              label="Display name"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={errors.displayName}
              maxLength={60}
            />
          )}
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint={mode === 'register' ? 'At least 8 characters.' : undefined}
          />
          {errors.form && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {errors.form}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" block loading={busy} className="mt-2">
            {mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>
      </div>
      <p className="pb-6 text-center text-xs text-faint">Your training data is stored in your account and works offline.</p>
    </div>
  );
}
