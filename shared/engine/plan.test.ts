import { describe, expect, it } from 'vitest';
import { TEMPLATES, alternativesFor, buildWeeklyPlan, computeStats, detectPRs, getExercise, nextRoutine } from './index';
import type { PlanInput } from './index';
import type { Routine, Workout } from '../types';
import { item, plusDays, routine, s, sets, workout } from './testkit';
import type { SetSpec } from './testkit';

const NOW = new Date('2026-11-10T12:00:00.000Z'); // Tuesday
const PROFILE: PlanInput['profile'] = { unit: 'kg', goal: 'hypertrophy', experience: 'intermediate', timezone: 'UTC', daysPerWeek: 3 };

function fromTemplate(templateId: string): Routine[] {
  const t = TEMPLATES.find((x) => x.id === templateId)!;
  return t.routines.map((r, i) => routine(`${templateId}-${i}`, r.name, i, r.items));
}
function plan(partial: Partial<PlanInput>): ReturnType<typeof buildWeeklyPlan> {
  return buildWeeklyPlan({ routines: [], workouts: [], customExercises: [], profile: PROFILE, now: NOW, ...partial });
}
const daysAgo = (d: number) => plusDays(NOW.toISOString(), -d);

describe('nextRoutine', () => {
  const A = routine('a', 'A', 0, []);
  const B = routine('b', 'B', 1, []);
  const C = routine('c', 'C', 2, []);
  const scrambled = [C, A, B];

  it('null without routines', () => {
    expect(nextRoutine([], [])).toBeNull();
  });
  it('first by position when nothing was performed', () => {
    expect(nextRoutine(scrambled, [])?.id).toBe('a');
  });
  it('the one after the most recently performed, wrapping', () => {
    const wB = workout(daysAgo(2), [], { routineId: 'b' });
    const wA = workout(daysAgo(4), [], { routineId: 'a' });
    expect(nextRoutine(scrambled, [wA, wB])?.id).toBe('c');
    const wC = workout(daysAgo(1), [], { routineId: 'c' });
    expect(nextRoutine(scrambled, [wB, wC, wA])?.id).toBe('a');
  });
  it('ignores ad-hoc workouts and deleted routines', () => {
    const wA = workout(daysAgo(4), [], { routineId: 'a' });
    const adHoc = workout(daysAgo(1), [], { routineId: null });
    const deleted = workout(daysAgo(2), [], { routineId: 'gone' });
    expect(nextRoutine(scrambled, [wA, adHoc, deleted])?.id).toBe('b');
  });
});

