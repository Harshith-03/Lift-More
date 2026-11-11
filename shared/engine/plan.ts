import { EXERCISES } from '../exercises';
import { MUSCLE_GROUPS } from '../types';
import type {
  Equipment,
  Exercise,
  ExerciseRecommendation,
  ExerciseSuggestion,
  MuscleGroup,
  Routine,
  RoutinePlan,
  User,
  WeeklyPlan,
  Workout,
} from '../types';
import { addDays, localDate, weekStartOf } from './dates';
import { alternativesFor, fallbackExercise, makeResolver } from './library';
import { suggestNext } from './progression';
import { indexSessions, isCounted, timeOf } from './sets';
import { formatNumber, formatWeight } from './units';
import { addExerciseSets, emptyCounts, muscleCounts, muscleTier, toMuscleVolume, volumeTargets } from './volume';
import type { MuscleCounts } from './volume';

export interface PlanInput {
  routines: Routine[];
  /** Recent workouts with sets (≥ last 8 weeks recommended), any order. */
  workouts: Workout[];
  customExercises: Exercise[];
  profile: Pick<User, 'unit' | 'goal' | 'experience' | 'timezone' | 'daysPerWeek'>;
  now: Date;
}

/** Sessions of history handed to suggestNext (it only needs the last few). */
const HISTORY_DEPTH = 12;
const MAX_ADDS = 3;
const MAX_SWAPS = 3;
const STALLED_FOR_DELOAD = 3;
const HARD_WEEKS_FOR_DELOAD = 6;

function sortRoutines(routines: Routine[]): Routine[] {
  return routines
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.position - b.r.position || a.i - b.i)
    .map((x) => x.r);
}

/** The routine after the most recently performed one (by position, wrapping). */
export function nextRoutine(routines: Routine[], workouts: Workout[]): Routine | null {
  const ordered = sortRoutines(routines);
  const first = ordered[0];
  if (!first) return null;
  const ids = new Set(ordered.map((r) => r.id));
  let latest: Workout | null = null;
  let latestT = -Infinity;
  for (const w of workouts) {
    if (!w.routineId || !ids.has(w.routineId)) continue;
    const t = timeOf(w.startedAt);
    if (t > latestT || (t === latestT && latest !== null && w.id > latest.id)) {
      latest = w;
      latestT = t;
    }
  }
  if (!latest) return first;
  const lastRoutineId = latest.routineId;
  const idx = ordered.findIndex((r) => r.id === lastRoutineId);
  return ordered[(idx + 1) % ordered.length] ?? first;
}

// ───────────── Helpers ─────────────

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  shoulders: 'Shoulders',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  lower_back: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
};

type Region = 'push' | 'pull' | 'legs' | 'core';
const REGION: Record<MuscleGroup, Region> = {
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  lats: 'pull',
  upper_back: 'pull',
  rear_delts: 'pull',
  biceps: 'pull',
  traps: 'pull',
  forearms: 'pull',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  adductors: 'legs',
  calves: 'legs',
  lower_back: 'legs',
  abs: 'core',
};

function fmtSets(n: number): string {
  return formatNumber(Math.round(n * 10) / 10);
}

/** Pick the best exercise to add for a muscle: unused, primary = muscle, on equipment the user already has. */
function pickAddition(
  muscle: MuscleGroup,
  usedEquipment: Set<Equipment>,
  excluded: Set<string>,
  custom: Exercise[],
): Exercise | undefined {
  const customIds = new Set(custom.map((e) => e.id));
  const pool = [...custom, ...EXERCISES.filter((e) => !customIds.has(e.id))];
  const tier = muscleTier(muscle);
  let best: { e: Exercise; s: number } | undefined;
  for (const e of pool) {
    if (e.primaryMuscle !== muscle || excluded.has(e.id)) continue;
    let s = 0;
    if (usedEquipment.has(e.equipment)) s += 10;
    if (tier === 'major' ? e.mechanic === 'compound' : e.mechanic === 'isolation') s += 2;
    if (e.trackingType === 'weight_reps') s += 1;
    if (!best || s > best.s) best = { e, s };
  }
  return best?.e;
}

