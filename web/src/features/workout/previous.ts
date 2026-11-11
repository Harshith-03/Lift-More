import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { ExerciseSession, TrackingType, Unit, WorkoutSet } from '../../../../shared/types';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { fmtNum, weightNumber } from '../../lib/format';
import type { DraftSet } from './draftReducer';

/** Most recent session per exercise (GET /api/history/last), cached + persisted per exercise id. */
export function usePreviousSessions(exerciseIds: string[], excludeWorkoutId?: string): Map<string, ExerciseSession | null> {
  const ids = useMemo(() => [...new Set(exerciseIds)], [exerciseIds]);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.historyLast(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.lastSessions([id], signal).then((r) => r[id] ?? null),
      staleTime: 5 * 60_000,
    })),
  });
  const dataKey = results.map((r) => r.dataUpdatedAt).join(',');
  return useMemo(() => {
    const m = new Map<string, ExerciseSession | null>();
    ids.forEach((id, i) => {
      const s = results[i]?.data;
      if (s === undefined) return;
      m.set(id, s && s.workoutId === excludeWorkoutId ? null : s);
    });
    return m;
  }, [ids, dataKey, excludeWorkoutId]); // `results` is a new array every render; dataKey tracks its content
}

/** Pair each draft set with the matching set of last session (warm-ups with warm-ups, work with work). */
export function matchPrevious(session: ExerciseSession | null | undefined, sets: DraftSet[]): Array<WorkoutSet | null> {
  if (!session) return sets.map(() => null);
  const ordered = session.sets.slice().sort((a, b) => a.setOrder - b.setOrder);
  const warm = ordered.filter((s) => s.kind === 'warmup');
  const work = ordered.filter((s) => s.kind !== 'warmup');
  let wi = 0;
  let ki = 0;
  return sets.map((s) => (s.kind === 'warmup' ? (warm[wi++] ?? null) : (work[ki++] ?? null)));
}

/** Compact for the narrow column: "60×8", "BW×12", "+10×8", "45s". */
export function formatPrevious(set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSec'> | null, tracking: TrackingType, unit: Unit): string {
  if (!set) return '—';
  if (tracking === 'duration') {
    const t = set.durationSec != null ? `${set.durationSec}s` : '—';
    return set.weightKg ? `+${weightNumber(set.weightKg, unit)}·${t}` : t;
  }
  const reps = set.reps != null ? fmtNum(set.reps, 0) : '—';
  if (tracking === 'bodyweight_reps') return set.weightKg ? `+${weightNumber(set.weightKg, unit)}×${reps}` : `BW×${reps}`;
  return set.weightKg != null ? `${weightNumber(set.weightKg, unit)}×${reps}` : `—×${reps}`;
}
