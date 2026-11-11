import { describe, expect, it } from 'vitest';
import { EXERCISES, TEMPLATES, getExercise } from './engine';
import { EQUIPMENT, MUSCLE_GROUPS } from './types';
import type { Equipment, MuscleGroup } from './types';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('EXERCISES data integrity', () => {
  it('has roughly 90+ entries', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(85);
    expect(EXERCISES.length).toBeLessThanOrEqual(120);
  });
  it('has unique kebab-case ids and unique names', () => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const e of EXERCISES) {
      expect(e.id).toMatch(KEBAB);
      expect(ids.has(e.id), `duplicate id ${e.id}`).toBe(false);
      expect(names.has(e.name.toLowerCase()), `duplicate name ${e.name}`).toBe(false);
      ids.add(e.id);
      names.add(e.name.toLowerCase());
    }
  });
  it('uses only valid enums and sane fields', () => {
    for (const e of EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(e.primaryMuscle);
      expect(EQUIPMENT).toContain(e.equipment);
      expect(['compound', 'isolation']).toContain(e.mechanic);
      expect(['weight_reps', 'bodyweight_reps', 'duration']).toContain(e.trackingType);
      expect(e.isCustom).toBe(false);
      expect(e.name.trim().length).toBeGreaterThan(2);
      expect(typeof e.cue).toBe('string');
      expect(e.cue!.length).toBeGreaterThan(10);
      expect(e.cue).not.toContain('\n');
      expect(new Set(e.secondaryMuscles).size).toBe(e.secondaryMuscles.length);
      expect(e.secondaryMuscles).not.toContain(e.primaryMuscle);
      for (const m of e.secondaryMuscles) expect(MUSCLE_GROUPS).toContain(m);
    }
  });
  it('covers every muscle group with at least 3 exercises (major groups with many more)', () => {
    const count = new Map<MuscleGroup, number>();
    for (const e of EXERCISES) count.set(e.primaryMuscle, (count.get(e.primaryMuscle) ?? 0) + 1);
    for (const m of MUSCLE_GROUPS) expect(count.get(m) ?? 0, m).toBeGreaterThanOrEqual(3);
    for (const m of ['chest', 'quads', 'shoulders', 'lats', 'upper_back', 'glutes', 'hamstrings'] as const) {
      expect(count.get(m) ?? 0, m).toBeGreaterThanOrEqual(6);
    }
  });
  it('covers every equipment type', () => {
    const seen = new Set<Equipment>(EXERCISES.map((e) => e.equipment));
    for (const eq of EQUIPMENT) expect(seen.has(eq), eq).toBe(true);
  });
  it('tracks bodyweight and timed movements correctly', () => {
    for (const id of ['pull-up', 'chin-up', 'dip', 'push-up']) expect(getExercise(id)?.trackingType, id).toBe('bodyweight_reps');
    for (const id of ['plank', 'dead-hang', 'farmers-carry']) expect(getExercise(id)?.trackingType, id).toBe('duration');
    expect(getExercise('barbell-back-squat')?.mechanic).toBe('compound');
    expect(getExercise('leg-extension')?.mechanic).toBe('isolation');
    expect(getExercise('lateral-raise')).toBeUndefined();
    expect(getExercise('dumbbell-lateral-raise')?.mechanic).toBe('isolation');
  });
  it('includes the staples', () => {
    const staples = [
      'barbell-back-squat', 'front-squat', 'conventional-deadlift', 'romanian-deadlift', 'barbell-bench-press',
      'incline-barbell-bench-press', 'overhead-press', 'barbell-row', 'pull-up', 'chin-up', 'lat-pulldown',
      'seated-cable-row', 'dumbbell-bench-press', 'incline-dumbbell-press', 'single-arm-dumbbell-row', 'leg-press',
      'hack-squat', 'leg-extension', 'seated-leg-curl', 'lying-leg-curl', 'hip-thrust', 'bulgarian-split-squat',
      'standing-calf-raise', 'seated-calf-raise', 'dumbbell-lateral-raise', 'face-pull', 'rear-delt-fly',
      'barbell-curl', 'dumbbell-curl', 'hammer-curl', 'preacher-curl', 'cable-curl', 'triceps-pushdown',
      'skull-crusher', 'overhead-cable-triceps-extension', 'cable-crunch', 'hanging-leg-raise', 'back-extension',
      'barbell-shrug', 'wrist-curl', 'adductor-machine', 'plank', 'dead-hang', 'farmers-carry', 'dip', 'push-up',
    ];
    for (const id of staples) expect(getExercise(id), id).toBeDefined();
  });
  it('getExercise prefers customs, then built-ins', () => {
    const custom = { ...getExercise('plank')!, id: 'custom-1', name: 'My Plank', isCustom: true };
    expect(getExercise('custom-1', [custom])?.name).toBe('My Plank');
    expect(getExercise('plank', [custom])?.name).toBe('Plank');
    expect(getExercise('nope', [custom])).toBeUndefined();
  });
});

