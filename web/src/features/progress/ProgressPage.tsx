import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { useRecentWorkouts, useRoutines, useStats, useUser } from '../../lib/queries';
import { PageHeader } from '../../components/PageHeader';
import { Card, SectionTitle, Skeleton } from '../../components/ui';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { MuscleVolumeBars } from '../plan/MuscleVolumeBars';
import { ExerciseProgressCard } from './ExerciseProgressCard';
import { WeeklyVolumeChart } from './WeeklyVolumeChart';
import { BodyweightCard } from './BodyweightCard';

/** Exercises the user has actually done, most frequent first. */
function useDoneExerciseIds(): { ids: string[]; loading: boolean } {
  const { data: workouts, isPending } = useRecentWorkouts(50);
  const { data: stats } = useStats();
  const { data: routines } = useRoutines();
  const ids = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of workouts ?? []) for (const id of w.exerciseIds) count.set(id, (count.get(id) ?? 0) + 1);
    for (const pr of stats?.recentPRs ?? []) if (!count.has(pr.exerciseId)) count.set(pr.exerciseId, 0.5);
    // routine order as a tie-breaker keeps the main lifts on top
    const routineOrder = new Map<string, number>();
    (routines ?? []).flatMap((r) => r.items).forEach((i, n) => routineOrder.has(i.exerciseId) || routineOrder.set(i.exerciseId, n));
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1] || (routineOrder.get(a[0]) ?? 999) - (routineOrder.get(b[0]) ?? 999))
      .map(([id]) => id);
  }, [workouts, stats, routines]);
  return { ids, loading: isPending };
}

export default function ProgressPage() {
  const user = useUser();
  const { data: stats, isPending: statsPending } = useStats();
  const { ids, loading } = useDoneExerciseIds();

  return (
    <div>
      <PageHeader title="Progress" />

      {statsPending ? (
        <Skeleton className="h-20 rounded-[var(--radius-card)]" />
      ) : (
        stats && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-line/60 bg-surface p-3">
              <dt className="text-xs text-muted">Streak</dt>
              <dd className="mt-1 flex items-center justify-center gap-1 text-xl font-extrabold">
                <Flame className="size-4.5 text-warn" aria-hidden />
                {stats.streakWeeks}
                <span className="text-sm font-semibold text-muted">wk</span>
              </dd>
            </div>
            <div className="rounded-2xl border border-line/60 bg-surface p-3">
              <dt className="text-xs text-muted">This week</dt>
              <dd className="mt-1 text-xl font-extrabold">
                {stats.workoutsThisWeek}
                <span className="text-sm font-semibold text-muted">/{stats.targetThisWeek}</span>
              </dd>
            </div>
            <div className="rounded-2xl border border-line/60 bg-surface p-3">
              <dt className="text-xs text-muted">Workouts</dt>
              <dd className="mt-1 text-xl font-extrabold">{stats.totalWorkouts}</dd>
            </div>
          </dl>
        )
      )}

      <SectionTitle>Strength</SectionTitle>
      <ErrorBoundary compact>{loading ? <Skeleton className="h-72 rounded-[var(--radius-card)]" /> : <ExerciseProgressCard exerciseIds={ids} />}</ErrorBoundary>

      <SectionTitle>Weekly volume</SectionTitle>
      <ErrorBoundary compact>
        <Card className="p-4">{stats ? <WeeklyVolumeChart weeks={stats.weeklyVolume} unit={user.unit} /> : <Skeleton className="h-56" />}</Card>
      </ErrorBoundary>

      <SectionTitle>Sets per muscle · this week</SectionTitle>
      <ErrorBoundary compact>
        <Card className="p-4">{stats ? <MuscleVolumeBars volume={stats.muscleVolumeThisWeek} /> : <Skeleton className="h-64" />}</Card>
      </ErrorBoundary>

      <SectionTitle>Bodyweight</SectionTitle>
      <ErrorBoundary compact>
        <BodyweightCard />
      </ErrorBoundary>
    </div>
  );
}
