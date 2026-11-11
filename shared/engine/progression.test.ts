import { describe, expect, it } from 'vitest';
import { formatWeight, getExercise, kgToUnit, suggestNext, unitToKg } from './index';
import type { SuggestInput } from './index';
import type { Exercise, ExerciseSession, User } from '../types';
import { plusDays, s, session, sets } from './testkit';
import type { SetSpec } from './testkit';

type Profile = Pick<User, 'unit' | 'goal' | 'experience'>;
const KG: Profile = { unit: 'kg', goal: 'hypertrophy', experience: 'intermediate' };
const LB: Profile = { ...KG, unit: 'lb' };
const BEGINNER: Profile = { ...KG, experience: 'beginner' };

const ex = (id: string): Exercise => {
  const e = getExercise(id);
  if (!e) throw new Error(`missing ${id}`);
  return e;
};
const BENCH = ex('barbell-bench-press');
const SQUAT = ex('barbell-back-squat');
const CURL = ex('barbell-curl');
const DB_BENCH = ex('dumbbell-bench-press');
const PULLUP = ex('pull-up');
const BAND = ex('band-pull-apart');
const PLANK = ex('plank');
const CARRY = ex('farmers-carry');
const HANG = ex('dead-hang');

const NOW = '2026-11-09T18:00:00.000Z';
/** Sessions given most recent first; dated two days apart going back from NOW. */
function hist(...sessions: SetSpec[][]): ExerciseSession[] {
  return sessions.map((specs, i) => session(plusDays(NOW, -2 * i), specs));
}
const lb = (v: number) => unitToKg(v, 'lb');

function run(exercise: Exercise, item: SuggestInput['item'], history: ExerciseSession[], profile: Profile = KG) {
  return suggestNext({ exercise, item, history, profile });
}
const R3x8_12 = { sets: 3, repMin: 8, repMax: 12 };

describe('suggestNext — start', () => {
  it('no history → start at repMin with a reps-in-reserve hint', () => {
    const r = run(BENCH, R3x8_12, []);
    expect(r).toMatchObject({
      exerciseId: 'barbell-bench-press',
      action: 'start',
      sets: 3,
      weightKg: null,
      repsPerSet: [8, 8, 8],
      repMin: 8,
      repMax: 12,
      lastPerformance: null,
      e1rmKg: null,
      stalled: false,
    });
    expect(r.reason).toMatch(/reps? in reserve/);
  });
  it('history with only warm-ups / incomplete sets is still a start', () => {
    const h = hist([s('barbell-bench-press', 60, 10, { kind: 'warmup' }), s('barbell-bench-press', 60, 10, { done: false })]);
    expect(run(BENCH, R3x8_12, h).action).toBe('start');
  });
  it('duration and bodyweight starts use seconds / reps', () => {
    const p = run(PLANK, { sets: 3, repMin: 30, repMax: 60 }, []);
    expect(p.repsPerSet).toEqual([30, 30, 30]);
    expect(p.reason).toContain('30 s');
    expect(run(PULLUP, { sets: 3, repMin: 6, repMax: 10 }, []).repsPerSet).toEqual([6, 6, 6]);
  });
});

