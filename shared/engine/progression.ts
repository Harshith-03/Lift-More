import type {
  Exercise,
  ExerciseSession,
  ExerciseSuggestion,
  ProgressionAction,
  RoutineItem,
  TrackingType,
  Unit,
  User,
  WorkoutSet,
} from '../types';
import { estimate1RM, isCounted, timeOf } from './sets';
import { defaultIncrement, formatNumber, formatWeight, isMultipleOf, kgToUnit, loadStep, roundTo, roundToLoadable, unitToKg } from './units';

export interface SuggestInput {
  exercise: Exercise;
  item: Pick<RoutineItem, 'sets' | 'repMin' | 'repMax'>;
  /** Sessions for this exercise, most recent first (see sessionsFor). */
  history: ExerciseSession[];
  profile: Pick<User, 'unit' | 'goal' | 'experience'>;
}

// ───────────── Session digest ─────────────

interface PerfSet {
  weightKg: number;
  reps: number;
  durationSec: number;
  rpe: number | null;
}

/** What the progression rules need from one session. */
export interface Perf {
  session: ExerciseSession;
  /** Completed working + failure sets with a measurement (drop sets only if nothing else). */
  sets: PerfSet[];
  topKg: number;
  e1rm: number | null;
  /** Total reps over the sets at the top weight. */
  repsAtTop: number;
  bestReps: number;
  bestDuration: number;
  totalDuration: number;
}

const X = '×';
const WEIGHT_EPS = 0.05; // kg — below any real plate difference

function bySetPosition(a: WorkoutSet, b: WorkoutSet): number {
  return a.exerciseOrder - b.exerciseOrder || a.setOrder - b.setOrder;
}

function hasMeasure(s: WorkoutSet, tracking: TrackingType): boolean {
  return tracking === 'duration' ? (s.durationSec ?? 0) > 0 : (s.reps ?? 0) > 0;
}

function isAtTop(weightKg: number, topKg: number): boolean {
  return weightKg >= topKg * 0.99 - WEIGHT_EPS;
}

export function toPerf(session: ExerciseSession, tracking: TrackingType): Perf | null {
  const usable = session.sets.filter((s) => isCounted(s) && hasMeasure(s, tracking)).sort(bySetPosition);
  if (usable.length === 0) return null;
  const straight = usable.filter((s) => s.kind !== 'drop');
  const chosen = straight.length > 0 ? straight : usable;
  const sets: PerfSet[] = chosen.map((s) => ({
    weightKg: Math.max(0, s.weightKg ?? 0),
    reps: Math.max(0, s.reps ?? 0),
    durationSec: Math.max(0, s.durationSec ?? 0),
    rpe: typeof s.rpe === 'number' && Number.isFinite(s.rpe) ? s.rpe : null,
  }));
  let topKg = 0;
  let e1rm: number | null = null;
  let bestReps = 0;
  let bestDuration = 0;
  let totalDuration = 0;
  for (const s of sets) {
    topKg = Math.max(topKg, s.weightKg);
    bestReps = Math.max(bestReps, s.reps);
    bestDuration = Math.max(bestDuration, s.durationSec);
    totalDuration += s.durationSec;
    if (tracking === 'weight_reps' && s.weightKg > 0) {
      const e = estimate1RM(s.weightKg, s.reps);
      if (e !== null && (e1rm === null || e > e1rm)) e1rm = e;
    }
  }
  let repsAtTop = 0;
  for (const s of sets) if (isAtTop(s.weightKg, topKg)) repsAtTop += s.reps;
  return { session, sets, topKg, e1rm, repsAtTop, bestReps, bestDuration, totalDuration };
}

type Progress = 'up' | 'flat' | 'reset';

/** Did `newer` beat `older`? A drop in load (deload / reset) breaks a stall window. */
function compareSessions(newer: Perf, older: Perf, tracking: TrackingType): Progress {
  if (newer.topKg > older.topKg + WEIGHT_EPS) return 'up';
  if (newer.topKg < older.topKg - WEIGHT_EPS) return 'reset';
  if (tracking === 'duration') {
    return newer.bestDuration > older.bestDuration || newer.totalDuration > older.totalDuration ? 'up' : 'flat';
  }
  if (tracking === 'weight_reps' && newer.e1rm !== null && older.e1rm !== null && newer.e1rm > older.e1rm + WEIGHT_EPS) {
    return 'up';
  }
  return newer.repsAtTop > older.repsAtTop || newer.bestReps > older.bestReps ? 'up' : 'flat';
}

