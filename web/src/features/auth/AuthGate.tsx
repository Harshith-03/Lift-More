import { useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { CloudOff } from 'lucide-react';
import type { User } from '../../../../shared/types';
import { useMe } from '../../lib/queries';
import { invalidateTrainingData } from '../../lib/queryClient';
import { plural } from '../../lib/format';
import { Button, Spinner } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { startOutboxSync } from '../sync/outboxStore';
import { AuthPage } from './AuthPage';
import { Onboarding } from '../onboarding/Onboarding';
import { Logo } from '../shell/Logo';

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <Logo className="size-16" />
      <Spinner />
    </div>
  );
}

function CantConnect({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <CloudOff className="size-7" aria-hidden />
      </div>
      <h1 className="text-xl font-bold">{offline ? "You're offline" : "Can't reach Lift More"}</h1>
      <p className="mt-2 text-sm text-muted">
        {offline
          ? 'Connect once to sign in. After that, Lift More works in the gym basement too.'
          : 'The server didn’t respond. Check your connection and try again.'}
      </p>
      <Button variant="primary" className="mt-6" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Starts background outbox sync for the signed-in user. */
function useOutboxSync(user: User) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  useEffect(
    () =>
      startOutboxSync({
        getUserId: () => user.id,
        onReport: (r) => {
          if (r.sent.length) {
            void invalidateTrainingData();
            const prs = r.sent.reduce((n, s) => n + s.result.prs.length, 0);
            toastRef.current.success(
              `Synced ${plural(r.sent.length, 'workout')}${prs ? ` · ${plural(prs, 'new PR')}!` : ''}`,
            );
          }
        },
      }),
    [user.id],
  );
}

function AuthedApp({ user }: { user: User }) {
  useOutboxSync(user);
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export function AuthGate() {
  const me = useMe();
  if (me.data === undefined) {
    if (me.fetchStatus === 'paused') return <CantConnect offline onRetry={() => void me.refetch()} />;
    if (me.isError) return <CantConnect offline={false} onRetry={() => void me.refetch()} />;
    return <Splash />;
  }
  if (me.data === null) return <AuthPage />;
  if (!me.data.onboarded) return <Onboarding user={me.data} />;
  return <AuthedApp user={me.data} />;
}