describe('suggestNext — increase_weight', () => {
  it('all sets at repMax → +1 increment, reps reset to repMin', () => {
    const r = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 60, 12)));
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBe(62.5);
    expect(r.repsPerSet).toEqual([8, 8, 8]);
    expect(r.reason).toBe('Hit 3×12 at 60 kg — add 2.5 kg, aim for 3×8.');
    expect(r.e1rmKg).toBeCloseTo(84, 6);
    expect(r.lastPerformance?.sets).toEqual(Array(3).fill({ weightKg: 60, reps: 12, durationSec: null, rpe: null }));
    expect(r.lastPerformance?.date).toBe(new Date(NOW).toISOString());
  });
  it('lower-body barbell compounds jump 5 kg', () => {
    const r = run(SQUAT, { sets: 5, repMin: 5, repMax: 5 }, hist(sets(5, 'barbell-back-squat', 100, 5)));
    expect(r.weightKg).toBe(105);
    expect(r.repsPerSet).toEqual([5, 5, 5, 5, 5]);
  });
  it('all RPE ≤ 7 → two increments', () => {
    const r = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 60, 12, { rpe: 7 })));
    expect(r.weightKg).toBe(65);
    expect(r.reason).toContain('add 5 kg');
    expect(r.reason).toContain('RPE 7');
    // Only some sets rated, all ≤ 7 → still two increments
    const partial = hist([s('barbell-bench-press', 60, 12), s('barbell-bench-press', 60, 12), s('barbell-bench-press', 60, 12, { rpe: 6.5 })]);
    expect(run(BENCH, R3x8_12, partial).weightKg).toBe(65);
  });
  it('RPE 9 still progresses one increment', () => {
    const r = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 60, 12, { rpe: 9 })));
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBe(62.5);
  });
  it('RPE above 9 at repMax → hold the weight', () => {
    const r = run(BENCH, R3x8_12, hist([...sets(2, 'barbell-bench-press', 60, 12, { rpe: 9 }), s('barbell-bench-press', 60, 12, { rpe: 10 })]));
    expect(r.action).toBe('hold');
    expect(r.weightKg).toBe(60);
    expect(r.repsPerSet).toEqual([12, 12, 12]);
    expect(r.reason).toContain('RPE 10');
  });
  it('dumbbells progress by 2 kg and stay loadable', () => {
    expect(run(DB_BENCH, R3x8_12, hist(sets(3, 'dumbbell-bench-press', 22, 12))).weightKg).toBe(24);
    expect(run(DB_BENCH, R3x8_12, hist(sets(3, 'dumbbell-bench-press', 22.5, 12))).weightKg).toBe(24);
  });
  it('uses the top weight when sets were not all at the same load', () => {
    const r = run(BENCH, R3x8_12, hist([...sets(2, 'barbell-bench-press', 60, 12), s('barbell-bench-press', 55, 12)]));
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBe(62.5);
    expect(r.reason).toContain('top set 60 kg');
  });
});

describe('suggestNext — lb users get clean lb numbers', () => {
  const isMultiple = (kg: number, step: number) => {
    const v = kgToUnit(kg, 'lb') / step;
    return Math.abs(v - Math.round(v)) < 1e-9;
  };
  it('225 lb → 230 lb on the bench', () => {
    const r = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', lb(225), 12)), LB);
    expect(formatWeight(r.weightKg, 'lb')).toBe('230 lb');
    expect(isMultiple(r.weightKg!, 5)).toBe(true);
    expect(r.reason).toBe('Hit 3×12 at 225 lb — add 5 lb, aim for 3×8.');
  });
  it('lower-body lb increment is 10 lb', () => {
    const r = run(SQUAT, { sets: 5, repMin: 5, repMax: 5 }, hist(sets(5, 'barbell-back-squat', lb(225), 5)), LB);
    expect(formatWeight(r.weightKg, 'lb')).toBe('235 lb');
  });
  it('snaps odd or kg-logged weights to the lb step', () => {
    const odd = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', lb(227.5), 12)), LB);
    expect(isMultiple(odd.weightKg!, 5)).toBe(true);
    expect(kgToUnit(odd.weightKg!, 'lb')).toBeGreaterThan(227.5);
    // Logged in kg (100 kg = 220.46 lb), user now on lb
    const inc = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 100, 12)), LB);
    expect(formatWeight(inc.weightKg, 'lb')).toBe('225 lb');
    const reps = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 100, 10)), LB);
    expect(reps.action).toBe('increase_reps');
    expect(formatWeight(reps.weightKg, 'lb')).toBe('220 lb');
    expect(reps.reason).toContain('use 220 lb');
  });
  it('lb deloads land on the lb step', () => {
    const h = hist(sets(3, 'barbell-bench-press', lb(225), 6), sets(3, 'barbell-bench-press', lb(225), 6));
    const r = run(BENCH, R3x8_12, h, LB);
    expect(r.action).toBe('deload');
    expect(isMultiple(r.weightKg!, 5)).toBe(true);
    expect(formatWeight(r.weightKg, 'lb')).toBe('205 lb');
  });
  it('keeps an already-clean logged weight exactly', () => {
    const r = run(DB_BENCH, R3x8_12, hist(sets(3, 'dumbbell-bench-press', 22.5, 10)));
    expect(r.weightKg).toBe(22.5);
  });
});

