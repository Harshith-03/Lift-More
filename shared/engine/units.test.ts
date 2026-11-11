import { describe, expect, it } from 'vitest';
import { defaultIncrement, formatWeight, getExercise, kgToUnit, KG_PER_LB, roundToLoadable, unitToKg } from './index';
import type { Exercise } from '../types';

const ex = (id: string): Exercise => {
  const e = getExercise(id);
  if (!e) throw new Error(`missing ${id}`);
  return e;
};

describe('unit conversion', () => {
  it('converts kg ↔ lb with the exact constant', () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(kgToUnit(100, 'kg')).toBe(100);
    expect(unitToKg(225, 'lb')).toBeCloseTo(102.0582833, 6);
    expect(kgToUnit(unitToKg(225, 'lb'), 'lb')).toBeCloseTo(225, 9);
  });
});

describe('formatWeight', () => {
  it('formats kg and lb, trimming trailing zeros', () => {
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg');
    expect(formatWeight(100, 'kg')).toBe('100 kg');
    expect(formatWeight(unitToKg(225, 'lb'), 'lb')).toBe('225 lb');
    expect(formatWeight(1.25, 'kg')).toBe('1.25 kg');
    expect(formatWeight(0.1 + 0.2, 'kg')).toBe('0.3 kg');
  });
  it('caps at 2 decimals', () => {
    expect(formatWeight(20, 'lb')).toBe('44.09 lb');
    expect(formatWeight(33.3333, 'kg')).toBe('33.33 kg');
  });
  it('shows a 45 lb bar (20.41 kg) as 45 lb', () => {
    expect(formatWeight(20.41, 'lb')).toBe('45 lb');
  });
  it('null → BW', () => {
    expect(formatWeight(null, 'kg')).toBe('BW');
    expect(formatWeight(null, 'lb')).toBe('BW');
  });
  it('never prints -0', () => {
    expect(formatWeight(-0, 'kg')).toBe('0 kg');
    expect(formatWeight(-0.001, 'kg')).toBe('0 kg');
  });
});

describe('roundToLoadable', () => {
  it('rounds to the nearest kg step', () => {
    expect(roundToLoadable(102.3, 'kg', 2.5)).toBe(102.5);
    expect(roundToLoadable(101.2, 'kg', 2.5)).toBe(100);
    expect(roundToLoadable(23.1, 'kg', 2)).toBe(24);
    expect(roundToLoadable(0.3, 'kg', 0.1)).toBe(0.3);
  });
  it('rounds in lb and returns kg that formats as a clean lb value', () => {
    const kg = roundToLoadable(unitToKg(224.87, 'lb'), 'lb', 5);
    expect(formatWeight(kg, 'lb')).toBe('225 lb');
    expect(kg).toBeCloseTo(225 * KG_PER_LB, 9);
  });
  it('round-trips with formatWeight for every lb step 0–600', () => {
    for (let v = 0; v <= 600; v += 2.5) {
      const kg = roundToLoadable(unitToKg(v + 0.4, 'lb'), 'lb', 2.5);
      expect(formatWeight(kg, 'lb')).toBe(`${v} lb`);
      const back = kgToUnit(kg, 'lb') / 2.5;
      expect(Math.abs(back - Math.round(back))).toBeLessThan(1e-9);
    }
  });
  it('round-trips for every kg step 0–300', () => {
    for (let i = 0; i <= 240; i++) {
      const v = i * 1.25;
      expect(formatWeight(roundToLoadable(v + 0.3, 'kg', 1.25), 'kg')).toBe(`${v} kg`);
    }
  });
  it('is idempotent', () => {
    const once = roundToLoadable(unitToKg(187, 'lb'), 'lb', 5);
    expect(roundToLoadable(once, 'lb', 5)).toBe(once);
  });
  it('handles degenerate inputs', () => {
    expect(roundToLoadable(-5, 'kg', 2.5)).toBe(0);
    expect(roundToLoadable(12.345, 'kg', 0)).toBe(12.35);
    expect(roundToLoadable(Number.NaN, 'kg', 2.5)).toBe(0);
  });
});

describe('defaultIncrement', () => {
  it('lower-body barbell compound: 5 kg / 10 lb', () => {
    expect(defaultIncrement(ex('barbell-back-squat'), 'kg')).toBe(5);
    expect(defaultIncrement(ex('barbell-back-squat'), 'lb')).toBe(10);
    expect(defaultIncrement(ex('conventional-deadlift'), 'kg')).toBe(5);
    expect(defaultIncrement(ex('leg-press'), 'lb')).toBe(10);
  });
  it('upper-body compound: 2.5 kg / 5 lb', () => {
    expect(defaultIncrement(ex('barbell-bench-press'), 'kg')).toBe(2.5);
    expect(defaultIncrement(ex('overhead-press'), 'lb')).toBe(5);
  });
  it('dumbbell: 2 kg / 5 lb', () => {
    expect(defaultIncrement(ex('dumbbell-bench-press'), 'kg')).toBe(2);
    expect(defaultIncrement(ex('dumbbell-lateral-raise'), 'lb')).toBe(5);
    expect(defaultIncrement(ex('goblet-squat'), 'kg')).toBe(2);
  });
  it('machine / cable / isolation: 2.5 kg / 5 lb', () => {
    expect(defaultIncrement(ex('leg-extension'), 'kg')).toBe(2.5);
    expect(defaultIncrement(ex('triceps-pushdown'), 'lb')).toBe(5);
    expect(defaultIncrement(ex('barbell-curl'), 'kg')).toBe(2.5);
  });
  it('kettlebell: next bell', () => {
    expect(defaultIncrement(ex('kettlebell-swing'), 'kg')).toBe(4);
  });
});
