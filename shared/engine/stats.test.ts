import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeStats,
  detectPRs,
  exerciseHistory,
  muscleVolume,
  sessionsFor,
  volumeTargets,
  workoutVolumeKg,
} from './index';
import { MUSCLE_GROUPS } from '../types';
import type { Exercise, PersonalRecord, User } from '../types';
import { s, sets, workout } from './testkit';

const types = (prs: PersonalRecord[]) => prs.map((p) => p.type).sort();
const BENCH = 'barbell-bench-press';

describe('workoutVolumeKg', () => {
  it('sums weight × reps over completed non-warm-up sets only', () => {
    const w = workout('2026-11-09T18:00:00Z', [
      s(BENCH, 60, 5, { kind: 'warmup' }),
      ...sets(3, BENCH, 100, 5),
      s(BENCH, 80, 8, { kind: 'drop' }),
      s(BENCH, 100, 5, { done: false }),
      s('pull-up', null, 10),
    ]);
    expect(workoutVolumeKg(w)).toBe(1500 + 640);
  });
});

describe('sessionsFor', () => {
  it('groups counted sets per workout, most recent first', () => {
    const a = workout('2026-11-01T18:00:00Z', [...sets(2, BENCH, 90, 5), s('pull-up', null, 8)]);
    const b = workout('2026-11-05T18:00:00Z', [s(BENCH, 40, 5, { kind: 'warmup' }), s(BENCH, 95, 5), s(BENCH, 95, 4, { kind: 'failure' })]);
    const c = workout('2026-11-03T18:00:00Z', [s('pull-up', null, 8)]);
    const d = workout('2026-11-07T18:00:00Z', [s(BENCH, 100, 5, { done: false })]);
    const out = sessionsFor(BENCH, [a, b, c, d]);
    expect(out.map((x) => x.workoutId)).toEqual([b.id, a.id]);
    expect(out[0]!.sets.map((x) => x.reps)).toEqual([5, 4]);
    expect(out[0]!.date).toBe(b.startedAt);
  });
});

