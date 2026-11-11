/**
 * Live-workout draft state: a pure reducer (no Date.now / randomness inside — callers pass
 * `now` and ids), so it is trivially unit-testable and safe to replay from localStorage.
 *
 * All weights are kilograms. Conversion to the user's unit happens only at the input layer.
 */
import type { ProgressionAction, SetKind, Workout, WorkoutSet } from '../../../../shared/types';

export const DRAFT_VERSION = 1 as const;

export interface DraftSet {
  id: string;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  rpe: number | null;
  completed: boolean;
}

export interface DraftExercise {
  /** Stable client id of this block (React key; survives swaps). */
  key: string;
  exerciseId: string;
  restSec: number;
  /** Target range from the routine (seconds for duration exercises). */
  repMin: number | null;
  repMax: number | null;
  /** Free-text notes for this exercise (stored on the first set's `notes` when saved). */
  notes: string;
  /** Plan suggestion shown as a subtle hint on the card. */
  hint: { action: ProgressionAction; reason: string } | null;
  sets: DraftSet[];
}

export interface RestTimer {
  /** epoch ms */
  endsAt: number;
  totalSec: number;
  exerciseKey: string | null;
}

export interface WorkoutDraft {
  v: typeof DRAFT_VERSION;
  id: string;
  userId: string;
  /** live = the active workout (persisted, rest timer); edit = editing a saved workout. */
  mode: 'live' | 'edit';
  routineId: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  notes: string;
  bodyweightKg: number | null;
  exercises: DraftExercise[];
  rest: RestTimer | null;
}

export type SetPatch = Partial<Omit<DraftSet, 'id'>>;

export type DraftAction =
  | { type: 'load'; draft: WorkoutDraft }
  | { type: 'setMeta'; patch: Partial<Pick<WorkoutDraft, 'name' | 'notes' | 'bodyweightKg' | 'startedAt' | 'endedAt'>> }
  | { type: 'addExercise'; exercise: DraftExercise }
  | { type: 'removeExercise'; key: string }
  | { type: 'moveExercise'; key: string; delta: -1 | 1 }
  | { type: 'swapExercise'; key: string; exerciseId: string }
  | { type: 'setExerciseNotes'; key: string; notes: string }
  | { type: 'setExerciseRest'; key: string; restSec: number }
  | { type: 'addSet'; key: string; id: string }
  | { type: 'removeSet'; key: string; setId: string }
  | { type: 'updateSet'; key: string; setId: string; patch: SetPatch }
  | { type: 'cycleKind'; key: string; setId: string }
  | { type: 'toggleComplete'; key: string; setId: string; now: number; defaultRestSec: number }
  | { type: 'addWarmups'; key: string; sets: DraftSet[] }
  /** Late prefill (history arrived after the exercise was added). Ignored once the user has typed anything. */
  | { type: 'prefillExercise'; key: string; sets: DraftSet[]; hint: DraftExercise['hint'] }
  | { type: 'completeAllFilled' }
  | { type: 'restStart'; now: number; sec: number; exerciseKey?: string | null }
  | { type: 'restAdjust'; now: number; deltaSec: number }
  /** Stop the rest timer. With `ifEndsAt`, only if it's still that same timer (not one extended since). */
  | { type: 'restClear'; ifEndsAt?: number };

export const KIND_CYCLE: readonly SetKind[] = ['warmup', 'working', 'drop', 'failure'];

export function nextKind(kind: SetKind): SetKind {
  const i = KIND_CYCLE.indexOf(kind);
  return KIND_CYCLE[(i + 1) % KIND_CYCLE.length]!;
}

export function emptySet(id: string, kind: SetKind = 'working'): DraftSet {
  return { id, kind, weightKg: null, reps: null, durationSec: null, rpe: null, completed: false };
}

/** A set with nothing entered. */
export function isEmptySet(s: Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec'>): boolean {
  return s.weightKg == null && s.reps == null && s.durationSec == null;
}

/** Warm-ups get a shorter rest; everything else uses the exercise's rest (or the user default). */
export function restFor(ex: DraftExercise | undefined, set: DraftSet | undefined, defaultRestSec: number): number {
  const base = ex && ex.restSec > 0 ? ex.restSec : defaultRestSec;
  return set?.kind === 'warmup' ? Math.min(base, 60) : base;
}

function mapExercise(state: WorkoutDraft, key: string, fn: (ex: DraftExercise) => DraftExercise): WorkoutDraft {
  let changed = false;
  const exercises = state.exercises.map((ex) => {
    if (ex.key !== key) return ex;
    const next = fn(ex);
    if (next !== ex) changed = true;
    return next;
  });
  return changed ? { ...state, exercises } : state;
}

