import type { ExerciseSession, SetKind, Workout, WorkoutSet } from '../types';

/** Kinds that count for progression, volume and PRs. Warm-ups never count. */
const COUNTED_KINDS: ReadonlySet<SetKind> = new Set<SetKind>(['working', 'failure', 'drop']);

/** Completed working / failure / drop set. */
export function isCounted(set: WorkoutSet): boolean {
  return set.completed === true && COUNTED_KINDS.has(set.kind);
}

/** Epoch ms of a workout start (invalid dates sort as oldest). */
export function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Oldest → newest (ties broken by id so ordering is deterministic). */
export function sortChronological(workouts: Workout[]): Workout[] {
  return workouts
    .map((w) => ({ w, t: timeOf(w.startedAt) }))
    .sort((a, b) => a.t - b.t || (a.w.id < b.w.id ? -1 : a.w.id > b.w.id ? 1 : 0))
    .map((x) => x.w);
}

function bySetPosition(a: WorkoutSet, b: WorkoutSet): number {
  return a.exerciseOrder - b.exerciseOrder || a.setOrder - b.setOrder;
}

/** Counted sets of one workout grouped by exercise id (sets in logged order). Insertion order = exercise order. */
export function countedSetsByExercise(workout: Workout): Map<string, WorkoutSet[]> {
  const sorted = (workout.sets ?? []).filter(isCounted).sort(bySetPosition);
  const out = new Map<string, WorkoutSet[]>();
  for (const s of sorted) {
    const list = out.get(s.exerciseId);
    if (list) list.push(s);
    else out.set(s.exerciseId, [s]);
  }
  return out;
}

/**
 * One pass over all workouts → per-exercise sessions, most recent first. Equivalent to calling
 * sessionsFor for every exercise, but O(total sets) instead of O(exercises × sets).
 */
export function indexSessions(workouts: Workout[]): Map<string, ExerciseSession[]> {
  const index = new Map<string, ExerciseSession[]>();
  const chrono = sortChronological(workouts);
  for (let i = chrono.length - 1; i >= 0; i--) {
    const w = chrono[i]!;
    for (const [exerciseId, sets] of countedSetsByExercise(w)) {
      const session: ExerciseSession = { workoutId: w.id, date: w.startedAt, sets };
      const list = index.get(exerciseId);
      if (list) list.push(session);
      else index.set(exerciseId, [session]);
    }
  }
  return index;
}

/** Completed non-warmup sets of one exercise grouped per workout, most recent first. */
export function sessionsFor(exerciseId: string, workouts: Workout[]): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  const chrono = sortChronological(workouts);
  for (let i = chrono.length - 1; i >= 0; i--) {
    const w = chrono[i]!;
    const sets = (w.sets ?? []).filter((s) => s.exerciseId === exerciseId && isCounted(s)).sort(bySetPosition);
    if (sets.length > 0) out.push({ workoutId: w.id, date: w.startedAt, sets });
  }
  return out;
}

/** Estimated 1RM in kg (Epley for reps > 1; returns weight for reps === 1; null for reps <= 0 or reps > 15). */
export function estimate1RM(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (reps <= 0 || reps > 15) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Σ weight × reps over a list of sets (null weight/reps count as 0). */
export function setsVolumeKg(sets: WorkoutSet[]): number {
  let v = 0;
  for (const s of sets) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (w > 0 && r > 0) v += w * r;
  }
  return v;
}

/** Σ weight × reps over completed non-warmup sets (kg). */
export function workoutVolumeKg(workout: Workout): number {
  return setsVolumeKg((workout.sets ?? []).filter(isCounted));
}