describe('suggestNext — beginner linear progression', () => {
  const at8 = hist(sets(3, 'barbell-bench-press', 60, 8, { rpe: 8 }));
  it('beginner + compound + all sets ≥ repMin at RPE ≤ 8 → add weight', () => {
    const r = run(BENCH, R3x8_12, at8, BEGINNER);
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBe(62.5);
    expect(r.repsPerSet).toEqual([8, 8, 8]);
    expect(r.reason).toContain('beginner');
    const squat = run(SQUAT, { sets: 3, repMin: 5, repMax: 8 }, hist(sets(3, 'barbell-back-squat', 80, 5, { rpe: 7.5 })), BEGINNER);
    expect(squat.weightKg).toBe(85);
  });
  it('does not apply to intermediates, isolation lifts, missing RPE, or RPE > 8', () => {
    expect(run(BENCH, R3x8_12, at8, KG).action).toBe('increase_reps');
    expect(run(CURL, R3x8_12, hist(sets(3, 'barbell-curl', 30, 8, { rpe: 8 })), BEGINNER).action).toBe('increase_reps');
    expect(run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 60, 8)), BEGINNER).action).toBe('increase_reps');
    expect(run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 60, 8, { rpe: 8.5 })), BEGINNER).action).toBe('increase_reps');
  });
});

describe('suggestNext — increase_reps', () => {
  it('within range → same weight, +1 on the weakest sets', () => {
    const r = run(BENCH, R3x8_12, hist([s('barbell-bench-press', 60, 10), s('barbell-bench-press', 60, 9), s('barbell-bench-press', 60, 8)]));
    expect(r.action).toBe('increase_reps');
    expect(r.weightKg).toBe(60);
    expect(r.repsPerSet).toEqual([10, 10, 9]);
    expect(r.reason).toBe('10/9/8 at 60 kg — keep 60 kg, aim for 10/10/9.');
  });
  it('equal sets → +1 on every set', () => {
    expect(run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 60, 10))).repsPerSet).toEqual([11, 11, 11]);
  });
  it('caps at repMax', () => {
    const r = run(BENCH, R3x8_12, hist([s('barbell-bench-press', 60, 12), s('barbell-bench-press', 60, 12), s('barbell-bench-press', 60, 11)]));
    expect(r.repsPerSet).toEqual([12, 12, 12]);
  });
  it('one set below repMin is not "most sets"', () => {
    const r = run(BENCH, R3x8_12, hist([s('barbell-bench-press', 60, 9), s('barbell-bench-press', 60, 8), s('barbell-bench-press', 60, 6)]));
    expect(r.action).toBe('increase_reps');
    expect(r.repsPerSet).toEqual([9, 9, 7]);
  });
  it('more planned sets than logged → extra sets start at repMin', () => {
    const r = run(BENCH, { sets: 4, repMin: 8, repMax: 12 }, hist(sets(3, 'barbell-bench-press', 60, 10)));
    expect(r.repsPerSet).toEqual([10, 10, 10, 9]);
    expect(r.sets).toBe(4);
  });
  it('failure sets count, drop sets do not', () => {
    const failure = hist([...sets(2, 'barbell-bench-press', 60, 12), s('barbell-bench-press', 60, 10, { kind: 'failure' })]);
    expect(run(BENCH, R3x8_12, failure).action).toBe('increase_reps');
    const drop = hist([...sets(3, 'barbell-bench-press', 60, 12), s('barbell-bench-press', 40, 8, { kind: 'drop' })]);
    expect(run(BENCH, R3x8_12, drop).weightKg).toBe(62.5);
  });
  it('warm-ups and incomplete sets are ignored', () => {
    const h = hist([
      s('barbell-bench-press', 20, 10, { kind: 'warmup' }),
      s('barbell-bench-press', 100, 3, { kind: 'warmup' }),
      ...sets(3, 'barbell-bench-press', 60, 12),
      s('barbell-bench-press', 60, 4, { done: false }),
    ]);
    const r = run(BENCH, R3x8_12, h);
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBe(62.5);
    expect(r.lastPerformance?.sets).toHaveLength(3);
  });
});

