import { describe, expect, it } from 'vitest';
import { estimate1RM, formatWeight, generateWarmups, getExercise, kgToUnit, platesPerSide, unitToKg } from './index';
import type { Exercise } from '../types';

const ex = (id: string): Exercise => {
  const e = getExercise(id);
  if (!e) throw new Error(`missing ${id}`);
  return e;
};
const LB_BAR = unitToKg(45, 'lb');

describe('estimate1RM', () => {
  it('uses Epley above 1 rep', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.6667, 3);
    expect(estimate1RM(60, 10)).toBeCloseTo(80, 6);
  });
  it('returns the weight for a single', () => {
    expect(estimate1RM(140, 1)).toBe(140);
  });
  it('is null outside 1–15 reps', () => {
    expect(estimate1RM(100, 0)).toBeNull();
    expect(estimate1RM(100, -1)).toBeNull();
    expect(estimate1RM(100, 16)).toBeNull();
    expect(estimate1RM(100, 15)).toBeCloseTo(150, 6);
  });
});

describe('platesPerSide', () => {
  it('loads kg plates heaviest first', () => {
    expect(platesPerSide(100, 'kg', 20)).toEqual({ plates: [25, 15], remainderInUnit: 0, barInUnit: 20 });
    expect(platesPerSide(60, 'kg', 20)).toEqual({ plates: [20], remainderInUnit: 0, barInUnit: 20 });
    expect(platesPerSide(102.5, 'kg', 20).plates).toEqual([25, 15, 1.25]);
    expect(platesPerSide(182.5, 'kg', 20).plates).toEqual([25, 25, 25, 5, 1.25]);
  });
  it('loads lb plates using a 45 lb bar', () => {
    expect(platesPerSide(unitToKg(225, 'lb'), 'lb', LB_BAR)).toEqual({ plates: [45, 45], remainderInUnit: 0, barInUnit: 45 });
    expect(platesPerSide(unitToKg(135, 'lb'), 'lb', LB_BAR).plates).toEqual([45]);
    expect(platesPerSide(unitToKg(315, 'lb'), 'lb', LB_BAR).plates).toEqual([45, 45, 45]);
    expect(platesPerSide(unitToKg(185, 'lb'), 'lb', LB_BAR).plates).toEqual([45, 25]);
    expect(platesPerSide(unitToKg(155, 'lb'), 'lb', LB_BAR).plates).toEqual([45, 10]);
    // 20.41 kg displays as a 45 lb bar
    expect(platesPerSide(unitToKg(135, 'lb'), 'lb', 20.41).barInUnit).toBe(45);
  });
  it('reports the per-side remainder that standard plates cannot make', () => {
    const r = platesPerSide(103, 'kg', 20); // 41.5 per side
    expect(r.plates).toEqual([25, 15, 1.25]);
    expect(r.remainderInUnit).toBe(0.25);
    expect(platesPerSide(unitToKg(137, 'lb'), 'lb', LB_BAR).remainderInUnit).toBe(1);
  });
  it('returns just the bar for totals at or below the bar', () => {
    expect(platesPerSide(20, 'kg', 20)).toEqual({ plates: [], remainderInUnit: 0, barInUnit: 20 });
    expect(platesPerSide(10, 'kg', 20)).toEqual({ plates: [], remainderInUnit: 0, barInUnit: 20 });
  });
  it('converts a 20 kg bar for lb users', () => {
    expect(platesPerSide(100, 'lb', 20).barInUnit).toBe(44.09);
  });
  it('plates + bar add back up to the total', () => {
    for (let total = 20; total <= 250; total += 2.5) {
      const r = platesPerSide(total, 'kg', 20);
      const sum = r.barInUnit + 2 * r.plates.reduce((a, b) => a + b, 0) + 2 * r.remainderInUnit;
      expect(sum).toBeCloseTo(total, 6);
    }
  });
});

describe('generateWarmups', () => {
  it('is empty for isolation, bodyweight, timed and light work', () => {
    expect(generateWarmups(30, ex('barbell-curl'), 'kg', 20)).toEqual([]);
    expect(generateWarmups(20, ex('pull-up'), 'kg', 20)).toEqual([]);
    expect(generateWarmups(30, ex('farmers-carry'), 'kg', 20)).toEqual([]);
    expect(generateWarmups(25, ex('barbell-bench-press'), 'kg', 20)).toEqual([]);
    expect(generateWarmups(8, ex('dumbbell-bench-press'), 'kg', 20)).toEqual([]);
    expect(generateWarmups(0, ex('barbell-back-squat'), 'kg', 20)).toEqual([]);
  });
  it('ramps a barbell lift from the empty bar', () => {
    const w = generateWarmups(100, ex('barbell-back-squat'), 'kg', 20);
    expect(w).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 3 },
      { weightKg: 80, reps: 2 },
      { weightKg: 90, reps: 1 },
    ]);
  });
  it('produces increasing, loadable weights below the working weight', () => {
    for (const work of [45, 62.5, 80, 140, 227.5]) {
      const w = generateWarmups(work, ex('barbell-bench-press'), 'kg', 20);
      expect(w.length).toBeGreaterThan(0);
      for (let i = 0; i < w.length; i++) {
        expect(w[i]!.weightKg).toBeLessThan(work);
        expect((w[i]!.weightKg / 2.5) % 1).toBeCloseTo(0, 9);
        if (i > 0) expect(w[i]!.weightKg).toBeGreaterThan(w[i - 1]!.weightKg);
      }
    }
  });
  it('rounds to 5 lb for lb users', () => {
    const w = generateWarmups(unitToKg(225, 'lb'), ex('barbell-back-squat'), 'lb', LB_BAR);
    expect(w.map((s) => formatWeight(s.weightKg, 'lb'))).toEqual(['45 lb', '90 lb', '135 lb', '180 lb', '205 lb']);
    for (const s of w) {
      const steps = kgToUnit(s.weightKg, 'lb') / 5;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    }
  });
  it('uses a shorter ramp for dumbbell / machine compounds', () => {
    const w = generateWarmups(30, ex('dumbbell-bench-press'), 'kg', 20);
    expect(w).toEqual([
      { weightKg: 16, reps: 8 },
      { weightKg: 22, reps: 4 },
    ]);
    const lp = generateWarmups(200, ex('leg-press'), 'kg', 20);
    expect(lp).toEqual([
      { weightKg: 100, reps: 8 },
      { weightKg: 150, reps: 4 },
    ]);
  });
});
