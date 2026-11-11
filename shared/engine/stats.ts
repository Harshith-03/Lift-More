import type { Exercise, ExerciseHistory, PersonalRecord, StatsSummary, TrackingType, User, Workout, WorkoutSet } from '../types';
import { addDays, weekStartOf } from './dates';
import { fallbackExercise, makeResolver } from './library';
import { countedSetsByExercise, estimate1RM, isCounted, sessionsFor, setsVolumeKg, sortChronological, timeOf } from './sets';
import { muscleVolume } from './volume';
import { roundTo } from './units';

const EPS = 1e-6;

// ───────────── PR tracking ─────────────

interface FrontierPoint {
  w: number;
  r: number;
  date: string;
  workoutId: string;
}

interface Best {
  value: number;
  weightKg: number | null;
  reps: number | null;
  date: string;
  workoutId: string;
}

/** Running all-time bests for one exercise. */
interface ExerciseBests {
  sessions: number;
  e1rm: Best | null;
  weight: Best | null;
  volume: Best | null;
  duration: Best | null;
  /** Rep-max frontier: weight desc, reps strictly increasing; no point dominated by another. */
  frontier: FrontierPoint[];
}

function newBests(): ExerciseBests {
  return { sessions: 0, e1rm: null, weight: null, volume: null, duration: null, frontier: [] };
}

/** Max reps ever done at a weight ≥ w, or -1 if nothing that heavy was ever lifted. */
function maxRepsAtOrAbove(frontier: FrontierPoint[], w: number): number {
  let best = -1;
  for (const p of frontier) {
    if (p.w >= w - EPS) best = Math.max(best, p.r);
    else break;
  }
  return best;
}

function addToFrontier(frontier: FrontierPoint[], point: FrontierPoint): void {
  for (const p of frontier) if (p.w >= point.w - EPS && p.r >= point.r) return; // dominated
  const kept = frontier.filter((p) => !(p.w <= point.w + EPS && p.r <= point.r));
  kept.push(point);
  kept.sort((a, b) => b.w - a.w);
  frontier.length = 0;
  frontier.push(...kept);
}

interface SessionCandidates {
  e1rm: { e: number; w: number; r: number } | null;
  weight: { w: number; r: number } | null;
  volume: number;
  duration: { d: number; w: number } | null;
  repSets: Array<{ w: number; r: number }>;
}

function candidatesFor(sets: WorkoutSet[], tracking: TrackingType): SessionCandidates {
  const c: SessionCandidates = { e1rm: null, weight: null, volume: 0, duration: null, repSets: [] };
  for (const s of sets) {
    const w = Math.max(0, s.weightKg ?? 0);
    const r = Math.max(0, s.reps ?? 0);
    const d = Math.max(0, s.durationSec ?? 0);
    if (tracking === 'duration') {
      if (d > 0 && (!c.duration || d > c.duration.d || (d === c.duration.d && w > c.duration.w))) c.duration = { d, w };
      if (d > 0 && w > 0 && (!c.weight || w > c.weight.w)) c.weight = { w, r: 0 };
      continue;
    }
    if (r <= 0) continue;
    c.repSets.push({ w, r });
    if (w > 0 && (!c.weight || w > c.weight.w || (w === c.weight.w && r > c.weight.r))) c.weight = { w, r };
    if (tracking === 'weight_reps' && w > 0) {
      const e = estimate1RM(w, r);
      if (e !== null && (!c.e1rm || e > c.e1rm.e)) c.e1rm = { e, w, r };
    }
  }
  if (tracking === 'weight_reps') c.volume = setsVolumeKg(sets);
  return c;
}

/**
 * Compare one exercise-session with the running bests, return the PRs it sets (none for the very
 * first session of an exercise), then fold it into the bests.
 */