describe('suggestNext — hold & deload', () => {
  it('below repMin on most sets for the first time → hold', () => {
    const r = run(BENCH, R3x8_12, hist([s('barbell-bench-press', 100, 8), s('barbell-bench-press', 100, 7), s('barbell-bench-press', 100, 7)], sets(3, 'barbell-bench-press', 97.5, 9)));
    expect(r.action).toBe('hold');
    expect(r.weightKg).toBe(100);
    expect(r.repsPerSet).toEqual([8, 8, 8]);
    expect(r.reason).toBe('Missed 8 reps on 2 of 3 sets at 100 kg — stay at 100 kg and aim for 3×8.');
  });
  it('two sessions in a row below repMin → deload to ~90%', () => {
    const r = run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 100, 6), sets(3, 'barbell-bench-press', 100, 7)));
    expect(r.action).toBe('deload');
    expect(r.weightKg).toBe(90);
    expect(r.repsPerSet).toEqual([8, 8, 8]);
    expect(r.reason).toBe('Below 8 reps two sessions running at 100 kg — deload to 90 kg, aim for 3×8 and rebuild.');
  });
  it('stalled for 3 sessions and now below repMin → deload', () => {
    const h = hist(
      [s('barbell-bench-press', 100, 8), s('barbell-bench-press', 100, 7), s('barbell-bench-press', 100, 7)],
      sets(3, 'barbell-bench-press', 100, 8),
      sets(3, 'barbell-bench-press', 100, 8),
    );
    const r = run(BENCH, R3x8_12, h);
    expect(r.stalled).toBe(true);
    expect(r.action).toBe('deload');
    expect(r.weightKg).toBe(90);
    expect(r.reason).toMatch(/^No progress in 3 sessions/);
  });
  it('deload is always at least one increment lighter', () => {
    const r = run(ex('dumbbell-lateral-raise'), { sets: 3, repMin: 12, repMax: 15 }, hist(sets(3, 'dumbbell-lateral-raise', 10, 9), sets(3, 'dumbbell-lateral-raise', 10, 9)));
    expect(r.action).toBe('deload');
    expect(r.weightKg).toBe(8);
  });
});