describe('TEMPLATES integrity', () => {
  it('has the six starter programs with unique ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['full-body-3x', 'upper-lower', 'ppl', '5x5-strength', 'dumbbell-home-3x', 'body-part-split-5x']) {
      expect(ids).toContain(id);
    }
  });
  it('every template is well-formed and references existing exercises', () => {
    for (const t of TEMPLATES) {
      expect(t.id).toMatch(KEBAB);
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(20);
      expect(['beginner', 'intermediate', 'advanced']).toContain(t.level);
      expect(['strength', 'hypertrophy', 'general']).toContain(t.goal);
      expect(Number.isInteger(t.daysPerWeek)).toBe(true);
      expect(t.daysPerWeek).toBeGreaterThanOrEqual(1);
      expect(t.daysPerWeek).toBeLessThanOrEqual(7);
      expect(t.routines.length).toBeGreaterThan(0);
      const names = new Set<string>();
      for (const r of t.routines) {
        expect(names.has(r.name), `${t.id}: duplicate routine ${r.name}`).toBe(false);
        names.add(r.name);
        expect(typeof r.notes).toBe('string');
        expect(r.items.length).toBeGreaterThanOrEqual(3);
        const inRoutine = new Set<string>();
        for (const i of r.items) {
          const ex = getExercise(i.exerciseId);
          expect(ex, `${t.id}/${r.name}: unknown ${i.exerciseId}`).toBeDefined();
          expect(inRoutine.has(i.exerciseId), `${t.id}/${r.name}: duplicate ${i.exerciseId}`).toBe(false);
          inRoutine.add(i.exerciseId);
          expect(Number.isInteger(i.sets)).toBe(true);
          expect(i.sets).toBeGreaterThanOrEqual(1);
          expect(i.sets).toBeLessThanOrEqual(10);
          expect(Number.isInteger(i.repMin) && Number.isInteger(i.repMax)).toBe(true);
          expect(i.repMin).toBeGreaterThanOrEqual(1);
          expect(i.repMax).toBeGreaterThanOrEqual(i.repMin);
          expect(Number.isInteger(i.restSec)).toBe(true);
          expect(i.restSec).toBeGreaterThanOrEqual(30);
          expect(i.restSec).toBeLessThanOrEqual(300);
          if (ex!.trackingType === 'duration') expect(i.repMin).toBeGreaterThanOrEqual(10); // seconds
          else expect(i.repMax).toBeLessThanOrEqual(30);
        }
      }
    }
  });
  it('matches the requested shapes', () => {
    const byId = new Map(TEMPLATES.map((t) => [t.id, t]));
    expect(byId.get('full-body-3x')).toMatchObject({ daysPerWeek: 3, level: 'beginner' });
    expect(byId.get('upper-lower')).toMatchObject({ daysPerWeek: 4, level: 'intermediate' });
    expect(byId.get('ppl')).toMatchObject({ daysPerWeek: 6, level: 'intermediate' });
    expect(byId.get('5x5-strength')).toMatchObject({ level: 'beginner', goal: 'strength' });
    expect(byId.get('5x5-strength')!.routines).toHaveLength(2);
    expect(byId.get('dumbbell-home-3x')).toMatchObject({ daysPerWeek: 3 });
    expect(byId.get('body-part-split-5x')).toMatchObject({ daysPerWeek: 5, level: 'advanced', goal: 'hypertrophy' });
    expect(byId.get('body-part-split-5x')!.routines).toHaveLength(5);
  });
  it('the home program needs only dumbbells and bodyweight', () => {
    const home = TEMPLATES.find((t) => t.id === 'dumbbell-home-3x')!;
    for (const r of home.routines) {
      for (const i of r.items) expect(['dumbbell', 'bodyweight']).toContain(getExercise(i.exerciseId)!.equipment);
    }
  });
  it('5×5 main lifts are 5 sets of 5', () => {
    const t = TEMPLATES.find((x) => x.id === '5x5-strength')!;
    for (const r of t.routines) {
      const squat = r.items.find((i) => i.exerciseId === 'barbell-back-squat');
      expect(squat).toMatchObject({ sets: 5, repMin: 5, repMax: 5 });
    }
  });
});