/** Routine that already trains the same body region most (ties: lighter session, then earlier position). */
function pickRoutineFor(muscle: MuscleGroup, routines: Routine[], resolve: (id: string) => Exercise | undefined): Routine | undefined {
  const region = REGION[muscle];
  let best: { r: Routine; affinity: number; load: number } | undefined;
  for (const r of routines) {
    let affinity = 0;
    let load = 0;
    for (const item of r.items) {
      load += item.sets;
      const ex = resolve(item.exerciseId);
      if (!ex) continue;
      if (REGION[ex.primaryMuscle] === region) affinity += item.sets;
      else if (ex.secondaryMuscles.some((m) => REGION[m] === region)) affinity += item.sets * 0.25;
    }
    if (!best || affinity > best.affinity || (affinity === best.affinity && load < best.load)) best = { r, affinity, load };
  }
  return best?.r;
}

/** Weeks (Monday dates) → number of workouts with at least one counted set. */
function workoutsPerWeek(workouts: Workout[], tz: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of workouts) {
    if (!(w.sets ?? []).some(isCounted)) continue;
    let ws: string;
    try {
      ws = weekStartOf(w.startedAt, tz);
    } catch {
      continue;
    }
    out.set(ws, (out.get(ws) ?? 0) + 1);
  }
  return out;
}

// ───────────── Plan ─────────────