function recordSession(
  bests: ExerciseBests,
  exerciseId: string,
  sets: WorkoutSet[],
  tracking: TrackingType,
  workout: Workout,
): PersonalRecord[] {
  const c = candidatesFor(sets, tracking);
  const hasData = c.repSets.length > 0 || c.duration !== null;
  if (!hasData) return [];
  const date = workout.startedAt;
  const workoutId = workout.id;
  const prs: PersonalRecord[] = [];
  const first = bests.sessions === 0;
  const pr = (type: PersonalRecord['type'], value: number, weightKg: number | null, reps: number | null) =>
    prs.push({ exerciseId, type, value, weightKg, reps, date, workoutId });

  // e1RM
  if (c.e1rm && (!bests.e1rm || c.e1rm.e > bests.e1rm.value + EPS)) {
    if (!first) pr('e1rm', roundTo(c.e1rm.e, 2), c.e1rm.w, c.e1rm.r);
    bests.e1rm = { value: c.e1rm.e, weightKg: c.e1rm.w, reps: c.e1rm.r, date, workoutId };
  }
  // Heaviest weight
  if (c.weight && (!bests.weight || c.weight.w > bests.weight.value + EPS)) {
    const reps = tracking === 'duration' ? null : c.weight.r;
    if (!first) pr('weight', c.weight.w, c.weight.w, reps);
    bests.weight = { value: c.weight.w, weightKg: c.weight.w, reps, date, workoutId };
  }
  // Reps at a weight: more reps than ever at this weight or heavier (heaviest such set only).
  if (c.repSets.length > 0) {
    let best: { w: number; r: number } | null = null;
    for (const s of c.repSets) {
      const prior = maxRepsAtOrAbove(bests.frontier, s.w);
      if (prior >= 0 && s.r > prior && (!best || s.w > best.w + EPS || (Math.abs(s.w - best.w) <= EPS && s.r > best.r))) {
        best = s;
      }
    }
    if (best && !first) pr('reps', best.r, best.w > 0 ? best.w : null, best.r);
    for (const s of c.repSets) addToFrontier(bests.frontier, { w: s.w, r: s.r, date, workoutId });
  }
  // Session volume
  if (c.volume > 0 && (!bests.volume || c.volume > bests.volume.value + EPS)) {
    if (!first) pr('volume', roundTo(c.volume, 2), null, null);
    bests.volume = { value: c.volume, weightKg: null, reps: null, date, workoutId };
  }
  // Longest hold / carry
  if (c.duration && (!bests.duration || c.duration.d > bests.duration.value + EPS)) {
    const w = c.duration.w > 0 ? c.duration.w : null;
    if (!first) pr('duration', c.duration.d, w, null);
    bests.duration = { value: c.duration.d, weightKg: w, reps: null, date, workoutId };
  }
  bests.sessions++;
  return prs;
}

class PRTracker {
  private readonly bests = new Map<string, ExerciseBests>();
  private readonly resolve: (id: string) => Exercise | undefined;

  constructor(custom: Exercise[]) {
    this.resolve = makeResolver(custom);
  }

  trackingOf(id: string): TrackingType {
    return (this.resolve(id) ?? fallbackExercise(id)).trackingType;
  }

  bestsFor(id: string): ExerciseBests {
    let b = this.bests.get(id);
    if (!b) {
      b = newBests();
      this.bests.set(id, b);
    }
    return b;
  }

  /** PRs this workout sets vs everything already folded in; then folds it in. */
  add(workout: Workout): PersonalRecord[] {
    const out: PersonalRecord[] = [];
    for (const [id, sets] of countedSetsByExercise(workout)) {
      out.push(...recordSession(this.bestsFor(id), id, sets, this.trackingOf(id), workout));
    }
    return out;
  }
}

function isBefore(a: Workout, b: Workout): boolean {
  const ta = timeOf(a.startedAt);
  const tb = timeOf(b.startedAt);
  return ta < tb || (ta === tb && a.id < b.id);
}

/** PRs set in `workout` compared with all `prior` workouts (prior excludes `workout`). */
export function detectPRs(workout: Workout, prior: Workout[], custom: Exercise[] = []): PersonalRecord[] {
  const tracker = new PRTracker(custom);
  // Only history that happened before this workout counts (safe even if callers pass every other workout).
  for (const w of sortChronological(prior.filter((p) => p.id !== workout.id && isBefore(p, workout)))) tracker.add(w);
  return tracker.add(workout);
}

// ───────────── Exercise history ─────────────

function topSetOf(sets: WorkoutSet[], tracking: TrackingType): ExerciseHistory['sessions'][number]['topSet'] {
  let top: WorkoutSet | null = null;
  for (const s of sets) {
    if (!top) {
      top = s;
      continue;
    }
    const w = s.weightKg ?? 0;
    const tw = top.weightKg ?? 0;
    const better =
      tracking === 'duration'
        ? (s.durationSec ?? 0) > (top.durationSec ?? 0) || ((s.durationSec ?? 0) === (top.durationSec ?? 0) && w > tw)
        : w > tw || (w === tw && (s.reps ?? 0) > (top.reps ?? 0));
    if (better) top = s;
  }
  return top ? { weightKg: top.weightKg, reps: top.reps, durationSec: top.durationSec } : null;
}

function sessionE1rm(sets: WorkoutSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (w <= 0 || r <= 0) continue;
    const e = estimate1RM(w, r);
    if (e !== null && (best === null || e > best)) best = e;
  }
  return best === null ? null : roundTo(best, 2);
}