describe('buildWeeklyPlan — structure', () => {
  it('empty input', () => {
    const p = plan({});
    expect(p).toMatchObject({ weekStart: '2026-11-09', generatedAt: NOW.toISOString(), nextRoutineId: null, routines: [], recommendations: [], deloadRecommended: false });
    expect(p.volume).toHaveLength(16);
    expect(p.volume.every((v) => v.sets === 0)).toBe(true);
  });
  it('one plan per routine in position order, one suggestion per item', () => {
    const routines = fromTemplate('upper-lower').reverse();
    const p = plan({ routines });
    expect(p.routines.map((r) => r.routineName)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    for (const rp of p.routines) {
      const r = routines.find((x) => x.id === rp.routineId)!;
      expect(rp.exercises.map((e) => e.exerciseId)).toEqual(r.items.map((i) => i.exerciseId));
      rp.exercises.forEach((e, i) => {
        expect(e.sets).toBe(r.items[i]!.sets);
        expect(e.repsPerSet).toHaveLength(e.sets);
        expect(e.action).toBe('start');
      });
    }
    expect(p.nextRoutineId).toBe('upper-lower-0');
  });
  it('suggestions use history and the rotation advances', () => {
    const routines = fromTemplate('5x5-strength');
    const w = workout(daysAgo(2), [...sets(5, 'barbell-back-squat', 100, 5), ...sets(5, 'barbell-bench-press', 70, 5), ...sets(5, 'barbell-row', 60, 4)], {
      routineId: '5x5-strength-0',
    });
    const p = plan({ routines, workouts: [w] });
    expect(p.nextRoutineId).toBe('5x5-strength-1');
    const a = p.routines[0]!.exercises;
    expect(a[0]).toMatchObject({ exerciseId: 'barbell-back-squat', action: 'increase_weight', weightKg: 105 });
    expect(a[1]).toMatchObject({ exerciseId: 'barbell-bench-press', action: 'increase_weight', weightKg: 72.5 });
    expect(a[2]).toMatchObject({ exerciseId: 'barbell-row', action: 'hold', weightKg: 60 });
    // Squat appears in both routines and gets the same history
    expect(p.routines[1]!.exercises[0]).toMatchObject({ exerciseId: 'barbell-back-squat', weightKg: 105 });
  });
  it('keeps alignment for unknown exercise ids', () => {
    const p = plan({ routines: [routine('r', 'R', 0, [item('deleted-custom', 3, 8, 12), item('leg-press', 3, 8, 12)])] });
    expect(p.routines[0]!.exercises.map((e) => e.exerciseId)).toEqual(['deleted-custom', 'leg-press']);
  });
  it('uses the user timezone for weekStart', () => {
    const now = new Date('2026-11-09T07:30:00.000Z'); // Sunday 23:30 in LA
    expect(plan({ now, profile: { ...PROFILE, timezone: 'America/Los_Angeles' } }).weekStart).toBe('2026-11-02');
    expect(plan({ now }).weekStart).toBe('2026-11-09');
  });
});

describe('buildWeeklyPlan — volume window', () => {
  it('counts only the last 7 days (today included) against targets', () => {
    const recent = workout(daysAgo(3), sets(4, 'barbell-bench-press', 80, 8));
    const today = workout(NOW.toISOString(), sets(2, 'barbell-bench-press', 80, 8));
    const old = workout(daysAgo(8), sets(10, 'barbell-bench-press', 80, 8));
    const p = plan({ workouts: [recent, old, today] });
    const chest = p.volume.find((v) => v.muscle === 'chest')!;
    expect(chest.sets).toBe(6);
    expect(chest.target).toEqual({ min: 10, max: 20 });
    expect(p.volume.find((v) => v.muscle === 'triceps')!.sets).toBe(3);
  });
});

describe('buildWeeklyPlan — recommendations', () => {
  it('adds work for muscles the rotation under-serves, on equipment already used', () => {
    const routines = fromTemplate('5x5-strength');
    const p = plan({ routines, profile: { ...PROFILE, goal: 'strength', experience: 'beginner' } });
    const adds = p.recommendations.filter((r) => r.type === 'add');
    expect(adds.length).toBeGreaterThan(0);
    expect(adds.length).toBeLessThanOrEqual(3);
    const first = adds[0]!;
    const ex = getExercise(first.exerciseId)!;
    expect(ex.primaryMuscle).toBe('hamstrings');
    expect(ex.equipment).toBe('barbell');
    expect(first.routineId).toBe('5x5-strength-1'); // the day with squats + deadlifts
    expect(first.reason).toContain('Hamstrings');
    expect(first.reason).toContain(ex.name);
    const inRoutines = new Set(routines.flatMap((r) => r.items.map((i) => i.exerciseId)));
    for (const r of p.recommendations) {
      expect(r.source).toBe('rules');
      if (r.type === 'add') expect(inRoutines.has(r.exerciseId)).toBe(false);
    }
    expect(new Set(adds.map((a) => a.exerciseId)).size).toBe(adds.length);
  });
  it('a dumbbell-only lifter gets dumbbell additions', () => {
    const routines = [routine('home', 'Home', 0, [item('goblet-squat', 3, 8, 12), item('dumbbell-bench-press', 3, 8, 12), item('dumbbell-curl', 2, 10, 12)])];
    const adds = plan({ routines }).recommendations.filter((r) => r.type === 'add');
    expect(adds).toHaveLength(3);
    for (const a of adds) {
      expect(getExercise(a.exerciseId)!.equipment).toBe('dumbbell');
      expect(a.routineId).toBe('home');
    }
  });
  it('starter programs meet their own volume targets (5×5 is deliberately minimal)', () => {
    for (const t of TEMPLATES) {
      if (t.id === '5x5-strength') continue;
      const p = plan({ routines: fromTemplate(t.id), profile: { ...PROFILE, goal: t.goal, experience: t.level, daysPerWeek: t.daysPerWeek } });
      expect(p.recommendations, t.id).toEqual([]);
    }
  });
  it('without routines, recommendations come from recent training only', () => {
    expect(plan({}).recommendations).toEqual([]);
    const p = plan({ workouts: [workout(daysAgo(1), sets(3, 'barbell-bench-press', 80, 8))] });
    const adds = p.recommendations.filter((r) => r.type === 'add');
    expect(adds.length).toBe(3);
    for (const a of adds) expect(a.routineId).toBeUndefined();
  });
  it('swaps a lift that stalled for 3 sessions', () => {
    const routines = [routine('push', 'Push', 0, [item('barbell-bench-press', 3, 8, 12), item('dumbbell-bench-press', 3, 8, 12)])];
    const workouts = [6, 4, 2].map((d) => workout(daysAgo(d), sets(3, 'barbell-bench-press', 80, 9), { routineId: 'push' }));
    const p = plan({ routines, workouts });
    expect(p.routines[0]!.exercises[0]!.stalled).toBe(true);
    const swap = p.recommendations.find((r) => r.type === 'swap')!;
    expect(swap).toMatchObject({ type: 'swap', exerciseId: 'barbell-bench-press', routineId: 'push', source: 'rules' });
    expect(swap.replacementId).not.toBe('dumbbell-bench-press'); // already in the routine
    expect(alternativesFor('barbell-bench-press', [], 10).map((e) => e.id)).toContain(swap.replacementId);
    expect(['barbell', 'dumbbell']).toContain(getExercise(swap.replacementId!)!.equipment); // equipment already in use
    expect(swap.reason).toContain('Barbell Bench Press');
    expect(p.deloadRecommended).toBe(false);
  });
});

describe('buildWeeklyPlan — deload flag', () => {
  it('recommends a deload when 3+ lifts are stalled', () => {
    const ids = ['barbell-bench-press', 'barbell-back-squat', 'barbell-row'];
    const routines = [routine('r', 'R', 0, ids.map((id) => item(id, 3, 8, 12)))];
    const workouts = [7, 5, 3].map((d) => workout(daysAgo(d), ids.flatMap((id) => sets(3, id, 80, 9))));
    const p = plan({ routines, workouts });
    expect(p.routines[0]!.exercises.every((e) => e.stalled)).toBe(true);
    expect(p.deloadRecommended).toBe(true);
  });
  it('recommends a deload after 6 consecutive hard weeks, not after 5', () => {
    const weeks = (n: number): Workout[] => {
      const out: Workout[] = [];
      for (let w = 1; w <= n; w++) {
        for (const day of [0, 2]) {
          // Monday and Wednesday of each previous week, with a rising weight so nothing stalls
          const start = plusDays('2026-11-09T17:00:00.000Z', -7 * w + day);
          out.push(workout(start, [s('barbell-bench-press', 60 + (n - w) * 5 + day, 8)] as SetSpec[]));
        }
      }
      return out;
    };
    expect(plan({ workouts: weeks(6) }).deloadRecommended).toBe(true);
    expect(plan({ workouts: weeks(5) }).deloadRecommended).toBe(false);
    // A light week (one workout) breaks the run
    const broken = weeks(7).filter((w) => !w.startedAt.startsWith('2026-10-21'));
    expect(plan({ workouts: broken }).deloadRecommended).toBe(false);
  });
});

describe('performance', () => {
  it('handles 1,000 workouts × 25 sets comfortably', () => {
    const ids = ['barbell-bench-press', 'barbell-back-squat', 'barbell-row', 'overhead-press', 'pull-up'];
    const workouts: Workout[] = [];
    for (let i = 0; i < 1000; i++) {
      const specs: SetSpec[] = [];
      for (const id of ids) {
        for (let k = 0; k < 5; k++) specs.push(s(id, id === 'pull-up' ? null : 40 + ((i * 7 + k) % 60), 5 + ((i + k) % 8), { rpe: 7 + (k % 3) }));
      }
      workouts.push(workout(plusDays('2023-01-01T18:00:00.000Z', i), specs));
    }
    const routines = fromTemplate('ppl');
    const t0 = performance.now();
    const p = buildWeeklyPlan({ routines, workouts, customExercises: [], profile: PROFILE, now: NOW });
    const st = computeStats(workouts, PROFILE, NOW);
    const prs = detectPRs(workouts[999]!, workouts.slice(0, 999));
    const ms = performance.now() - t0;
    expect(p.routines).toHaveLength(6);
    expect(st.totalWorkouts).toBe(1000);
    expect(Array.isArray(prs)).toBe(true);
    expect(ms).toBeLessThan(3000);
  });
});