describe('detectPRs', () => {
  const w1 = workout('2026-10-01T18:00:00Z', sets(3, BENCH, 100, 5));

  it('returns nothing for the first-ever session of an exercise', () => {
    expect(detectPRs(w1, [])).toEqual([]);
  });
  it('detects weight, e1RM and volume PRs', () => {
    const w2 = workout('2026-10-03T18:00:00Z', sets(3, BENCH, 102.5, 5));
    const prs = detectPRs(w2, [w1]);
    expect(types(prs)).toEqual(['e1rm', 'volume', 'weight']);
    const weight = prs.find((p) => p.type === 'weight')!;
    expect(weight).toMatchObject({ exerciseId: BENCH, value: 102.5, weightKg: 102.5, reps: 5, workoutId: w2.id, date: w2.startedAt });
    expect(prs.find((p) => p.type === 'e1rm')!.value).toBeCloseTo(119.58, 2);
    expect(prs.find((p) => p.type === 'volume')!.value).toBe(1537.5);
  });
  it('detects a reps-at-weight PR', () => {
    const w3 = workout('2026-10-03T18:00:00Z', [s(BENCH, 100, 7), ...sets(2, BENCH, 100, 5)]);
    const prs = detectPRs(w3, [w1]);
    expect(prs.find((p) => p.type === 'reps')).toMatchObject({ value: 7, weightKg: 100, reps: 7 });
    expect(types(prs)).toEqual(['e1rm', 'reps', 'volume']);
  });
  it('no reps PR when a heavier set already had as many reps', () => {
    const heavy = workout('2026-10-01T18:00:00Z', sets(3, BENCH, 110, 6));
    const lighter = workout('2026-10-03T18:00:00Z', [s(BENCH, 100, 6)]);
    expect(detectPRs(lighter, [heavy])).toEqual([]);
  });
  it('ignores warm-ups and incomplete sets on both sides', () => {
    const prior = workout('2026-10-01T18:00:00Z', [s(BENCH, 140, 1, { kind: 'warmup' }), ...sets(3, BENCH, 100, 5)]);
    const now = workout('2026-10-03T18:00:00Z', [s(BENCH, 150, 1, { kind: 'warmup' }), s(BENCH, 160, 1, { done: false }), s(BENCH, 120, 1)]);
    const prs = detectPRs(now, [prior]);
    expect(prs.find((p) => p.type === 'weight')).toMatchObject({ value: 120 });
    expect(prs.find((p) => p.type === 'e1rm')).toMatchObject({ value: 120 });
  });
  it('drop sets count', () => {
    const prior = workout('2026-10-01T18:00:00Z', sets(3, BENCH, 60, 10));
    const now = workout('2026-10-03T18:00:00Z', [s(BENCH, 50, 8), s(BENCH, 60, 12, { kind: 'drop' })]);
    expect(detectPRs(now, [prior]).find((p) => p.type === 'reps')).toMatchObject({ value: 12, weightKg: 60 });
  });
  it('only reports exercises that have prior history', () => {
    const now = workout('2026-10-03T18:00:00Z', [...sets(3, BENCH, 105, 5), ...sets(3, 'barbell-row', 80, 8)]);
    const prs = detectPRs(now, [w1]);
    expect(prs.length).toBeGreaterThan(0);
    expect(prs.every((p) => p.exerciseId === BENCH)).toBe(true);
  });
  it('only compares against workouts that happened earlier', () => {
    const later = workout('2026-12-01T18:00:00Z', sets(3, BENCH, 150, 5));
    const w2 = workout('2026-10-03T18:00:00Z', sets(3, BENCH, 102.5, 5));
    expect(types(detectPRs(w2, [w1, later, w2]))).toEqual(['e1rm', 'volume', 'weight']);
  });
  it('duration PRs for timed holds', () => {
    const p1 = workout('2026-10-01T18:00:00Z', [s('plank', null, null, { sec: 60 })]);
    const p2 = workout('2026-10-03T18:00:00Z', [s('plank', null, null, { sec: 75 }), s('plank', null, null, { sec: 50 })]);
    expect(detectPRs(p2, [p1])).toEqual([
      { exerciseId: 'plank', type: 'duration', value: 75, weightKg: null, reps: null, date: p2.startedAt, workoutId: p2.id },
    ]);
  });
  it('bodyweight exercises: reps and added-weight PRs, no e1RM / volume', () => {
    const b1 = workout('2026-10-01T18:00:00Z', sets(3, 'pull-up', null, 8));
    const b2 = workout('2026-10-03T18:00:00Z', [s('pull-up', null, 10), ...sets(2, 'pull-up', null, 8)]);
    expect(detectPRs(b2, [b1])).toEqual([expect.objectContaining({ type: 'reps', value: 10, weightKg: null, reps: 10 })]);
    const b3 = workout('2026-10-05T18:00:00Z', sets(3, 'pull-up', 5, 6));
    expect(types(detectPRs(b3, [b1, b2]))).toEqual(['weight']);
  });
  it('custom exercises are resolved for tracking type', () => {
    const custom: Exercise = {
      id: 'custom-hold', name: 'Wall Sit', primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'bodyweight',
      mechanic: 'isolation', trackingType: 'duration', isCustom: true,
    };
    const c1 = workout('2026-10-01T18:00:00Z', [s('custom-hold', null, null, { sec: 45 })]);
    const c2 = workout('2026-10-03T18:00:00Z', [s('custom-hold', null, null, { sec: 50 })]);
    expect(types(detectPRs(c2, [c1], [custom]))).toEqual(['duration']);
  });
});

describe('exerciseHistory', () => {
  const w1 = workout('2026-10-01T18:00:00Z', sets(3, BENCH, 100, 5));
  const w2 = workout('2026-10-03T18:00:00Z', sets(3, BENCH, 102.5, 5));
  const w3 = workout('2026-10-05T18:00:00Z', [s(BENCH, 60, 10, { kind: 'warmup' }), s(BENCH, 100, 7), ...sets(2, BENCH, 100, 5)]);

  it('lists sessions most recent first with top set, e1RM and volume', () => {
    const h = exerciseHistory(BENCH, [w1, w3, w2]);
    expect(h.exerciseId).toBe(BENCH);
    expect(h.sessions.map((x) => x.workoutId)).toEqual([w3.id, w2.id, w1.id]);
    expect(h.sessions[0]!.topSet).toEqual({ weightKg: 100, reps: 7, durationSec: null });
    expect(h.sessions[0]!.e1rmKg).toBeCloseTo(123.33, 2);
    expect(h.sessions[0]!.volumeKg).toBe(1700);
    expect(h.sessions[0]!.sets).toHaveLength(3);
  });
  it('returns current all-time records including a rep-max table', () => {
    const { prs } = exerciseHistory(BENCH, [w1, w2, w3]);
    expect(prs.find((p) => p.type === 'e1rm')).toMatchObject({ workoutId: w3.id, weightKg: 100, reps: 7 });
    expect(prs.find((p) => p.type === 'weight')).toMatchObject({ value: 102.5, workoutId: w2.id });
    expect(prs.find((p) => p.type === 'volume')).toMatchObject({ value: 1700, workoutId: w3.id });
    expect(prs.filter((p) => p.type === 'reps').map((p) => [p.weightKg, p.value])).toEqual([
      [102.5, 5],
      [100, 7],
    ]);
  });
  it('handles timed and bodyweight exercises', () => {
    const h = exerciseHistory('plank', [workout('2026-10-01T18:00:00Z', [s('plank', null, null, { sec: 40 }), s('plank', null, null, { sec: 55 })])]);
    expect(h.sessions[0]!.topSet).toEqual({ weightKg: null, reps: null, durationSec: 55 });
    expect(h.sessions[0]!.e1rmKg).toBeNull();
    expect(h.prs).toEqual([expect.objectContaining({ type: 'duration', value: 55 })]);
    const p = exerciseHistory('pull-up', [workout('2026-10-01T18:00:00Z', sets(3, 'pull-up', 10, 6))]);
    expect(p.sessions[0]!.e1rmKg).toBeNull();
    expect(p.prs.map((x) => x.type)).toEqual(['weight', 'reps']);
  });
  it('is empty for an exercise never performed', () => {
    expect(exerciseHistory('leg-press', [w1])).toEqual({ exerciseId: 'leg-press', sessions: [], prs: [] });
  });
});

