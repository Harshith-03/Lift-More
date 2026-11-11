import type { Equipment, Exercise, Unit } from '../types';
import { defaultIncrement, kgToUnit, roundTo, unitToKg } from './units';

const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

/**
 * Plates per side for a barbell total, in `unit`. Standard plates: kg 25/20/15/10/5/2.5/1.25,
 * lb 45/35/25/10/5/2.5. Greedy, heaviest first (how people actually load a bar).
 *
 * - `plates`: one side, heaviest first.
 * - `remainderInUnit`: weight **per side** that standard plates cannot make up (0 when exact,
 *   and 0 when the total is at or below the bar).
 * - `barInUnit`: the bar converted to `unit` (2 decimals).
 */
export function platesPerSide(
  totalKg: number,
  unit: Unit,
  barKg: number,
): { plates: number[]; remainderInUnit: number; barInUnit: number } {
  const bar = roundTo(kgToUnit(Math.max(0, barKg || 0), unit), 2);
  const total = roundTo(kgToUnit(Math.max(0, totalKg || 0), unit), 2);
  // Work in hundredths of a unit so plate maths is exact.
  let remaining = Math.max(0, Math.round(total * 100) - Math.round(bar * 100)) / 2;
  const plates: number[] = [];
  for (const plate of PLATES[unit]) {
    const p = Math.round(plate * 100);
    while (remaining + 1e-9 >= p) {
      plates.push(plate);
      remaining -= p;
    }
  }
  return { plates, remainderInUnit: roundTo(remaining / 100, 2), barInUnit: bar };
}

const BAR_LOADED: ReadonlySet<Equipment> = new Set<Equipment>(['barbell', 'ez_bar']);

function roundStep(value: number, step: number): number {
  return roundTo(Math.round(value / step + 1e-9) * step, 6);
}

/**
 * Warm-up ramp for a working weight (empty for isolation/bodyweight/light loads).
 *
 * Barbell lifts: empty bar × 10, then ~40% × 5, ~60% × 3, ~80% × 2 (+ ~90% × 1 for heavy lifts),
 * rounded to the smallest plate pair (2.5 kg / 5 lb). Other compound lifts (dumbbell, machine,
 * cable, kettlebell, smith): ~50% × 8, ~75% × 4 rounded to the exercise's increment. Sets that would
 * be lighter than the previous step or too close to the working weight are dropped.
 */
export function generateWarmups(
  workingWeightKg: number,
  exercise: Exercise,
  unit: Unit,
  barKg: number,
): Array<{ weightKg: number; reps: number }> {
  if (!Number.isFinite(workingWeightKg) || workingWeightKg <= 0) return [];
  if (exercise.trackingType !== 'weight_reps' || exercise.mechanic !== 'compound') return [];

  const work = kgToUnit(workingWeightKg, unit);
  const out: Array<{ value: number; reps: number }> = [];

  if (BAR_LOADED.has(exercise.equipment)) {
    const bar = roundTo(kgToUnit(Math.max(0, barKg || 0), unit), 2);
    const step = unit === 'kg' ? 2.5 : 5;
    if (work <= bar * 1.25 || work < step * 4) return [];
    let last = 0;
    if (bar > 0 && bar <= work - step) {
      out.push({ value: bar, reps: 10 });
      last = bar;
    }
    const ramp: Array<[number, number]> = [
      [0.4, 5],
      [0.6, 3],
      [0.8, 2],
    ];
    if (bar > 0 ? work >= bar * 5 : work >= (unit === 'kg' ? 100 : 225)) ramp.push([0.9, 1]);
    for (const [pct, reps] of ramp) {
      const w = roundStep(work * pct, step);
      if (w < last + step - 1e-9 || w > work - step + 1e-9 || w <= bar) continue;
      out.push({ value: w, reps });
      last = w;
    }
  } else {
    const step = defaultIncrement(exercise, unit);
    if (work < step * 6) return [];
    let last = 0;
    for (const [pct, reps] of [
      [0.5, 8],
      [0.75, 4],
    ] as Array<[number, number]>) {
      const w = roundStep(work * pct, step);
      if (w <= 0 || w < last + step - 1e-9 || w > work - step + 1e-9) continue;
      out.push({ value: w, reps });
      last = w;
    }
  }
  return out.map((s) => ({ weightKg: unitToKg(s.value, unit), reps: s.reps }));
}
