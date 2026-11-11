import { MUSCLE_GROUPS } from '../types';
import type { Exercise, Experience, Goal, MuscleGroup, MuscleVolume, User, Workout } from '../types';
import { makeResolver } from './library';
import { isCounted } from './sets';

/** Muscle tiers: big movers get the headline targets, smaller groups proportionally less. */
const TIER: Record<MuscleGroup, 'major' | 'minor' | 'small'> = {
  chest: 'major',
  lats: 'major',
  upper_back: 'major',
  shoulders: 'major',
  quads: 'major',
  hamstrings: 'major',
  glutes: 'major',
  rear_delts: 'minor',
  biceps: 'minor',
  triceps: 'minor',
  calves: 'minor',
  abs: 'minor',
  traps: 'small', // upper traps get plenty of indirect work from rows, carries and deadlifts
  forearms: 'small',
  lower_back: 'small',
  adductors: 'small',
};

export function muscleTier(m: MuscleGroup): 'major' | 'minor' | 'small' {
  return TIER[m];
}

type Range = { min: number; max: number };
type TierTable = Record<'major' | 'minor' | 'small', Range>;

const r = (min: number, max: number): Range => ({ min, max });

/** Hard sets / muscle / week (SPEC §6). */
const TARGETS: Record<Goal, Record<Experience, TierTable>> = {
  hypertrophy: {
    beginner: { major: r(8, 14), minor: r(6, 10), small: r(2, 6) },
    intermediate: { major: r(10, 20), minor: r(8, 14), small: r(3, 8) },
    advanced: { major: r(10, 22), minor: r(8, 16), small: r(4, 10) },
  },
  strength: {
    beginner: { major: r(6, 10), minor: r(3, 6), small: r(2, 5) },
    intermediate: { major: r(6, 12), minor: r(4, 8), small: r(2, 6) },
    advanced: { major: r(8, 14), minor: r(4, 10), small: r(3, 8) },
  },
  general: {
    beginner: { major: r(6, 10), minor: r(3, 8), small: r(2, 5) },
    intermediate: { major: r(6, 12), minor: r(4, 10), small: r(2, 6) },
    advanced: { major: r(8, 14), minor: r(6, 12), small: r(3, 8) },
  },
};

/** Weekly hard-set targets per muscle for a goal/experience. */
export function volumeTargets(goal: Goal, experience: Experience): Record<MuscleGroup, { min: number; max: number }> {
  // Defensive fallbacks in case untyped data (e.g. an old DB row) passes an unknown goal/experience.
  const byGoal = TARGETS[goal] ?? TARGETS.hypertrophy;
  const table = byGoal[experience] ?? byGoal.beginner;
  const out = {} as Record<MuscleGroup, { min: number; max: number }>;
  for (const m of MUSCLE_GROUPS) {
    const t = table[TIER[m]];
    out[m] = { min: t.min, max: t.max };
  }
  return out;
}

export type MuscleCounts = Record<MuscleGroup, number>;

export function emptyCounts(): MuscleCounts {
  const out = {} as MuscleCounts;
  for (const m of MUSCLE_GROUPS) out[m] = 0;
  return out;
}

/** Add `sets` hard sets of `exercise` to the tally (primary 1, each secondary 0.5). */
export function addExerciseSets(acc: MuscleCounts, exercise: Exercise, sets: number): void {
  if (!(sets > 0)) return;
  if (exercise.primaryMuscle in acc) acc[exercise.primaryMuscle] += sets;
  for (const m of new Set(exercise.secondaryMuscles)) {
    if (m !== exercise.primaryMuscle && m in acc) acc[m] += sets * 0.5;
  }
}

/** Raw per-muscle hard-set counts for a list of workouts. Unknown exercise ids are skipped. */
export function muscleCounts(workouts: Workout[], custom: Exercise[] = []): MuscleCounts {
  const resolve = makeResolver(custom);
  const perExercise = new Map<string, number>();
  for (const w of workouts) {
    for (const s of w.sets ?? []) {
      if (isCounted(s)) perExercise.set(s.exerciseId, (perExercise.get(s.exerciseId) ?? 0) + 1);
    }
  }
  const acc = emptyCounts();
  for (const [id, n] of perExercise) {
    const ex = resolve(id);
    if (ex) addExerciseSets(acc, ex, n);
  }
  return acc;
}

export function toMuscleVolume(counts: MuscleCounts, profile: Pick<User, 'goal' | 'experience'>): MuscleVolume[] {
  const targets = volumeTargets(profile.goal, profile.experience);
  return MUSCLE_GROUPS.map((muscle) => ({ muscle, sets: counts[muscle], target: targets[muscle] }));
}

/** Hard sets per muscle (primary 1, secondary 0.5) across the given workouts. */
export function muscleVolume(
  workouts: Workout[],
  profile: Pick<User, 'goal' | 'experience'>,
  custom: Exercise[] = [],
): MuscleVolume[] {
  return toMuscleVolume(muscleCounts(workouts, custom), profile);
}