describe('volumeTargets', () => {
  it('follows SPEC §6 for the main movers', () => {
    expect(volumeTargets('hypertrophy', 'intermediate').chest).toEqual({ min: 10, max: 20 });
    expect(volumeTargets('hypertrophy', 'beginner').quads).toEqual({ min: 8, max: 14 });
    expect(volumeTargets('strength', 'intermediate').quads).toEqual({ min: 6, max: 12 });
    expect(volumeTargets('general', 'intermediate').lats).toEqual({ min: 6, max: 12 });
  });
  it('covers every muscle with min ≤ max for every goal/experience', () => {
    for (const g of ['strength', 'hypertrophy', 'general'] as const) {
      for (const e of ['beginner', 'intermediate', 'advanced'] as const) {
        const t = volumeTargets(g, e);
        expect(Object.keys(t).sort()).toEqual([...MUSCLE_GROUPS].sort());
        for (const m of MUSCLE_GROUPS) {
          expect(t[m].min).toBeGreaterThan(0);
          expect(t[m].min).toBeLessThanOrEqual(t[m].max);
        }
      }
    }
  });
});

describe('muscleVolume', () => {
  it('counts primary 1 and secondary 0.5 for completed hard sets only', () => {
    const w = workout('2026-11-09T18:00:00Z', [
      s(BENCH, 40, 10, { kind: 'warmup' }),
      ...sets(3, BENCH, 100, 5),
      s(BENCH, 100, 5, { done: false }),
      ...sets(2, 'pull-up', null, 8),
      s('mystery-exercise', 50, 10),
    ]);
    const mv = muscleVolume([w], { goal: 'hypertrophy', experience: 'intermediate' });
    expect(mv.map((x) => x.muscle)).toEqual([...MUSCLE_GROUPS]);
    const get = (m: string) => mv.find((x) => x.muscle === m)!;
    expect(get('chest').sets).toBe(3);
    expect(get('triceps').sets).toBe(1.5);
    expect(get('shoulders').sets).toBe(1.5);
    expect(get('lats').sets).toBe(2);
    expect(get('biceps').sets).toBe(1);
    expect(get('quads').sets).toBe(0);
    expect(get('chest').target).toEqual({ min: 10, max: 20 });
  });
  it('includes custom exercises', () => {
    const custom: Exercise = {
      id: 'custom-x', name: 'Landmine Row', primaryMuscle: 'upper_back', secondaryMuscles: ['lats'], equipment: 'other',
      mechanic: 'compound', trackingType: 'weight_reps', isCustom: true,
    };
    const mv = muscleVolume([workout('2026-11-09T18:00:00Z', sets(4, 'custom-x', 40, 10))], { goal: 'general', experience: 'beginner' }, [custom]);
    expect(mv.find((x) => x.muscle === 'upper_back')!.sets).toBe(4);
    expect(mv.find((x) => x.muscle === 'lats')!.sets).toBe(2);
  });
});

