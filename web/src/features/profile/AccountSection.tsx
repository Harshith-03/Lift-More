import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Moon, Sun, Trash2 } from 'lucide-react';
import { api, ApiRequestError, errorMessage } from '../../lib/api';
import { clearCachedData, qk } from '../../lib/queryClient';
import { useUser } from '../../lib/queries';
import { useTheme } from '../../lib/hooks';
import { plural } from '../../lib/format';
import { Button, Card, ListButton, Segmented, TextField } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { useConfirm, useToast } from '../../components/feedback';
import { draftStore } from '../workout/draftStore';
import { outboxStore, useOutbox } from '../sync/outboxStore';

export function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  return (
    <Card className="p-4">
      <Segmented
        label="Theme"
        value={theme}
        onChange={setTheme}
        options={[
          {
            value: 'dark',
            label: (
              <span className="inline-flex items-center gap-2">
                <Moon className="size-4" aria-hidden /> Dark
              </span>
            ),
          },
          {
            value: 'light',
            label: (
              <span className="inline-flex items-center gap-2">
                <Sun className="size-4" aria-hidden /> Light
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const user = useUser();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    setBusy(true);
    try {
      await api.deleteMe(password);
      for (const entry of outboxStore.get()) if (entry.userId === user.id) outboxStore.discard(entry.id);
      if (draftStore.get()?.userId === user.id) draftStore.clear();
      clearCachedData();
      qc.setQueryData(qk.me, null);
      toast.success('Your account and all data were deleted.');
    } catch (err) {
      if (err instanceof ApiRequestError && [400, 401, 403].includes(err.status)) setError('That password isn’t right.');
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Delete account" description="This permanently deletes your account, workouts, routines and stats. It can’t be undone — export your data first if you want a copy.">
      <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          error={error}
          data-autofocus
        />
        <Button type="submit" variant="danger" size="lg" block loading={busy}>
          Delete my account forever
        </Button>
      </form>
    </Sheet>
  );
}

export function AccountSection() {
  const qc = useQueryClient();
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const pending = useOutbox(user.id);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    const live = draftStore.get();
    const warn = [
      pending.length ? `${plural(pending.length, 'workout')} haven’t synced yet — they stay on this device and sync next time you log in.` : '',
      live && live.userId === user.id ? 'Your workout in progress stays on this device.' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (!(await confirm({ title: 'Log out?', message: warn || undefined, confirmLabel: 'Log out' }))) return;
    setLoggingOut(true);
    try {
      await api.logout();
      clearCachedData();
      qc.setQueryData(qk.me, null);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not log out'));
      setLoggingOut(false);
    }
  };

  return (
    <>
      <Card as="div" className="p-1.5">
        <ListButton icon={<LogOut className="size-5" />} label="Log out" description={user.email} disabled={loggingOut} onClick={() => void logout()} />
        <ListButton tone="danger" icon={<Trash2 className="size-5" />} label="Delete account" description="Permanently remove all your data" onClick={() => setDeleting(true)} />
      </Card>
      <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} />
    </>
  );
}
