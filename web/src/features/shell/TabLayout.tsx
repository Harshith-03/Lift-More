import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import clsx from 'clsx';
import { ChartLine, ClipboardList, History, House, Play, UserRound } from 'lucide-react';
import { useUser } from '../../lib/queries';
import { useNow } from '../../lib/hooks';
import { fmtClock } from '../../lib/format';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useLiveDraft } from '../workout/draftStore';
import { OfflineIndicator } from './OfflineIndicator';

const TABS = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/plan', label: 'Plan', icon: ClipboardList, end: false },
  { to: '/progress', label: 'Progress', icon: ChartLine, end: false },
  { to: '/profile', label: 'Profile', icon: UserRound, end: false },
] as const;

function ResumePill() {
  const user = useUser();
  const draft = useLiveDraft(user.id);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const now = useNow(1000, !!draft);
  // Home shows a large resume card instead
  if (!draft || pathname === '/') return null;
  const elapsed = (now - new Date(draft.startedAt).getTime()) / 1000;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
      <button
        type="button"
        onClick={() => navigate('/workout')}
        className="pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 rounded-2xl bg-accent px-4 text-on-accent shadow-xl shadow-black/40 active:brightness-95"
      >
        <Play className="size-5 fill-current" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left font-semibold">Resume · {draft.name}</span>
        <span className="font-bold tabular-nums">{fmtClock(elapsed)}</span>
      </button>
    </div>
  );
}

export function TabLayout() {
  return (
    <div className="min-h-dvh">
      <OfflineIndicator />
      <main className="mx-auto w-full max-w-lg px-safe pt-safe pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <ResumePill />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/90 pb-safe backdrop-blur-xl"
      >
        <ul className="mx-auto flex max-w-lg">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                    isActive ? 'text-accent-ink' : 'text-faint active:text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={clsx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-accent-soft')}>
                      <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