function mapSet(ex: DraftExercise, setId: string, fn: (s: DraftSet) => DraftSet): DraftExercise {
  let changed = false;
  const sets = ex.sets.map((s) => {
    if (s.id !== setId) return s;
    const next = fn(s);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...ex, sets } : ex;
}

export function draftReducer(state: WorkoutDraft, action: DraftAction): WorkoutDraft {
  switch (action.type) {
    case 'load':
      return action.draft;

    case 'setMeta':
      return { ...state, ...action.patch };

    case 'addExercise':
      return { ...state, exercises: [...state.exercises, action.exercise] };

    case 'removeExercise': {
      const exercises = state.exercises.filter((e) => e.key !== action.key);
      if (exercises.length === state.exercises.length) return state;
      const rest = state.rest?.exerciseKey === action.key ? null : state.rest;
      return { ...state, exercises, rest };
    }

    case 'moveExercise': {
      const i = state.exercises.findIndex((e) => e.key === action.key);
      const j = i + action.delta;
      if (i < 0 || j < 0 || j >= state.exercises.length) return state;
      const exercises = state.exercises.slice();
      [exercises[i], exercises[j]] = [exercises[j]!, exercises[i]!];
      return { ...state, exercises };
    }

    case 'swapExercise':
      return mapExercise(state, action.key, (ex) =>
        ex.exerciseId === action.exerciseId
          ? ex
          : {
              ...ex,
              exerciseId: action.exerciseId,
              hint: null,
              // keep the set structure + reps; a different exercise needs a fresh load
              sets: ex.sets.map((s) => (s.completed ? s : { ...s, weightKg: null, rpe: null })),
            },
      );

    case 'setExerciseNotes':
      return mapExercise(state, action.key, (ex) => (ex.notes === action.notes ? ex : { ...ex, notes: action.notes }));

    case 'setExerciseRest':
      return mapExercise(state, action.key, (ex) => ({ ...ex, restSec: Math.max(0, Math.round(action.restSec)) }));

    case 'addSet':
      return mapExercise(state, action.key, (ex) => {
        const working = [...ex.sets].reverse().find((s) => s.kind !== 'warmup');
        const template = working ?? ex.sets[ex.sets.length - 1];
        const set: DraftSet = template
          ? {
              id: action.id,
              kind: template.kind === 'warmup' ? 'working' : template.kind,
              weightKg: template.weightKg,
              reps: template.reps,
              durationSec: template.durationSec,
              rpe: null,
              completed: false,
            }
          : emptySet(action.id);
        return { ...ex, sets: [...ex.sets, set] };
      });

    case 'removeSet':
      return mapExercise(state, action.key, (ex) => {
        const sets = ex.sets.filter((s) => s.id !== action.setId);
        return sets.length === ex.sets.length ? ex : { ...ex, sets };
      });

    case 'updateSet':
      return mapExercise(state, action.key, (ex) => mapSet(ex, action.setId, (s) => ({ ...s, ...action.patch })));

    case 'cycleKind':
      return mapExercise(state, action.key, (ex) => mapSet(ex, action.setId, (s) => ({ ...s, kind: nextKind(s.kind) })));

    case 'toggleComplete': {
      const ex = state.exercises.find((e) => e.key === action.key);
      const set = ex?.sets.find((s) => s.id === action.setId);
      if (!ex || !set) return state;
      const completed = !set.completed;
      const next = mapExercise(state, action.key, (e) => mapSet(e, action.setId, (s) => ({ ...s, completed })));
      if (state.mode !== 'live') return next;
      if (completed) {
        const sec = restFor(ex, set, action.defaultRestSec);
        return sec > 0
          ? { ...next, rest: { endsAt: action.now + sec * 1000, totalSec: sec, exerciseKey: ex.key } }
          : next;
      }
      return next;
    }

    case 'addWarmups':
      return mapExercise(state, action.key, (ex) => {
        // replace any untouched warm-ups, put the new ramp first
        const kept = ex.sets.filter((s) => !(s.kind === 'warmup' && !s.completed));
        return { ...ex, sets: [...action.sets.map((s) => ({ ...s, kind: 'warmup' as const })), ...kept] };
      });

    case 'prefillExercise':
      return mapExercise(state, action.key, (ex) =>
        ex.sets.every((s) => !s.completed && isEmptySet(s)) && action.sets.length > 0
          ? { ...ex, sets: action.sets, hint: action.hint ?? ex.hint }
          : ex,
      );

    case 'completeAllFilled': {
      let changed = false;
      const exercises = state.exercises.map((ex) => {
        if (!ex.sets.some((s) => !s.completed && !isEmptySet(s))) return ex;
        changed = true;
        return { ...ex, sets: ex.sets.map((s) => (!s.completed && !isEmptySet(s) ? { ...s, completed: true } : s)) };
      });
      return changed ? { ...state, exercises } : state;
    }

    case 'restStart':
      return action.sec > 0
        ? {
            ...state,
            rest: { endsAt: action.now + action.sec * 1000, totalSec: action.sec, exerciseKey: action.exerciseKey ?? null },
          }
        : { ...state, rest: null };

    case 'restAdjust': {
      if (!state.rest) return state;
      const remainingMs = Math.max(0, state.rest.endsAt - action.now) + action.deltaSec * 1000;
      if (remainingMs <= 0) return { ...state, rest: null };
      return {
        ...state,
        rest: {
          ...state.rest,
          endsAt: action.now + remainingMs,
          totalSec: Math.max(1, state.rest.totalSec + action.deltaSec),
        },
      };
    }

    case 'restClear':
      if (!state.rest) return state;
      if (action.ifEndsAt !== undefined && state.rest.endsAt !== action.ifEndsAt) return state;
      return { ...state, rest: null };

    default:
      return state;
  }
}

// ───────────── Derived values ─────────────

export function countSets(draft: WorkoutDraft): { completed: number; total: number; unticked: number } {
  let completed = 0;
  let total = 0;
  let unticked = 0;
  for (const ex of draft.exercises) {
    for (const s of ex.sets) {
      if (isEmptySet(s) && !s.completed) continue;
      total++;
      if (s.completed) completed++;
      else unticked++;
    }
  }
  return { completed, total, unticked };
}

type VolumeSet = Pick<DraftSet, 'completed' | 'kind' | 'weightKg' | 'reps'>;

/** Σ weight × reps over completed non-warm-up sets (kg). */
export function setsVolumeKg(sets: Iterable<VolumeSet>): number {
  let v = 0;
  for (const s of sets) if (s.completed && s.kind !== 'warmup' && s.weightKg != null && s.reps != null) v += s.weightKg * s.reps;
  return v;
}

export function draftVolumeKg(draft: Pick<WorkoutDraft, 'exercises'>): number {
  return setsVolumeKg(draft.exercises.flatMap((e) => e.sets));
}

export interface BuildOptions {
  /** Override endedAt (e.g. now, when finishing). Defaults to the draft's own value. */
  endedAt?: string | null;
  /** Also drop sets that have values but were never ticked. */
  dropIncomplete?: boolean;
}

/**
 * Final `Workout` payload for PUT /api/workouts/:id.
 * Drops empty sets (nothing entered) and exercises left without sets; renumbers
 * exerciseOrder / setOrder contiguously; exercise notes ride on the first saved set.
 */
export function buildWorkoutPayload(draft: WorkoutDraft, opts: BuildOptions = {}): Workout {
  const sets: WorkoutSet[] = [];
  let exerciseOrder = 0;
  for (const ex of draft.exercises) {
    const kept = ex.sets.filter((s) => !isEmptySet(s) && (s.completed || !opts.dropIncomplete));
    if (kept.length === 0) continue;
    const note = ex.notes.trim();
    kept.forEach((s, setOrder) => {
      sets.push({
        id: s.id,
        exerciseId: ex.exerciseId,
        exerciseOrder,
        setOrder,
        kind: s.kind,
        weightKg: s.weightKg,
        reps: s.reps,
        durationSec: s.durationSec,
        rpe: s.rpe,
        completed: s.completed,
        notes: setOrder === 0 && note ? note : null,
      });
    });
    exerciseOrder++;
  }
  return {
    id: draft.id,
    routineId: draft.routineId,
    name: draft.name.trim() || 'Workout',
    startedAt: draft.startedAt,
    endedAt: opts.endedAt !== undefined ? opts.endedAt : draft.endedAt,
    notes: draft.notes.trim(),
    bodyweightKg: draft.bodyweightKg,
    sets,
  };
}

/** Rebuild a draft from a saved workout (history edit, or "repeat" with fresh ids). */
export function draftFromWorkout(
  workout: Workout,
  opts: {
    userId: string;
    mode: 'live' | 'edit';
    restFor: (exerciseId: string) => number;
    newId?: () => string;
    /** For "repeat": start now, nothing completed. */
    asNew?: { startedAt: string };
  },
): WorkoutDraft {
  const byOrder = new Map<number, WorkoutSet[]>();
  for (const s of workout.sets) {
    const list = byOrder.get(s.exerciseOrder) ?? [];
    list.push(s);
    byOrder.set(s.exerciseOrder, list);
  }
  const id = opts.newId ?? ((): string => '');
  const exercises: DraftExercise[] = [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, list]) => {
      const sorted = list.slice().sort((a, b) => a.setOrder - b.setOrder);
      const first = sorted[0]!;
      return {
        key: opts.asNew ? id() : `${workout.id}:${order}`,
        exerciseId: first.exerciseId,
        restSec: opts.restFor(first.exerciseId),
        repMin: null,
        repMax: null,
        notes: sorted.find((s) => s.notes)?.notes ?? '',
        hint: null,
        sets: sorted.map((s) => ({
          id: opts.asNew ? id() : s.id,
          kind: s.kind,
          weightKg: s.weightKg,
          reps: s.reps,
          durationSec: s.durationSec,
          rpe: opts.asNew ? null : s.rpe,
          completed: opts.asNew ? false : s.completed,
        })),
      };
    });
  return {
    v: DRAFT_VERSION,
    id: opts.asNew ? id() : workout.id,
    userId: opts.userId,
    mode: opts.mode,
    routineId: workout.routineId,
    name: workout.name,
    startedAt: opts.asNew ? opts.asNew.startedAt : workout.startedAt,
    endedAt: opts.asNew ? null : workout.endedAt,
    notes: opts.asNew ? '' : workout.notes,
    bodyweightKg: opts.asNew ? null : workout.bodyweightKg,
    exercises,
    rest: null,
  };
}
