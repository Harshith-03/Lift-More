import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Dumbbell, Flame, Play, Plus, Sparkles, Trophy } from 'lucide-react';
import type { Routine } from '../../../../shared/types';
import { useCoachReview, useCoachStatus, useExerciseLookup, usePlan, useRecentWorkouts, useRoutines, useStats, useUser } from '../../lib/queries';
import { describePR, fmtDay, fmtDuration, fmtShortDate, fmtVolume, greeting, plural } from '../../lib/format';
import { Button, Card, Chip, EmptyState, SectionTitle, Skeleton } from '../../components/ui';
import { ProgressRing } from '../../components/ProgressRing';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useNow } from '../../lib/hooks';
import { fmtClock } from '../../lib/format';
import { useLiveDraft } from '../workout/draftStore';
import { useStartWorkout } from '../workout/useStartWorkout';
import { PendingSyncBadge, SyncSheet } from '../sync/SyncSheet';

function ResumeCard() {
  const user = useUser();
  const draft = useLiveDraft(user.id);
  const navigate = useNavigate();
  const now = useNow(1000, !!draft);
  if (!draft) return null;
  const done = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  return (
    <button
      type="button"
      onClick={() => navigate('/workout')}
      className="mt-3 flex w-full items-center gap-4 rounded-[var(--radius-card)] bg-accent p-4 text-left text-on-accent shadow-[0_10px_40px_-12px_var(--color-accent)] active:brightness-95"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-black/10">
        <Play className="size-6 fill-current" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold tracking-wider uppercase opacity-70">Resume workout</span>
        <span className="block truncate text-lg font-extrabold">{draft.name}</span>
        <span className="block text-sm font-semibold opacity-75">
          {fmtClock((now - new Date(draft.startedAt).getTime()) / 1000)} · {plural(done, 'set')} done
        </span>
      </span>
      <ChevronRight className="size-6 shrink-0" aria-hidden />
    </button>
  );
}

function WeekCard() {
  const { data: stats, isPending } = useStats();
  const user = useUser();
  if (isPending) return <Skeleton className="h-32 rounded-[var(--radius-card)]" />;
  const done = stats?.workoutsThisWeek ?? 0;
  const target = stats?.targetThisWeek ?? user.daysPerWeek;
  const left = Math.max(0, target - done);
  return (
    <Card className="flex items-center gap-5 p-4">
      <ProgressRing value={done} max={target} label={`${done} of ${target} workouts this week`}>
        <span className="text-2xl leading-none font-extrabold">{done}</span>
        <span className="text-xs font-semibold text-muted">of {target}</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">This week</p>
        <p className="mt-0.5 text-lg leading-snug font-bold">
          {done >= target ? 'Weekly goal hit!' : left === 1 ? '1 workout to go' : `${left} workouts to go`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Flame className="size-4 text-warn" aria-hidden />
            <strong className="text-ink">{stats?.streakWeeks ?? 0}</strong> wk streak
          </span>
          <span>
            <strong className="text-ink">{stats?.totalWorkouts ?? 0}</strong> total
          </span>
        </div>
      </div>
    </Card>
  );
}

function StartCard() {
  const { data: routines, isPending } = useRoutines();
  const { data: plan } = usePlan();
  const lookup = useExerciseLookup();
  const start = useStartWorkout();
  const navigate = useNavigate();

  if (isPending) return <Skeleton className="mt-3 h-44 rounded-[var(--radius-card)]" />;
  const list = routines ?? [];
  if (list.length === 0) {
    return (
      <Card className="mt-3 p-2">
        <EmptyState
          icon={<Dumbbell className="size-7" aria-hidden />}
          title="No routines yet"
          body="Add a starter program or build your own — or just log as you go."
          action={
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={() => navigate('/profile#routines')}>
                Set up routines
              </Button>
              <Button variant="secondary" onClick={() => void start({ empty: true })}>
                Start empty workout
              </Button>
            </div>
          }
        />
      </Card>
    );
  }
  const next: Routine = list.find((r) => r.id === plan?.nextRoutineId) ?? list[0]!;
  const others = list.filter((r) => r.id !== next.id);
  const preview = next.items.slice(0, 4).map((i) => lookup.name(i.exerciseId));
  const totalSets = next.items.reduce((n, i) => n + i.sets, 0);

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="p-4 pb-3">
        <p className="text-xs font-semibold tracking-wider text-accent-ink uppercase">Up next</p>
        <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight">{next.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {plural(next.items.length, 'exercise')} · {plural(totalSets, 'set')}
        </p>
        {preview.length > 0 && (
          <p className="mt-2 line-clamp-2 text-sm text-ink/80">
            {preview.join(' · ')}
            {next.items.length > 4 ? ` +${next.items.length - 4} more` : ''}
          </p>
        )}
        <Button variant="primary" size="lg" block className="mt-4" icon={<Play className="size-5 fill-current" aria-hidden />} onClick={() => void start({ routine: next })}>
          Start {next.name}
        </Button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line/60 px-4 py-3">
        {others.map((r) => (
          <Chip key={r.id} onClick={() => void start({ routine: r })}>
            {r.name}
          </Chip>
        ))}
        <Chip onClick={() => void start({ empty: true })}>
          <Plus className="size-4" aria-hidden /> Empty workout
        </Chip>
      </div>
    </Card>
  );
}