describe('computeStats', () => {
  const profile: Pick<User, 'goal' | 'experience' | 'timezone' | 'daysPerWeek'> = {
    goal: 'hypertrophy',
    experience: 'intermediate',
    timezone: 'UTC',
    daysPerWeek: 4,
  };
  const NOW = new Date('2026-11-10T12:00:00.000Z'); // Tuesday; week starts 2026-11-09

  it('counts a streak ending this week', () => {
    const ws = [
      workout('2026-11-09T18:00:00Z', sets(3, BENCH, 100, 5)),
      workout('2026-11-03T18:00:00Z', sets(3, BENCH, 100, 5)),
      workout('2026-11-01T18:00:00Z', sets(3, BENCH, 100, 5)), // Sunday — same week as 10-26
      workout('2026-10-13T18:00:00Z', sets(3, BENCH, 100, 5)), // after a gap
    ];
    const st = computeStats(ws, profile, NOW);
    expect(st.streakWeeks).toBe(3);
    expect(st.workoutsThisWeek).toBe(1);
    expect(st.targetThisWeek).toBe(4);
    expect(st.totalWorkouts).toBe(4);
  });
  it('a streak may end last week; older activity alone is no streak', () => {
    const lastWeek = [workout('2026-11-04T18:00:00Z', []), workout('2026-10-28T18:00:00Z', [])];
    expect(computeStats(lastWeek, profile, NOW).streakWeeks).toBe(2);
    expect(computeStats([workout('2026-10-27T18:00:00Z', [])], profile, NOW).streakWeeks).toBe(0);
    expect(computeStats([], profile, NOW).streakWeeks).toBe(0);
  });
  it('weeklyVolume: 12 weeks oldest → newest, zero-filled, current week last', () => {
    const ws = [
      workout('2026-11-09T18:00:00Z', [s(BENCH, 40, 10, { kind: 'warmup' }), ...sets(3, BENCH, 100, 5)]),
      workout('2026-11-10T08:00:00Z', sets(2, BENCH, 50, 10)),
      workout('2026-10-20T18:00:00Z', sets(1, BENCH, 100, 10)),
      workout('2026-01-01T18:00:00Z', sets(1, BENCH, 100, 10)), // outside the window
    ];
    const wv = computeStats(ws, profile, NOW).weeklyVolume;
    expect(wv).toHaveLength(12);
    expect(wv[0]!.weekStart).toBe('2026-08-24');
    expect(wv[11]).toEqual({ weekStart: '2026-11-09', volumeKg: 2500, sets: 5, workouts: 2 });
    expect(wv[8]).toEqual({ weekStart: '2026-10-19', volumeKg: 1000, sets: 1, workouts: 1 });
    expect(wv[10]).toEqual({ weekStart: '2026-11-02', volumeKg: 0, sets: 0, workouts: 0 });
    for (let i = 1; i < 12; i++) expect(wv[i]!.weekStart).toBe(addDays(wv[i - 1]!.weekStart, 7));
  });
  it('uses the user timezone for week boundaries', () => {
    // Sunday 2026-11-08 23:30 in Los Angeles = Monday 07:30 UTC
    const ws = [workout('2026-11-09T07:30:00Z', sets(3, BENCH, 100, 5))];
    const now = new Date('2026-11-10T20:00:00Z');
    const la = computeStats(ws, { ...profile, timezone: 'America/Los_Angeles' }, now);
    expect(la.workoutsThisWeek).toBe(0);
    expect(la.streakWeeks).toBe(1);
    expect(la.weeklyVolume[10]!.weekStart).toBe('2026-11-02');
    expect(la.weeklyVolume[10]!.volumeKg).toBe(1500);
    const utc = computeStats(ws, profile, now);
    expect(utc.workoutsThisWeek).toBe(1);
    expect(utc.muscleVolumeThisWeek.find((m) => m.muscle === 'chest')!.sets).toBe(3);
    expect(la.muscleVolumeThisWeek.find((m) => m.muscle === 'chest')!.sets).toBe(0);
  });
  it('recentPRs: newest first, max 10, judged chronologically', () => {
    const ws = Array.from({ length: 15 }, (_, i) =>
      workout(`2026-09-${String(i + 1).padStart(2, '0')}T18:00:00Z`, [s(BENCH, 100 + i * 2.5, 5)]),
    );
    const prs = computeStats([...ws].reverse(), profile, NOW).recentPRs;
    expect(prs).toHaveLength(10);
    expect(prs[0]!.workoutId).toBe(ws[14]!.id);
    for (let i = 1; i < prs.length; i++) expect(prs[i]!.date <= prs[i - 1]!.date).toBe(true);
    expect(prs.some((p) => p.workoutId === ws[0]!.id)).toBe(false); // first session never yields PRs
  });
});
