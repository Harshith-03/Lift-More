import { EXERCISES, builtInExercise } from '../exercises';
import type { Exercise, MuscleGroup } from '../types';

/** Look up a built-in or custom exercise by id. */
export function getExercise(id: string, custom: Exercise[] = []): Exercise | undefined {
  return custom.find((e) => e.id === id) ?? EXERCISES.find((e) => e.id === id);
}

/** Fast resolver for hot loops: customs shadow built-ins, like getExercise. */
export function makeResolver(custom: Exercise[] = []): (id: string) => Exercise | undefined {
  if (custom.length === 0) return builtInExercise;
  const byId = new Map<string, Exercise>();
  for (const e of custom) if (!byId.has(e.id)) byId.set(e.id, e);
  return (id) => byId.get(id) ?? builtInExercise(id);
}

/** Placeholder for an exercise id we cannot resolve (e.g. a deleted custom exercise). */
export function fallbackExercise(id: string): Exercise {
  return {
    id,
    name: id,
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'other',
    mechanic: 'isolation',
    trackingType: 'weight_reps',
    isCustom: true,
  };
}

// ───────────── Search ─────────────

const ALIASES: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  bss: 'bulgarian split squat',
  dl: 'deadlift',
  pullup: 'pull up',
  pullups: 'pull up',
  chinup: 'chin up',
  chinups: 'chin up',
  pushup: 'push up',
  pushups: 'push up',
  tri: 'triceps',
  tris: 'triceps',
  bi: 'biceps',
  bis: 'biceps',
  delts: 'delt',
  hammies: 'hamstrings',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function queryTokens(query: string): string[] {
  const out: string[] = [];
  for (const t of normalize(query).split(' ')) {
    if (!t) continue;
    const alias = ALIASES[t];
    if (alias) out.push(...alias.split(' '));
    else out.push(t);
  }
  return out;
}

function haystack(e: Exercise): { name: string; words: string[]; extra: string } {
  const name = normalize(e.name);
  const extra = normalize(
    [e.id, e.equipment, e.primaryMuscle, ...e.secondaryMuscles].join(' ').replace(/_/g, ' '),
  );
  return { name, words: name.split(' '), extra };
}

/** 0 = best. -1 = no match. */
function matchRank(e: Exercise, tokens: string[], rawQuery: string): number {
  if (tokens.length === 0) return 0;
  const h = haystack(e);
  let allInName = true;
  for (const t of tokens) {
    const inName = h.name.includes(t);
    if (!inName) {
      allInName = false;
      if (!h.extra.includes(t)) return -1;
    }
  }
  const q = normalize(rawQuery);
  if (h.name === q) return 0;
  if (q && h.name.startsWith(q)) return 1;
  if (allInName && tokens.every((t) => h.words.some((w) => w.startsWith(t)))) return 2;
  if (allInName) return 3;
  return 4;
}

/** Case-insensitive search by name, optionally filtered. Built-ins + customs, customs first. */
export function searchExercises(
  query: string,
  opts: { muscle?: MuscleGroup; equipment?: Exercise['equipment']; custom?: Exercise[] } = {},
): Exercise[] {
  const tokens = queryTokens(query ?? '');
  const custom = opts.custom ?? [];
  const customIds = new Set(custom.map((e) => e.id));
  const rank = (list: Exercise[]): Exercise[] => {
    const scored: Array<{ e: Exercise; r: number; i: number }> = [];
    list.forEach((e, i) => {
      if (opts.muscle && e.primaryMuscle !== opts.muscle) return;
      if (opts.equipment && e.equipment !== opts.equipment) return;
      const r = matchRank(e, tokens, query ?? '');
      if (r >= 0) scored.push({ e, r, i });
    });
    scored.sort((a, b) => a.r - b.r || a.i - b.i);
    return scored.map((s) => s.e);
  };
  return [...rank(custom), ...rank(EXERCISES.filter((e) => !customIds.has(e.id)))];
}

// ───────────── Alternatives ─────────────

function trackingAffinity(a: Exercise, b: Exercise): number {
  if (a.trackingType === b.trackingType) return 3;
  // Weighted and bodyweight rep work are interchangeable for a swap; timed holds are not.
  if (a.trackingType !== 'duration' && b.trackingType !== 'duration') return 1;
  return -2;
}

function alternativeScore(base: Exercise, cand: Exercise): number {
  let score = 0;
  if (cand.mechanic === base.mechanic) score += 4;
  score += trackingAffinity(base, cand);
  const baseSec = new Set(base.secondaryMuscles);
  let overlap = 0;
  for (const m of cand.secondaryMuscles) if (baseSec.has(m)) overlap++;
  score += Math.min(overlap, 3) * 0.75;
  // A different implement gives a genuinely fresh stimulus for a stalled lift.
  if (cand.equipment !== base.equipment) score += 0.5;
  return score;
}

/** Alternatives for a swap: same primary muscle, similar mechanic, excluding `exerciseId`. Best first. */
export function alternativesFor(exerciseId: string, custom: Exercise[] = [], limit = 5): Exercise[] {
  if (!(limit > 0)) return [];
  const base = getExercise(exerciseId, custom);
  if (!base) return [];
  const customIds = new Set(custom.map((e) => e.id));
  const pool = [...custom, ...EXERCISES.filter((e) => !customIds.has(e.id))].filter((e) => e.id !== exerciseId);

  const primary: Array<{ e: Exercise; s: number; i: number }> = [];
  const secondary: Array<{ e: Exercise; s: number; i: number }> = [];
  pool.forEach((e, i) => {
    if (e.primaryMuscle === base.primaryMuscle) primary.push({ e, s: alternativeScore(base, e), i });
    else if (e.secondaryMuscles.includes(base.primaryMuscle)) secondary.push({ e, s: alternativeScore(base, e), i });
  });
  const byScore = (a: { s: number; i: number }, b: { s: number; i: number }) => b.s - a.s || a.i - b.i;
  primary.sort(byScore);
  secondary.sort(byScore);
  return [...primary, ...secondary].slice(0, Math.floor(limit)).map((x) => x.e);
}
