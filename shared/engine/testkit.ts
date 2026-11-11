/**
 * Pure builders for engine tests (no test-runner imports, so it type-checks everywhere).
 * Not used by production code.
 */
import type { ExerciseSession, Routine, RoutineItem, SetKind, Workout, WorkoutSet } from '../types';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(++seq).toString(36)}`;

export interface SetSpec {
  ex: string;
  kg?: number | null;
  reps?: number | null;
  sec?: number | null;
  rpe?: number | null;
  kind?: SetKind;
  done?: boolean;
}

/** Shorthand: `s('barbell-bench-press', 100, 5)`. */
export function s(ex: string, kg: number | null, reps: number | null, extra: Omit<SetSpec, 'ex' | 'kg' | 'reps'> = {}): SetSpec {
  return { ex, kg, reps, ...extra };
}

/** n identical sets. */
export function sets(n: number, ex: string, kg: number | null, reps: number | null, extra: Omit<SetSpec, 'ex' | 'kg' | 'reps'> = {}): SetSpec[] {
  return Array.from({ length: n }, () => s(ex, kg, reps, extra));
}

/** Build a workout; exerciseOrder/setOrder follow the order of `specs`. */
export function workout(startedAt: string, specs: SetSpec[], opts: Partial<Workout> = {}): Workout {
  const order = new Map<string, number>();
  const counts = new Map<string, number>();
  const built: WorkoutSet[] = specs.map((spec) => {
    if (!order.has(spec.ex)) order.set(spec.ex, order.size);
    const setOrder = counts.get(spec.ex) ?? 0;
    counts.set(spec.ex, setOrder + 1);
    return {
      id: nextId('set'),
      exerciseId: spec.ex,
      exerciseOrder: order.get(spec.ex)!,
      setOrder,
      kind: spec.kind ?? 'working',
      weightKg: spec.kg ?? null,
      reps: spec.reps ?? null,
      durationSec: spec.sec ?? null,
      rpe: spec.rpe ?? null,
      completed: spec.done ?? true,
      notes: null,
    };
  });
  const start = new Date(startedAt);
  return {
    id: opts.id ?? nextId('w'),
    routineId: opts.routineId ?? null,
    name: opts.name ?? 'Workout',
    startedAt: start.toISOString(),
    endedAt: opts.endedAt === undefined ? new Date(start.getTime() + 3_600_000).toISOString() : opts.endedAt,
    notes: opts.notes ?? '',
    bodyweightKg: opts.bodyweightKg ?? null,
    sets: built,
  };
}

/** One exercise session (for suggestNext history). */
export function session(date: string, specs: SetSpec[]): ExerciseSession {
  const w = workout(date, specs);
  return { workoutId: w.id, date: w.startedAt, sets: w.sets };
}

export function routine(id: string, name: string, position: number, items: RoutineItem[]): Routine {
  return { id, name, notes: '', position, items, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

export function item(exerciseId: string, setsN: number, repMin: number, repMax: number, restSec = 90): RoutineItem {
  return { exerciseId, sets: setsN, repMin, repMax, restSec };
}

/** ISO timestamp `days` after `iso`. */
export function plusDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}
