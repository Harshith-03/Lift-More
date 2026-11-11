/**
 * Lift More — shared engine public API (pure TypeScript, no I/O, no DOM/Node APIs).
 * Imported by BOTH the server (plan/stats endpoints, AI prompt context) and the web app
 * (in-workout hints, plate math, warm-ups, unit display).
 *
 * The exported names + signatures below are the contract. Implementations live in sibling
 * modules; this file only re-exports them.
 *
 * ── Exercise library ──
 *   EXERCISES: Exercise[]                                   built-in library (~100 entries, kebab-case ids)
 *   TEMPLATES: RoutineTemplate[]                            built-in starter programs
 *   getExercise(id, custom = []): Exercise | undefined
 *   searchExercises(query, { muscle?, equipment?, custom? } = {}): Exercise[]
 *   alternativesFor(exerciseId, custom = [], limit = 5): Exercise[]
 *
 * ── Units ──
 *   KG_PER_LB, kgToUnit(kg, unit), unitToKg(value, unit)
 *   formatWeight(kg | null, unit): string                   "102.5 kg" / "225 lb" / "BW"
 *   defaultIncrement(exercise, unit): number                in `unit`
 *   roundToLoadable(weightKg, unit, stepInUnit): number     returns kg
 *
 * ── Dates ──
 *   localDate(at, timezone), weekStartOf(at, timezone), addDays(date, days)
 *
 * ── Strength math ──
 *   estimate1RM(weightKg, reps), sessionsFor(exerciseId, workouts)
 *   platesPerSide(totalKg, unit, barKg)                     remainderInUnit is per side
 *   generateWarmups(workingWeightKg, exercise, unit, barKg)
 *
 * ── Progression / plan ──
 *   SuggestInput, suggestNext(input), volumeTargets(goal, experience)
 *   muscleVolume(workouts, profile, custom = []), PlanInput, buildWeeklyPlan(input)
 *   nextRoutine(routines, workouts)
 *
 * ── Records & stats ──
 *   detectPRs(workout, prior, custom = []), exerciseHistory(exerciseId, workouts, custom = [])
 *   computeStats(workouts, profile, now, custom = []), workoutVolumeKg(workout)
 */

// Exercise library
export { EXERCISES } from '../exercises';
export { TEMPLATES } from '../templates';
export { getExercise, searchExercises, alternativesFor } from './library';

// Units
export { KG_PER_LB, kgToUnit, unitToKg, formatWeight, defaultIncrement, roundToLoadable } from './units';

// Dates
export { localDate, weekStartOf, addDays } from './dates';

// Strength math
export { estimate1RM, sessionsFor, workoutVolumeKg } from './sets';
export { platesPerSide, generateWarmups } from './plates';

// Progression
export { suggestNext } from './progression';
export type { SuggestInput } from './progression';
export { volumeTargets, muscleVolume } from './volume';
export { buildWeeklyPlan, nextRoutine } from './plan';
export type { PlanInput } from './plan';

// Records & stats
export { detectPRs, exerciseHistory, computeStats } from './stats';