function CoachTeaser() {
  const { data: status } = useCoachStatus();
  const { data: review } = useCoachReview();
  if (!status?.enabled && !review) return null;
  return (
    <Link to="/plan#coach" className="mt-3 flex items-center gap-3 rounded-[var(--radius-card)] border border-line/60 bg-surface p-4 active:bg-surface-2">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-info-soft text-info">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{review ? 'Your coach’s weekly review' : 'Get your AI weekly review'}</span>
        <span className="line-clamp-2 block text-sm text-muted">
          {review ? review.summary : 'Wins, concerns and exact tweaks for next week — one tap.'}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-faint" aria-hidden />
    </Link>
  );
}

function RecentPRs() {
  const { data: stats } = useStats();
  const user = useUser();
  const lookup = useExerciseLookup();
  const prs = stats?.recentPRs.slice(0, 3) ?? [];
  if (prs.length === 0) return null;
  return (
    <>
      <SectionTitle action={<Link to="/progress" className="flex min-h-11 items-center px-1 text-sm font-semibold text-accent-ink">See all</Link>}>Recent PRs</SectionTitle>
      <Card as="div" className="divide-y divide-line/60">
        {prs.map((pr, i) => {
          const d = describePR(pr, user.unit);
          return (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Trophy className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{lookup.name(pr.exerciseId)}</p>
                <p className="text-xs text-muted">
                  {d.label} · {fmtShortDate(pr.date, user.timezone)}
                </p>
              </div>
              <span className="shrink-0 font-bold">{d.value}</span>
            </div>
          );
        })}
      </Card>
    </>
  );
}

function LastWorkout() {
  const { data, isPending } = useRecentWorkouts(5);
  const user = useUser();
  const lookup = useExerciseLookup();
  if (isPending) return <Skeleton className="mt-8 h-24 rounded-[var(--radius-card)]" />;
  const w = data?.[0];
  if (!w) return null;
  return (
    <>
      <SectionTitle action={<Link to="/history" className="flex min-h-11 items-center px-1 text-sm font-semibold text-accent-ink">History</Link>}>Last workout</SectionTitle>
      <Link to={`/history/${w.id}`} className="block rounded-[var(--radius-card)] border border-line/60 bg-surface p-4 active:bg-surface-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-bold">{w.name}</p>
          <p className="shrink-0 text-sm text-muted">{fmtDay(w.startedAt, user.timezone)}</p>
        </div>
        <p className="mt-1 text-sm text-muted">
          {fmtDuration(w.durationSec)} · {plural(w.setCount, 'set')} · {fmtVolume(w.volumeKg, user.unit)}
        </p>
        <p className="mt-2 line-clamp-1 text-sm text-ink/80">{w.exerciseIds.map((id) => lookup.name(id)).join(' · ')}</p>
      </Link>
    </>
  );
}

export function HomePage() {
  const user = useUser();
  const [syncOpen, setSyncOpen] = useState(false);
  return (
    <div>
      <header className="flex items-start justify-between gap-3 pt-5 pb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{greeting()}</p>
          <h1 className="truncate text-[30px] leading-tight font-extrabold tracking-tight">{user.displayName.split(' ')[0]}</h1>
        </div>
        <div className="pt-2">
          <PendingSyncBadge userId={user.id} onClick={() => setSyncOpen(true)} />
        </div>
      </header>
      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} userId={user.id} timezone={user.timezone} />

      <ErrorBoundary compact>
        <WeekCard />
      </ErrorBoundary>
      <ResumeCard />
      <ErrorBoundary compact>
        <StartCard />
      </ErrorBoundary>
      <ErrorBoundary compact>
        <CoachTeaser />
      </ErrorBoundary>
      <ErrorBoundary compact>
        <RecentPRs />
      </ErrorBoundary>
      <ErrorBoundary compact>
        <LastWorkout />
      </ErrorBoundary>
    </div>
  );
}