/**
 * Stalled = no gain across the last 3 sessions: neither of the last two sessions beat the one
 * before it on e1RM, top weight, or reps at the top weight. (A weight increase counts as a gain even
 * though Epley's e1RM usually dips when reps reset; a weight decrease starts a fresh window.)
 */
export function isStalled(perfs: Perf[], tracking: TrackingType): boolean {
  const [p0, p1, p2] = perfs;
  if (!p0 || !p1 || !p2) return false;
  return compareSessions(p0, p1, tracking) === 'flat' && compareSessions(p1, p2, tracking) === 'flat';
}

/** Digest a history list (any order) into sessions with data, most recent first. */
export function digestHistory(history: ExerciseSession[], tracking: TrackingType): Perf[] {
  const sorted = history
    .map((s, i) => ({ s, i, t: timeOf(s.date) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.s);
  const out: Perf[] = [];
  for (const s of sorted) {
    const p = toPerf(s, tracking);
    if (p) out.push(p);
  }
  return out;
}

// ───────────── Formatting helpers ─────────────

function fmtTargets(targets: number[], suffix = ''): string {
  const first = targets[0] ?? 0;
  return targets.every((t) => t === first) ? `${targets.length}${X}${first}${suffix}` : `${targets.join('/')}${suffix}`;
}

function describeLast(perf: Perf, exercise: Exercise, unit: Unit): string {
  const tracking = exercise.trackingType;
  if (tracking === 'duration') {
    const d = fmtTargets(
      perf.sets.map((s) => s.durationSec),
      ' s',
    );
    return perf.topKg > 0 ? `${d} with ${formatWeight(perf.topKg, unit)}` : d;
  }
  const reps = perf.sets.map((s) => s.reps);
  const sameWeight = perf.sets.every((s) => isAtTop(s.weightKg, perf.topKg));
  if (tracking === 'bodyweight_reps') {
    if (exercise.equipment === 'band') return fmtTargets(reps);
    if (perf.topKg <= 0) return `${fmtTargets(reps)} at bodyweight`;
    return sameWeight ? `${fmtTargets(reps)} at +${formatWeight(perf.topKg, unit)}` : `${reps.join('/')} (top +${formatWeight(perf.topKg, unit)})`;
  }
  if (perf.topKg <= 0) return fmtTargets(reps);
  return sameWeight ? `${fmtTargets(reps)} at ${formatWeight(perf.topKg, unit)}` : `${reps.join('/')} (top set ${formatWeight(perf.topKg, unit)})`;
}

function deltaText(fromKg: number, toKg: number, unit: Unit): string {
  return `${formatNumber(Math.abs(kgToUnit(toKg, unit) - kgToUnit(fromKg, unit)))} ${unit}`;
}

// ───────────── Weight helpers ─────────────

/** How an exercise is loaded: progress by `inc`, snap to multiples of `step` (both in `unit`). */
interface Load {
  unit: Unit;
  inc: number;
  step: number;
}

function loadFor(exercise: Exercise, unit: Unit): Load {
  if (exercise.trackingType === 'bodyweight_reps') {
    const bw = unit === 'kg' ? 2.5 : 5;
    return { unit, inc: bw, step: bw };
  }
  return { unit, inc: defaultIncrement(exercise, unit), step: loadStep(exercise, unit) };
}

/** The logged weight, cleaned up: kept as-is if already a clean value in `unit`, else snapped to the load step. */
function keepWeight(topKg: number, L: Load): number {
  if (topKg <= 0) return 0;
  if (isMultipleOf(topKg, L.unit, 0.25)) return roundToLoadable(topKg, L.unit, 0.25);
  const snapped = roundToLoadable(topKg, L.unit, L.step);
  return snapped > 0 ? snapped : roundToLoadable(topKg, L.unit, 0.25);
}

/** Top weight + `steps` increments, snapped to the load step and always heavier than before. */
function bumpWeight(topKg: number, L: Load, steps: number): number {
  const { unit } = L;
  let next = roundToLoadable(unitToKg(kgToUnit(topKg, unit) + L.inc * steps, unit), unit, L.step);
  for (let guard = 0; next <= topKg + 1e-9 && guard < 4; guard++) {
    next = roundToLoadable(unitToKg(kgToUnit(next, unit) + L.step, unit), unit, L.step);
  }
  return next;
}

/** ~90 % of the top weight, snapped to the load step and always at least one step lighter. 0 = cannot go lighter. */
function deloadWeight(topKg: number, L: Load): number {
  const { unit } = L;
  let d = roundToLoadable(topKg * 0.9, unit, L.step);
  if (d >= topKg - 1e-9) d = roundToLoadable(unitToKg(kgToUnit(topKg, unit) - L.step, unit), unit, L.step);
  return d > 0 && d < topKg - 1e-9 ? d : 0;
}

// ───────────── Rules ─────────────

interface Decision {
  action: ProgressionAction;
  weightKg: number | null;
  repsPerSet: number[];
  reason: string;
}

function fill(n: number, v: number): number[] {
  return Array.from({ length: n }, () => v);
}

/** +1 rep on the weakest sets (all sets if they were equal), capped at repMax. Based on sets at the top weight. */
function repTargets(perf: Perf, sets: number, repMin: number, repMax: number): number[] {
  const atTop = perf.sets.filter((s) => isAtTop(s.weightKg, perf.topKg)).map((s) => s.reps);
  const bases = Array.from({ length: sets }, (_, i) => atTop[i] ?? repMin);
  const hi = Math.max(...bases);
  const allEqual = bases.every((b) => b === hi);
  return bases.map((b) => Math.max(1, Math.min(repMax, allEqual || b < hi ? b + 1 : b)));
}

function mostBelow(perf: Perf, repMin: number): boolean {
  const below = perf.sets.filter((s) => s.reps < repMin).length;
  return below * 2 > perf.sets.length;
}

function maxRpeOf(perf: Perf): number | null {
  let max: number | null = null;
  for (const s of perf.sets) if (s.rpe !== null && (max === null || s.rpe > max)) max = s.rpe;
  return max;
}

interface Ctx {
  exercise: Exercise;
  unit: Unit;
  experience: User['experience'];
  sets: number;
  repMin: number;
  repMax: number;
  perfs: Perf[];
  last: Perf;
  stalled: boolean;
}

function belowMinDecision(ctx: Ctx, weightLabel: (kg: number) => string, L: Load, isBodyweight: boolean): Decision {
  const { last, perfs, sets, repMin, unit, stalled } = ctx;
  const belowSets = last.sets.filter((s) => s.reps < repMin).length;
  const prev = perfs[1];
  const twice = prev !== undefined && mostBelow(prev, repMin);
  if (!twice && !stalled) {
    const w = keepWeight(last.topKg, L);
    return {
      action: 'hold',
      weightKg: w > 0 ? w : null,
      repsPerSet: fill(sets, repMin),
      reason: `Missed ${repMin} reps on ${belowSets} of ${last.sets.length} sets at ${weightLabel(last.topKg)} — stay at ${weightLabel(w)} and aim for ${fmtTargets(fill(sets, repMin))}.`,
    };
  }
  const why = twice ? `Below ${repMin} reps two sessions running` : 'No progress in 3 sessions';
  let target = isBodyweight
    ? last.topKg > 0
      ? Math.max(0, roundToLoadable(unitToKg(kgToUnit(last.topKg, unit) - 2 * L.inc, unit), unit, L.step))
      : 0
    : deloadWeight(last.topKg, L);
  if (isBodyweight && last.topKg <= 0) {
    const reps = Math.max(1, Math.round(repMin * 0.7));
    return {
      action: 'deload',
      weightKg: null,
      repsPerSet: fill(sets, reps),
      reason: `${why} — back off to ${fmtTargets(fill(sets, reps))} with clean reps (or use assistance), then rebuild.`,
    };
  }
  if (!isBodyweight && target <= 0) {
    // Already at the lightest load: deload volume/intensity via reps instead.
    target = keepWeight(last.topKg, L);
    const reps = Math.max(1, Math.round(repMin * 0.8));
    return {
      action: 'deload',
      weightKg: target > 0 ? target : null,
      repsPerSet: fill(sets, reps),
      reason: `${why} at ${weightLabel(last.topKg)} — take an easy week at ${fmtTargets(fill(sets, reps))}, then rebuild.`,
    };
  }
  return {
    action: 'deload',
    weightKg: target > 0 ? target : null,
    repsPerSet: fill(sets, repMin),
    reason: `${why} at ${weightLabel(last.topKg)} — deload to ${weightLabel(target)}, aim for ${fmtTargets(fill(sets, repMin))} and rebuild.`,
  };
}

function weightRepsRules(ctx: Ctx): Decision {
  const { exercise, unit, experience, sets, repMin, repMax, last } = ctx;
  const L = loadFor(exercise, unit);
  const label = (kg: number) => (kg > 0 ? formatWeight(kg, unit) : 'no load');
  const S = last.sets;
  const hit = describeLast(last, exercise, unit);
  const maxRpe = maxRpeOf(last);
  const allAtMax = S.every((s) => s.reps >= repMax);
  const allAtMin = S.every((s) => s.reps >= repMin);
  const hasLoad = last.topKg > 0;

  if (allAtMax) {
    if (maxRpe !== null && maxRpe > 9) {
      const w = keepWeight(last.topKg, L);
      return {
        action: 'hold',
        weightKg: hasLoad ? w : null,
        repsPerSet: fill(sets, repMax),
        reason: `Hit ${hit} but at RPE ${formatNumber(maxRpe)} — repeat ${hasLoad ? label(w) : 'it'} until it feels smoother, then add weight.`,
      };
    }
    const steps = maxRpe !== null && maxRpe <= 7 ? 2 : 1;
    const target = fmtTargets(fill(sets, repMin));
    if (!hasLoad) {
      return { action: 'increase_weight', weightKg: null, repsPerSet: fill(sets, repMin), reason: `Hit ${hit} — add some weight, aim for ${target}.` };
    }
    const next = bumpWeight(last.topKg, L, steps);
    const easy = steps === 2 ? ` (RPE ${formatNumber(maxRpe ?? 7)})` : '';
    return {
      action: 'increase_weight',
      weightKg: next,
      repsPerSet: fill(sets, repMin),
      reason: `Hit ${hit}${easy} — add ${deltaText(last.topKg, next, unit)}, aim for ${target}.`,
    };
  }

  // Beginner linear progression on compounds: every session while all sets reach repMin at RPE ≤ 8.
  if (experience === 'beginner' && exercise.mechanic === 'compound' && hasLoad && allAtMin && maxRpe !== null && maxRpe <= 8) {
    const next = bumpWeight(last.topKg, L, 1);
    return {
      action: 'increase_weight',
      weightKg: next,
      repsPerSet: fill(sets, repMin),
      reason: `Hit ${hit} (RPE ${formatNumber(maxRpe)}) — add ${deltaText(last.topKg, next, unit)} (beginner linear progression), aim for ${fmtTargets(fill(sets, repMin))}.`,
    };
  }

  if (mostBelow(last, repMin)) return belowMinDecision(ctx, label, L, false);

  const w = keepWeight(last.topKg, L);
  const targets = repTargets(last, sets, repMin, repMax);
  return {
    action: 'increase_reps',
    weightKg: hasLoad ? w : null,
    repsPerSet: targets,
    reason: hasLoad
      ? `${hit} — ${Math.abs(w - last.topKg) < 1e-6 ? 'keep' : 'use'} ${label(w)}, aim for ${fmtTargets(targets)}.`
      : `${hit} — add a rep where you can, aim for ${fmtTargets(targets)}.`,
  };
}

function bodyweightRules(ctx: Ctx): Decision {
  const { exercise, unit, sets, repMin, repMax, last } = ctx;
  const band = exercise.equipment === 'band';
  const L = loadFor(exercise, unit);
  const label = (kg: number) => (kg > 0 ? `+${formatWeight(kg, unit)}` : 'bodyweight');
  const hit = describeLast(last, exercise, unit);
  const maxRpe = maxRpeOf(last);
  const added = last.topKg;
  const allAtMax = last.sets.every((s) => s.reps >= repMax);

  if (allAtMax) {
    if (maxRpe !== null && maxRpe > 9) {
      const w = keepWeight(added, L);
      return {
        action: 'hold',
        weightKg: w > 0 ? w : null,
        repsPerSet: fill(sets, repMax),
        reason: `Hit ${hit} but at RPE ${formatNumber(maxRpe)} — repeat it until it feels smoother before making it harder.`,
      };
    }
    const target = fmtTargets(fill(sets, repMin));
    if (band) {
      return { action: 'increase_weight', weightKg: null, repsPerSet: fill(sets, repMin), reason: `Hit ${hit} — switch to a heavier band, aim for ${target}.` };
    }
    const next = bumpWeight(added, L, 1);
    return {
      action: 'increase_weight',
      weightKg: next,
      repsPerSet: fill(sets, repMin),
      reason: `Hit ${hit} — add ${deltaText(added, next, unit)}${added > 0 ? '' : ' (belt or vest)'}, aim for ${target}.`,
    };
  }

  if (mostBelow(last, repMin)) return belowMinDecision(ctx, label, L, true);

  const w = keepWeight(added, L);
  const targets = repTargets(last, sets, repMin, repMax);
  return {
    action: 'increase_reps',
    weightKg: w > 0 ? w : null,
    repsPerSet: targets,
    reason: `${hit} — ${w > 0 ? `${Math.abs(w - added) < 1e-6 ? 'keep' : 'use'} ${label(w)}, ` : ''}aim for ${fmtTargets(targets)}.`,
  };
}

function durationRules(ctx: Ctx): Decision {
  const { exercise, unit, sets, repMin, repMax, last } = ctx;
  const L = loadFor(exercise, unit);
  const hit = describeLast(last, exercise, unit);
  const loaded = last.topKg > 0;
  const allAtMax = last.sets.every((s) => s.durationSec >= repMax);

  if (allAtMax) {
    if (loaded) {
      const next = bumpWeight(last.topKg, L, 1);
      return {
        action: 'increase_weight',
        weightKg: next,
        repsPerSet: fill(sets, repMin),
        reason: `Held ${hit} — add ${deltaText(last.topKg, next, unit)}, aim for ${fmtTargets(fill(sets, repMin), ' s')}.`,
      };
    }
    return {
      action: 'hold',
      weightKg: null,
      repsPerSet: fill(sets, repMax),
      reason: `Held ${hit} — that's the top of the range; move to a harder variation or add load.`,
    };
  }

  const step = repMax >= 90 ? 10 : 5;
  const bases = Array.from({ length: sets }, (_, i) => last.sets[i]?.durationSec ?? repMin - step);
  const targets = bases.map((b) => Math.max(1, Math.min(repMax, Math.round(b) + step)));
  const w = loaded ? keepWeight(last.topKg, L) : 0;
  return {
    action: 'increase_duration',
    weightKg: w > 0 ? w : null,
    repsPerSet: targets,
    reason: `Held ${hit} — add ${step} s, aim for ${fmtTargets(targets, ' s')}.`,
  };
}

function startDecision(exercise: Exercise, sets: number, repMin: number): Decision {
  const targets = fill(sets, repMin);
  const t = exercise.trackingType;
  const reason =
    t === 'duration'
      ? `First session — hold ${fmtTargets(targets, ' s')}, finishing each set with a little left in the tank.`
      : t === 'bodyweight_reps'
        ? `First session — do ${fmtTargets(targets)}, stopping ~2 reps short of failure.`
        : `First session — pick a weight you can lift for ${fmtTargets(targets)} with ~2 reps in reserve.`;
  return { action: 'start', weightKg: null, repsPerSet: targets, reason };
}

/** Next-session target for one exercise (double progression + RPE + stall/deload rules). */
export function suggestNext(input: SuggestInput): ExerciseSuggestion {
  const { exercise, profile } = input;
  const unit: Unit = profile.unit === 'lb' ? 'lb' : 'kg';
  const tracking = exercise.trackingType;
  const sets = Math.max(1, Math.round(Number(input.item.sets) || 1));
  let repMin = Math.max(1, Math.round(Number(input.item.repMin) || 1));
  let repMax = Math.max(1, Math.round(Number(input.item.repMax) || repMin));
  if (repMax < repMin) [repMin, repMax] = [repMax, repMin];

  const perfs = digestHistory(input.history ?? [], tracking);
  const last = perfs[0];
  if (!last) {
    const d = startDecision(exercise, sets, repMin);
    return {
      exerciseId: exercise.id,
      action: d.action,
      sets,
      weightKg: d.weightKg,
      repsPerSet: d.repsPerSet,
      repMin,
      repMax,
      reason: d.reason,
      lastPerformance: null,
      e1rmKg: null,
      stalled: false,
    };
  }

  const stalled = isStalled(perfs, tracking);
  const ctx: Ctx = { exercise, unit, experience: profile.experience, sets, repMin, repMax, perfs, last, stalled };
  const d = tracking === 'duration' ? durationRules(ctx) : tracking === 'bodyweight_reps' ? bodyweightRules(ctx) : weightRepsRules(ctx);

  const lastSets = last.session.sets
    .filter(isCounted)
    .sort(bySetPosition)
    .map((s) => ({ weightKg: s.weightKg, reps: s.reps, durationSec: s.durationSec, rpe: s.rpe }));

  return {
    exerciseId: exercise.id,
    action: d.action,
    sets,
    weightKg: d.weightKg,
    repsPerSet: d.repsPerSet,
    repMin,
    repMax,
    reason: d.reason,
    lastPerformance: { date: last.session.date, sets: lastSets },
    e1rmKg: tracking === 'weight_reps' && last.e1rm !== null ? roundTo(last.e1rm, 2) : null,
    stalled,
  };
}
