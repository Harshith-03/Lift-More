import { describe, expect, it } from 'vitest';
import { EXERCISES, alternativesFor, getExercise, searchExercises } from './index';
import type { Exercise } from '../types';

const myCurl: Exercise = {
  id: 'custom-11111111-1111-4111-8111-111111111111',
  name: 'Spider Curl (Bench)',
  primaryMuscle: 'biceps',
  secondaryMuscles: [],
  equipment: 'dumbbell',
  mechanic: 'isolation',
  trackingType: 'weight_reps',
  isCustom: true,
};
const myBench: Exercise = { ...myCurl, id: 'custom-2', name: 'Paused Bench Press', primaryMuscle: 'chest', equipment: 'barbell', mechanic: 'compound' };

describe('searchExercises', () => {
  it('is case-insensitive and matches all words', () => {
    const r = searchExercises('BENCH press');
    expect(r.length).toBeGreaterThan(2);
    for (const e of r) {
      expect(e.name.toLowerCase()).toContain('bench');
      expect(e.name.toLowerCase()).toContain('press');
    }
    expect(r.map((e) => e.id)).toContain('barbell-bench-press');
    expect(r.map((e) => e.id)).not.toContain('bench-dip');
  });
  it('ranks exact and prefix matches first', () => {
    expect(searchExercises('leg press')[0]!.id).toBe('leg-press');
    expect(searchExercises('pull-up')[0]!.id).toBe('pull-up');
    expect(searchExercises('plank')[0]!.id).toBe('plank');
  });
  it('understands common abbreviations', () => {
    expect(searchExercises('rdl').map((e) => e.id)).toContain('romanian-deadlift');
    expect(searchExercises('ohp').map((e) => e.id)).toContain('overhead-press');
    expect(searchExercises('db row').map((e) => e.id)).toContain('single-arm-dumbbell-row');
    expect(searchExercises('pullup').map((e) => e.id)).toContain('pull-up');
  });
  it('ignores punctuation', () => {
    expect(searchExercises('farmers').map((e) => e.id)).toContain('farmers-carry');
    expect(searchExercises("farmer's carry")[0]!.id).toBe('farmers-carry');
  });
  it('filters by primary muscle and equipment', () => {
    const chest = searchExercises('', { muscle: 'chest' });
    expect(chest.length).toBeGreaterThan(5);
    expect(chest.every((e) => e.primaryMuscle === 'chest')).toBe(true);
    const db = searchExercises('', { equipment: 'dumbbell' });
    expect(db.every((e) => e.equipment === 'dumbbell')).toBe(true);
    const both = searchExercises('press', { muscle: 'shoulders', equipment: 'dumbbell' });
    expect(both.map((e) => e.id)).toEqual(['seated-dumbbell-shoulder-press', 'arnold-press']);
  });
  it('returns everything for an empty query, customs first', () => {
    const all = searchExercises('', { custom: [myCurl] });
    expect(all).toHaveLength(EXERCISES.length + 1);
    expect(all[0]).toBe(myCurl);
  });
  it('puts matching customs before built-ins', () => {
    const r = searchExercises('curl', { custom: [myCurl] });
    expect(r[0]!.id).toBe(myCurl.id);
    expect(r.length).toBeGreaterThan(5);
    const b = searchExercises('bench press', { custom: [myBench, myCurl] });
    expect(b[0]!.id).toBe('custom-2');
    expect(b.map((e) => e.id)).not.toContain(myCurl.id);
  });
  it('returns [] for no match', () => {
    expect(searchExercises('zzzz-not-an-exercise')).toEqual([]);
  });
});

describe('alternativesFor', () => {
  it('returns same-primary exercises, best first, excluding itself', () => {
    const alts = alternativesFor('barbell-bench-press');
    expect(alts).toHaveLength(5);
    expect(alts.map((e) => e.id)).not.toContain('barbell-bench-press');
    for (const e of alts) expect(e.primaryMuscle).toBe('chest');
    expect(alts[0]!.mechanic).toBe('compound');
    expect(alts[0]!.trackingType).toBe('weight_reps');
  });
  it('prefers matching mechanic for isolation lifts', () => {
    const alts = alternativesFor('leg-extension', [], 3);
    expect(alts[0]!.primaryMuscle).toBe('quads');
    const curlAlts = alternativesFor('barbell-curl', [], 4);
    expect(curlAlts.every((e) => e.mechanic === 'isolation' && e.primaryMuscle === 'biceps')).toBe(true);
  });
  it('keeps timed holds with timed holds', () => {
    const alts = alternativesFor('plank', [], 2);
    expect(alts.map((e) => e.id)).toContain('side-plank');
    expect(alts[0]!.trackingType).toBe('duration');
  });
  it('respects the limit and fills from secondary muscles when the pool is small', () => {
    expect(alternativesFor('barbell-bench-press', [], 2)).toHaveLength(2);
    expect(alternativesFor('barbell-bench-press', [], 0)).toEqual([]);
    const add = alternativesFor('adductor-machine', [], 5);
    expect(add).toHaveLength(5);
    expect(add[0]!.primaryMuscle).toBe('adductors');
    expect(add.slice(2).every((e) => e.secondaryMuscles.includes('adductors'))).toBe(true);
  });
  it('includes custom exercises and works for a custom base', () => {
    expect(alternativesFor('dumbbell-curl', [myCurl], 20).map((e) => e.id)).toContain(myCurl.id);
    const fromCustom = alternativesFor(myCurl.id, [myCurl]);
    expect(fromCustom.length).toBe(5);
    expect(fromCustom.every((e) => e.primaryMuscle === 'biceps')).toBe(true);
  });
  it('returns [] for unknown ids', () => {
    expect(alternativesFor('nope')).toEqual([]);
  });
  it('never returns duplicates', () => {
    for (const e of EXERCISES) {
      const ids = alternativesFor(e.id, [], 8).map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(e.id);
      expect(getExercise(e.id)).toBe(e);
    }
  });
});