describe('suggestNext — stall detection', () => {
  it('three flat sessions → stalled (but still progresses reps if in range)', () => {
    const h = hist(sets(3, 'barbell-bench-press', 80, 9), sets(3, 'barbell-bench-press', 80, 9), sets(3, 'barbell-bench-press', 80, 9));
    const r = run(BENCH, R3x8_12, h);
    expect(r.stalled).toBe(true);
    expect(r.action).toBe('increase_reps');
  });
  it('needs at least 3 sessions', () => {
    expect(run(BENCH, R3x8_12, hist(sets(3, 'barbell-bench-press', 80, 9), sets(3, 'barbell-bench-press', 80, 9))).stalled).toBe(false);
  });
  it('a weight increase is progress even if e1RM dipped', () => {
    const h = hist(sets(3, 'barbell-bench-press', 62.5, 8), sets(3, 'barbell-bench-press', 62.5, 8), sets(3, 'barbell-bench-press', 60, 12));
    expect(run(BENCH, R3x8_12, h).stalled).toBe(false);
  });
  it('extra reps on back-off sets count as progress', () => {
    const h = hist(
      [s('barbell-bench-press', 80, 10), s('barbell-bench-press', 80, 10), s('barbell-bench-press', 80, 9)],
      [s('barbell-bench-press', 80, 10), s('barbell-bench-press', 80, 9), s('barbell-bench-press', 80, 9)],
      [s('barbell-bench-press', 80, 10), s('barbell-bench-press', 80, 9), s('barbell-bench-press', 80, 8)],
    );
    expect(run(BENCH, R3x8_12, h).stalled).toBe(false);
  });
  it('a deload starts a fresh window', () => {
    const h = hist(sets(3, 'barbell-bench-press', 90, 8), sets(3, 'barbell-bench-press', 100, 6), sets(3, 'barbell-bench-press', 100, 7));
    const r = run(BENCH, R3x8_12, h);
    expect(r.stalled).toBe(false);
    expect(r.action).toBe('increase_reps');
  });
  it('uses the most recent session even if history arrives unsorted', () => {
    const recent = session(NOW, sets(3, 'barbell-bench-press', 60, 12));
    const older = session(plusDays(NOW, -5), sets(3, 'barbell-bench-press', 50, 8));
    expect(run(BENCH, R3x8_12, [older, recent]).weightKg).toBe(62.5);
  });
});

describe('suggestNext — bodyweight_reps', () => {
  const R = { sets: 3, repMin: 6, repMax: 10 };
  it('reps to repMax at bodyweight → suggest +2.5 kg', () => {
    const r = run(PULLUP, R, hist(sets(3, 'pull-up', null, 10)));
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBe(2.5);
    expect(r.repsPerSet).toEqual([6, 6, 6]);
    expect(r.reason).toBe('Hit 3×10 at bodyweight — add 2.5 kg (belt or vest), aim for 3×6.');
    expect(r.e1rmKg).toBeNull();
  });
  it('lb users get +5 lb', () => {
    const r = run(PULLUP, R, hist(sets(3, 'pull-up', 0, 10)), LB);
    expect(formatWeight(r.weightKg, 'lb')).toBe('5 lb');
  });
  it('adds on top of existing added weight', () => {
    const r = run(PULLUP, R, hist(sets(3, 'pull-up', 10, 10)));
    expect(r.weightKg).toBe(12.5);
    expect(r.reason).toBe('Hit 3×10 at +10 kg — add 2.5 kg, aim for 3×6.');
  });
  it('within range → more reps, no weight', () => {
    const r = run(PULLUP, R, hist([s('pull-up', null, 8), s('pull-up', null, 7), s('pull-up', null, 6)]));
    expect(r.action).toBe('increase_reps');
    expect(r.weightKg).toBeNull();
    expect(r.repsPerSet).toEqual([8, 8, 7]);
  });
  it('below repMin → hold, then deload', () => {
    const once = run(PULLUP, R, hist(sets(3, 'pull-up', 10, 4)));
    expect(once.action).toBe('hold');
    expect(once.weightKg).toBe(10);
    const twiceLoaded = run(PULLUP, R, hist(sets(3, 'pull-up', 10, 4), sets(3, 'pull-up', 10, 5)));
    expect(twiceLoaded.action).toBe('deload');
    expect(twiceLoaded.weightKg).toBe(5);
    const twiceBw = run(PULLUP, R, hist(sets(3, 'pull-up', null, 4), sets(3, 'pull-up', null, 5)));
    expect(twiceBw.action).toBe('deload');
    expect(twiceBw.weightKg).toBeNull();
    expect(twiceBw.repsPerSet).toEqual([4, 4, 4]);
  });
  it('bands progress by switching band, not by kg', () => {
    const r = run(BAND, { sets: 3, repMin: 15, repMax: 20 }, hist(sets(3, 'band-pull-apart', null, 20)));
    expect(r.action).toBe('increase_weight');
    expect(r.weightKg).toBeNull();
    expect(r.reason).toContain('heavier band');
  });
});