/** Per-exercise history + all-time PRs (current records: e1RM, heaviest, rep maxes, volume, duration). */
export function exerciseHistory(exerciseId: string, workouts: Workout[], custom: Exercise[] = []): ExerciseHistory {
  const exercise = makeResolver(custom)(exerciseId) ?? fallbackExercise(exerciseId);
  const tracking = exercise.trackingType;
  const sessions = sessionsFor(exerciseId, workouts);

  const bests = newBests();
  const byId = new Map(workouts.map((w) => [w.id, w]));
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i]!;
    const w = byId.get(s.workoutId);
    if (w) recordSession(bests, exerciseId, s.sets, tracking, w);
  }

  const prs: PersonalRecord[] = [];
  const push = (type: PersonalRecord['type'], b: Best | null, round = false) => {
    if (b) prs.push({ exerciseId, type, value: round ? roundTo(b.value, 2) : b.value, weightKg: b.weightKg, reps: b.reps, date: b.date, workoutId: b.workoutId });
  };
  push('e1rm', bests.e1rm, true);
  push('weight', bests.weight);
  if (tracking !== 'duration') {
    for (const p of bests.frontier) {
      prs.push({ exerciseId, type: 'reps', value: p.r, weightKg: p.w > 0 ? p.w : null, reps: p.r, date: p.date, workoutId: p.workoutId });
    }
  }
  push('volume', bests.volume, true);
  push('duration', bests.duration);

  return {
    exerciseId,
    sessions: sessions.map((s) => ({
      ...s,
      topSet: topSetOf(s.sets, tracking),
      e1rmKg: tracking === 'weight_reps' ? sessionE1rm(s.sets) : null,
      volumeKg: roundTo(setsVolumeKg(s.sets), 2),
    })),
    prs,
  };
}

// ───────────── Dashboard ─────────────

function safeWeekStart(iso: string, tz: string): string | null {
  try {
    return weekStartOf(iso, tz);
  } catch {
    return null;
  }
}

/** Dashboard summary. */
export function computeStats(
  workouts: Workout[],
  profile: Pick<User, 'goal' | 'experience' | 'timezone' | 'daysPerWeek'>,
  now: Date,
  custom: Exercise[] = [],
): StatsSummary {
  const tz = profile.timezone || 'UTC';
  const thisWeek = weekStartOf(now, tz);

  const buckets = new Map<string, { volumeKg: number; sets: number; workouts: number }>();
  const thisWeekWorkouts: Workout[] = [];
  for (const w of workouts) {
    const ws = safeWeekStart(w.startedAt, tz);
    if (!ws) continue;
    let b = buckets.get(ws);
    if (!b) {
      b = { volumeKg: 0, sets: 0, workouts: 0 };
      buckets.set(ws, b);
    }
    const counted = (w.sets ?? []).filter(isCounted);
    b.workouts++;
    b.sets += counted.length;
    b.volumeKg += setsVolumeKg(counted);
    if (ws === thisWeek) thisWeekWorkouts.push(w);
  }

  let streakWeeks = 0;
  let cursor: string | null = buckets.has(thisWeek) ? thisWeek : buckets.has(addDays(thisWeek, -7)) ? addDays(thisWeek, -7) : null;
  while (cursor && buckets.has(cursor)) {
    streakWeeks++;
    cursor = addDays(cursor, -7);
  }

  const weeklyVolume: StatsSummary['weeklyVolume'] = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const b = buckets.get(weekStart);
    weeklyVolume.push({ weekStart, volumeKg: roundTo(b?.volumeKg ?? 0, 2), sets: b?.sets ?? 0, workouts: b?.workouts ?? 0 });
  }

  // Recent PRs: replay history oldest → newest so every PR is judged against what came before it.
  const tracker = new PRTracker(custom);
  const perWorkout: PersonalRecord[][] = [];
  for (const w of sortChronological(workouts)) {
    const prs = tracker.add(w);
    if (prs.length > 0) perWorkout.push(prs);
  }
  const recentPRs: PersonalRecord[] = [];
  for (let i = perWorkout.length - 1; i >= 0 && recentPRs.length < 10; i--) {
    for (const p of perWorkout[i]!) {
      if (recentPRs.length >= 10) break;
      recentPRs.push(p);
    }
  }

  return {
    streakWeeks,
    workoutsThisWeek: buckets.get(thisWeek)?.workouts ?? 0,
    targetThisWeek: profile.daysPerWeek,
    totalWorkouts: workouts.length,
    weeklyVolume,
    muscleVolumeThisWeek: muscleVolume(thisWeekWorkouts, profile, custom),
    recentPRs,
  };
}