/** Full next-week plan: per-routine suggestions, volume vs targets, rule-based exercise recommendations. */
export function buildWeeklyPlan(input: PlanInput): WeeklyPlan {
  const { profile, now } = input;
  const workouts = input.workouts ?? [];
  const custom = input.customExercises ?? [];
  const tz = profile.timezone || 'UTC';
  const resolve = makeResolver(custom);
  const routines = sortRoutines(input.routines ?? []);
  const index = indexSessions(workouts);

  // 1. Per-routine suggestions.
  const routinePlans: RoutinePlan[] = routines.map((r) => ({
    routineId: r.id,
    routineName: r.name,
    exercises: r.items.map((item) =>
      suggestNext({
        exercise: resolve(item.exerciseId) ?? fallbackExercise(item.exerciseId),
        item,
        history: (index.get(item.exerciseId) ?? []).slice(0, HISTORY_DEPTH),
        profile,
      }),
    ),
  }));

  // 2. Volume over the last 7 local days (today included) vs targets.
  const today = localDate(now, tz);
  const from = addDays(today, -6);
  const recent = workouts.filter((w) => {
    try {
      const d = localDate(w.startedAt, tz);
      return d >= from && d <= today;
    } catch {
      return false;
    }
  });
  const actual = muscleCounts(recent, custom);
  const volume = toMuscleVolume(actual, profile);
  const targets = volumeTargets(profile.goal, profile.experience);

  // Projected weekly volume of the rotation: each routine runs daysPerWeek / routines.length times a week.
  const projected: MuscleCounts = emptyCounts();
  const inRoutines = new Set<string>();
  const usedEquipment = new Set<Equipment>();
  const routineItemCount = routines.reduce((n, r) => n + r.items.length, 0);
  if (routineItemCount > 0) {
    const freq = Math.max(1, profile.daysPerWeek || 1) / routines.length;
    for (const r of routines) {
      for (const item of r.items) {
        inRoutines.add(item.exerciseId);
        const ex = resolve(item.exerciseId);
        if (!ex) continue;
        usedEquipment.add(ex.equipment);
        addExerciseSets(projected, ex, item.sets * freq);
      }
    }
  }
  for (const w of workouts) {
    for (const s of w.sets ?? []) {
      if (!isCounted(s)) continue;
      const ex = resolve(s.exerciseId);
      if (ex) usedEquipment.add(ex.equipment);
    }
  }
  const hasRecent = recent.some((w) => (w.sets ?? []).some(isCounted));

  const recommendations: ExerciseRecommendation[] = [];

  // 3. Under-trained muscles → add. With routines, only flag muscles the rotation itself under-serves.
  const gaps = MUSCLE_GROUPS.filter((m) => {
    const min = targets[m].min;
    if (routineItemCount > 0) return projected[m] < min && actual[m] < min;
    return hasRecent && actual[m] < min;
  });
  const tierRank = { major: 0, minor: 1, small: 2 } as const;
  const shown = (m: MuscleGroup) => (routineItemCount > 0 && !hasRecent ? projected[m] : actual[m]);
  gaps.sort((a, b) => tierRank[muscleTier(a)] - tierRank[muscleTier(b)] || shown(a) / targets[a].min - shown(b) / targets[b].min);
  const excluded = new Set(inRoutines);
  for (const m of gaps) {
    if (recommendations.length >= MAX_ADDS) break;
    const ex = pickAddition(m, usedEquipment, excluded, custom);
    if (!ex) continue;
    excluded.add(ex.id);
    const routine = pickRoutineFor(m, routines, resolve);
    const t = targets[m];
    const basis = routineItemCount > 0 && !hasRecent ? 'hard sets/week planned' : 'hard sets in the last 7 days';
    const sets = muscleTier(m) === 'small' ? 2 : 3;
    recommendations.push({
      type: 'add',
      exerciseId: ex.id,
      ...(routine ? { routineId: routine.id } : {}),
      reason: `${MUSCLE_LABEL[m]}: ${fmtSets(shown(m))} ${basis} vs a ${t.min}–${t.max} target — add ${ex.name} (${sets} sets)${routine ? ` to ${routine.name}` : ''}.`,
      source: 'rules',
    });
  }

  // 4. Stalled lifts → swap (once per exercise, first routine it appears in).
  const stalledIds = new Set<string>();
  const swapped = new Set<string>();
  let swaps = 0;
  routines.forEach((r, ri) => {
    const plan = routinePlans[ri]!;
    const routineIds = new Set(r.items.map((i) => i.exerciseId));
    plan.exercises.forEach((s: ExerciseSuggestion) => {
      if (!s.stalled) return;
      stalledIds.add(s.exerciseId);
      if (swaps >= MAX_SWAPS || swapped.has(s.exerciseId)) return;
      const options = alternativesFor(s.exerciseId, custom, 10).filter((e) => !routineIds.has(e.id));
      const pick = options.slice(0, 5).find((e) => usedEquipment.has(e.equipment)) ?? options[0];
      if (!pick) return;
      swapped.add(s.exerciseId);
      swaps++;
      const name = (resolve(s.exerciseId) ?? fallbackExercise(s.exerciseId)).name;
      const e1rm = s.e1rmKg !== null ? ` (e1RM stuck around ${formatWeight(s.e1rmKg, profile.unit)})` : '';
      recommendations.push({
        type: 'swap',
        exerciseId: s.exerciseId,
        replacementId: pick.id,
        routineId: r.id,
        reason: `${name} has not progressed in 3 sessions${e1rm} — swap in ${pick.name} for a fresh stimulus.`,
        source: 'rules',
      });
    });
  });

  // 5. Deload: several stalled lifts, or a long run of hard weeks.
  const weekStart = weekStartOf(now, tz);
  const perWeek = workoutsPerWeek(workouts, tz);
  const hardThreshold = Math.max(2, (profile.daysPerWeek || 3) - 1);
  let hardWeeks = 0;
  for (let ws = addDays(weekStart, -7); (perWeek.get(ws) ?? 0) >= hardThreshold; ws = addDays(ws, -7)) hardWeeks++;
  const deloadRecommended = stalledIds.size >= STALLED_FOR_DELOAD || hardWeeks >= HARD_WEEKS_FOR_DELOAD;

  return {
    weekStart,
    generatedAt: now.toISOString(),
    nextRoutineId: nextRoutine(routines, workouts)?.id ?? null,
    routines: routinePlans,
    volume,
    recommendations,
    deloadRecommended,
  };
}
