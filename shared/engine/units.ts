import type { Equipment, Exercise, MuscleGroup, Unit } from '../types';

export const KG_PER_LB = 0.45359237;

export function kgToUnit(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function unitToKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

/** Round to `decimals` places, normalising -0 to 0. */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f + (value >= 0 ? 1e-9 : -1e-9)) / f;
  return r === 0 ? 0 : r;
}

/** Number in the user's unit, max 2 decimals, trailing zeros trimmed ("102.5", "225", "20.41"). */
export function formatNumber(value: number): string {
  const r = roundTo(value, 2);
  return String(r);
}

/** "102.5 kg" / "225 lb" — trims trailing zeros, max 2 decimals. null → "BW". */
export function formatWeight(kg: number | null, unit: Unit): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return 'BW';
  return `${formatNumber(kgToUnit(kg, unit))} ${unit}`;
}

const LOWER_BODY: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'lower_back',
]);

export function isLowerBody(muscle: MuscleGroup): boolean {
  return LOWER_BODY.has(muscle);
}

/** Equipment that is loaded like a barbell (plates on a bar / sled). */
const HEAVY_LOADED: ReadonlySet<Equipment> = new Set<Equipment>(['barbell', 'smith', 'machine', 'other', 'ez_bar']);

/**
 * Default load increment for an exercise, expressed in `unit`.
 *
 * - dumbbell: 2 kg / 5 lb (per dumbbell)
 * - kettlebell: 4 kg / 5 lb (next bell)
 * - lower-body compound on a bar, sled or machine (squat, deadlift, leg press, hip thrust): 5 kg / 10 lb
 * - everything else (upper-body compounds, machines, cables, isolation, added bodyweight load): 2.5 kg / 5 lb
 */
export function defaultIncrement(exercise: Exercise, unit: Unit): number {
  const kg = unit === 'kg';
  if (exercise.equipment === 'dumbbell') return kg ? 2 : 5;
  if (exercise.equipment === 'kettlebell') return kg ? 4 : 5;
  if (
    exercise.mechanic === 'compound' &&
    isLowerBody(exercise.primaryMuscle) &&
    HEAVY_LOADED.has(exercise.equipment)
  ) {
    return kg ? 5 : 10;
  }
  return kg ? 2.5 : 5;
}

/**
 * Smallest loadable change for an exercise, in `unit` — used to snap suggestions. Usually the same as
 * the increment, but plate-loaded lifts that *progress* by 5 kg / 10 lb can still be loaded in
 * 2.5 kg / 5 lb steps (225 lb + 10 lb = 235 lb, not 240 lb).
 */
export function loadStep(exercise: Exercise, unit: Unit): number {
  if (exercise.equipment === 'dumbbell' || exercise.equipment === 'kettlebell') return defaultIncrement(exercise, unit);
  return Math.min(defaultIncrement(exercise, unit), unit === 'kg' ? 2.5 : 5);
}

/** Round a kg value to the nearest loadable step in the user's unit; returns kg. */
export function roundToLoadable(weightKg: number, unit: Unit, stepInUnit: number): number {
  if (!Number.isFinite(weightKg)) return 0;
  const value = Math.max(0, kgToUnit(weightKg, unit));
  let rounded: number;
  if (!Number.isFinite(stepInUnit) || stepInUnit <= 0) {
    rounded = roundTo(value, 2);
  } else {
    rounded = Math.round(value / stepInUnit + 1e-9) * stepInUnit;
    // Strip floating-point noise (e.g. 3 × 0.1) so the value is an exact decimal in the user's unit.
    rounded = roundTo(rounded, 6);
  }
  return unitToKg(rounded, unit);
}

/** True when `weightKg` is (within float noise) a multiple of `stepInUnit` in `unit`. */
export function isMultipleOf(weightKg: number, unit: Unit, stepInUnit: number): boolean {
  const v = kgToUnit(weightKg, unit) / stepInUnit;
  return Math.abs(v - Math.round(v)) < 1e-6;
}