describe('suggestNext — duration', () => {
  const R = { sets: 3, repMin: 30, repMax: 60 };
  const hold = (...secs: number[]) => secs.map((sec) => s('plank', null, null, { sec }));
  it('+5 s per set up to repMax', () => {
    const r = run(PLANK, R, hist(hold(40, 40, 35)));
    expect(r.action).toBe('increase_duration');
    expect(r.repsPerSet).toEqual([45, 45, 40]);
    expect(r.weightKg).toBeNull();
    expect(r.reason).toBe('Held 40/40/35 s — add 5 s, aim for 45/45/40 s.');
  });
  it('caps at repMax and fills missing sets from repMin', () => {
    expect(run(PLANK, R, hist(hold(58, 60, 55))).repsPerSet).toEqual([60, 60, 60]);
    expect(run(PLANK, { ...R, sets: 4 }, hist(hold(40, 40, 40))).repsPerSet).toEqual([45, 45, 45, 30]);
  });
  it('long holds step by 10 s', () => {
    expect(run(HANG, { sets: 2, repMin: 30, repMax: 120 }, hist([s('dead-hang', null, null, { sec: 60 }), s('dead-hang', null, null, { sec: 50 })])).repsPerSet).toEqual([70, 60]);
  });
  it('at repMax → suggest a harder variation', () => {
    const r = run(PLANK, R, hist(hold(60, 60, 65)));
    expect(r.action).toBe('hold');
    expect(r.repsPerSet).toEqual([60, 60, 60]);
    expect(r.reason).toContain('harder variation');
  });
  it('loaded carries add weight once the time target is hit', () => {
    const carry = (sec: number, kg: number) => sets(3, 'farmers-carry', kg, null, { sec });
    const up = run(CARRY, R, hist(carry(60, 32)));
    expect(up.action).toBe('increase_weight');
    expect(up.weightKg).toBe(34);
    expect(up.repsPerSet).toEqual([30, 30, 30]);
    const more = run(CARRY, R, hist(carry(40, 32)));
    expect(more.action).toBe('increase_duration');
    expect(more.weightKg).toBe(32);
  });
});

describe('suggestNext — invariants', () => {
  it('repsPerSet.length === sets for every branch', () => {
    const scenarios: Array<[Exercise, SuggestInput['item'], ExerciseSession[]]> = [
      [BENCH, { sets: 5, repMin: 5, repMax: 5 }, []],
      [BENCH, { sets: 4, repMin: 8, repMax: 12 }, hist(sets(2, 'barbell-bench-press', 60, 12))],
      [BENCH, { sets: 2, repMin: 8, repMax: 12 }, hist(sets(5, 'barbell-bench-press', 60, 10))],
      [BENCH, { sets: 6, repMin: 8, repMax: 12 }, hist(sets(3, 'barbell-bench-press', 60, 6), sets(3, 'barbell-bench-press', 60, 6))],
      [PULLUP, { sets: 1, repMin: 5, repMax: 8 }, hist(sets(4, 'pull-up', null, 7))],
      [PLANK, { sets: 5, repMin: 20, repMax: 40 }, hist([s('plank', null, null, { sec: 30 })])],
    ];
    for (const [e, it, h] of scenarios) {
      const r = run(e, it, h);
      expect(r.repsPerSet).toHaveLength(r.sets);
      expect(r.sets).toBe(it.sets);
      for (const reps of r.repsPerSet) expect(Number.isInteger(reps) && reps >= 1).toBe(true);
    }
  });
  it('normalises bad items', () => {
    const r = run(BENCH, { sets: 0, repMin: 12, repMax: 8 }, []);
    expect(r.sets).toBe(1);
    expect(r.repMin).toBe(8);
    expect(r.repMax).toBe(12);
    expect(r.repsPerSet).toEqual([8]);
  });
  it('is deterministic', () => {
    const h = hist(sets(3, 'barbell-bench-press', 60, 10), sets(3, 'barbell-bench-press', 60, 9));
    expect(run(BENCH, R3x8_12, h)).toEqual(run(BENCH, R3x8_12, h));
  });
});
