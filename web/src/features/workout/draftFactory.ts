import type {
  Exercise,
  ExerciseSession,
  ExerciseSuggestion,
  Routine,
  RoutineItem,
  TrackingType,
  WeeklyPlan,
} from '../../../../shared/types';
import { DRAFT_VERSION, type DraftExercise, type DraftSet, type WorkoutDraft } from './draftReducer';

export interface BlockInput {
  exerciseId: string;
  exercise: Exercise | undefined;
  item: Pick<RoutineItem, 'sets' | 'repMin' | 'repMax' | 'restSec'> & { notes?: string };
  suggestion?: ExerciseSuggestion | null;
  /** Most recent session of this exercise (fallback prefill when there is no suggestion). */
  last?: ExerciseSession | null;
  newId: () => string;
}

function setValues(tracking: TrackingType, weightKg: number | null, target: number | null) {
  if (tracking === 'duration') return { weightKg, reps: null, durationSec: target };
  return { weightKg, reps: target, durationSec: null };
}

/** A new exercise block, prefilled from the plan suggestion, else from last session's working sets. */
export function newExerciseBlock({ exerciseId, exercise, item, suggestion, last, newId }: BlockInput): DraftExercise {
  const tracking = exercise?.trackingType ?? 'weight_reps';
  let sets: DraftSet[];

  if (suggestion) {
    const count = Math.max(1, suggestion.sets || item.sets);
    sets = Array.from({ length: count }, (_, i) => {
      const target = suggestion.repsPerSet[i] ?? suggestion.repsPerSet[suggestion.repsPerSet.length - 1] ?? item.repMin;
      return {
        id: newId(),
        kind: 'working' as const,
        ...setValues(tracking, suggestion.weightKg, target),
        rpe: null,
        completed: false,
      };
    });
  } else {
    const prior = (last?.sets ?? []).filter((s) => s.kind !== 'warmup');
    const count = Math.max(1, item.sets);
    sets = Array.from({ length: count }, (_, i) => {
      const p = prior[i] ?? prior[prior.length - 1];
      return {
        id: newId(),
        kind: 'working' as const,
        weightKg: p?.weightKg ?? null,
        reps: tracking === 'duration' ? null : (p?.reps ?? null),
        durationSec: tracking === 'duration' ? (p?.durationSec ?? null) : null,
        rpe: null,
        completed: false,
      };
    });
  }

  return {
    key: newId(),
    exerciseId,
    restSec: item.restSec,
    repMin: suggestion?.repMin ?? item.repMin,
    repMax: suggestion?.repMax ?? item.repMax,
    notes: item.notes ?? '',
    hint: suggestion ? { action: suggestion.action, reason: suggestion.reason } : null,
    sets,
  };
}

export function emptyDraft(opts: { userId: string; name: string; now: Date; newId: () => string }): WorkoutDraft {
  return {
    v: DRAFT_VERSION,
    id: opts.newId(),
    userId: opts.userId,
    mode: 'live',
    routineId: null,
    name: opts.name,
    startedAt: opts.now.toISOString(),
    endedAt: null,
    notes: '',
    bodyweightKg: null,
    exercises: [],
    rest: null,
  };
}

/** A live draft for a routine, prefilled with next-session targets from the weekly plan. */
export function draftFromRoutine(opts: {
  routine: Routine;
  plan: WeeklyPlan | null | undefined;
  userId: string;
  getExercise: (id: string) => Exercise | undefined;
  newId: () => string;
  now: Date;
}): WorkoutDraft {
  const { routine, plan } = opts;
  const routinePlan = plan?.routines.find((r) => r.routineId === routine.id);
  const draft = emptyDraft({ userId: opts.userId, name: routine.name, now: opts.now, newId: opts.newId });
  return {
    ...draft,
    routineId: routine.id,
    notes: '',
    exercises: routine.items.map((item) =>
      newExerciseBlock({
        exerciseId: item.exerciseId,
        exercise: opts.getExercise(item.exerciseId),
        item,
        suggestion: routinePlan?.exercises.find((e) => e.exerciseId === item.exerciseId) ?? null,
        newId: opts.newId,
      }),
    ),
  };
}

/** Sensible defaults for a routine item when adding an exercise (goal + mechanic aware). */
export function defaultItemFor(
  exercise: Exercise | undefined,
  goal: 'strength' | 'hypertrophy' | 'general',
  defaultRestSec: number,
): Pick<RoutineItem, 'sets' | 'repMin' | 'repMax' | 'restSec'> {
  if (exercise?.trackingType === 'duration') return { sets: 3, repMin: 30, repMax: 60, restSec: 60 };
  const compound = exercise?.mechanic !== 'isolation';
  if (goal === 'strength' && compound) return { sets: 3, repMin: 4, repMax: 6, restSec: Math.max(defaultRestSec, 180) };
  if (compound) return { sets: 3, repMin: 6, repMax: 10, restSec: defaultRestSec };
  return { sets: 3, repMin: 10, repMax: 15, restSec: Math.min(defaultRestSec, 90) };
}
