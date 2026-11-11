import type { Equipment, MuscleGroup, PersonalRecord, Unit } from '../../../shared/types';
import { formatWeight, kgToUnit, unitToKg } from '../../../shared/engine';

/** "barbell-back-squat" / "custom-…" → "Barbell Back Squat" (only used when an id is unknown). */
export function humanizeId(id: string): string {
  if (id.startsWith('custom-')) return 'Custom exercise';
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  shoulders: 'Shoulders',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  lower_back: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
};
export const muscleLabel = (m: MuscleGroup | string): string =>
  MUSCLE_LABELS[m as MuscleGroup] ?? humanizeId(String(m));

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  smith: 'Smith machine',
  ez_bar: 'EZ bar',
  other: 'Other',
};
export const equipmentLabel = (e: Equipment | string): string =>
  EQUIPMENT_LABELS[e as Equipment] ?? humanizeId(String(e));

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Number → compact string with up to `max` decimals and no trailing zeros. */
export function fmtNum(n: number, max = 2): string {
  return String(roundTo(n, max));
}

/** kg → value string for an input in the user's unit ("" for null). */
export function kgToInput(kg: number | null, unit: Unit): string {
  if (kg == null) return '';
  return fmtNum(kgToUnit(kg, unit), 2);
}

/** Input value in user's unit → kg (4 decimals) or null. */
export function inputToKg(value: number | null, unit: Unit): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return roundTo(unitToKg(value, unit), 4);
}

/** Weight without unit suffix, e.g. "102.5" (user's unit). */
export function weightNumber(kg: number, unit: Unit): string {
  return fmtNum(kgToUnit(kg, unit), 2);
}

export function fmtWeight(kg: number | null, unit: Unit): string {
  return formatWeight(kg, unit);
}

/** Volume (Σ kg×reps) in the user's unit, grouped: "12,340 kg". */
export function fmtVolume(kg: number, unit: Unit): string {
  const v = Math.round(kgToUnit(kg, unit));
  return `${v.toLocaleString('en-US')} ${unit}`;
}

/** Compact volume for tight spaces: "12.3k". */
export function fmtVolumeCompact(kg: number, unit: Unit): string {
  const v = kgToUnit(kg, unit);
  if (v >= 1_000_000) return `${fmtNum(v / 1_000_000, 1)}M`;
  if (v >= 10_000) return `${fmtNum(v / 1000, 0)}k`;
  if (v >= 1000) return `${fmtNum(v / 1000, 1)}k`;
  return String(Math.round(v));
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 3900 → "1 h 5 min"; 600 → "10 min". */
export function fmtDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec)) return '—';
  const mins = Math.max(0, Math.round(totalSec / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "90s" / "2:30" rest labels. */
export function fmtRest(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

function safeFormat(iso: string | Date, tz: string | undefined, opts: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(d);
  }
}

/** "Mon, Nov 10" */
export const fmtDay = (iso: string | Date, tz?: string) =>
  safeFormat(iso, tz, { weekday: 'short', month: 'short', day: 'numeric' });
/** "Nov 10" */
export const fmtShortDate = (iso: string | Date, tz?: string) => safeFormat(iso, tz, { month: 'short', day: 'numeric' });
/** "Nov 10, 2026" */
export const fmtLongDate = (iso: string | Date, tz?: string) =>
  safeFormat(iso, tz, { month: 'short', day: 'numeric', year: 'numeric' });
/** "6:42 PM" */
export const fmtTime = (iso: string | Date, tz?: string) => safeFormat(iso, tz, { hour: 'numeric', minute: '2-digit' });

/** A YYYY-MM-DD calendar date (no timezone shift) → "Nov 10". */
export function fmtCalendarDate(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return safeFormat(dt, 'UTC', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

export function timeOfDayName(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Late-night workout';
  if (h < 12) return 'Morning workout';
  if (h < 17) return 'Afternoon workout';
  return 'Evening workout';
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** One-line description of a PR, e.g. "Est. 1RM 112.5 kg". */
export function describePR(pr: PersonalRecord, unit: Unit): { label: string; value: string } {
  switch (pr.type) {
    case 'e1rm':
      return { label: 'Est. 1RM', value: fmtWeight(pr.value, unit) };
    case 'weight':
      return {
        label: 'Heaviest set',
        value: pr.reps != null ? `${fmtWeight(pr.value, unit)} × ${pr.reps}` : fmtWeight(pr.value, unit),
      };
    case 'reps':
      return {
        label: 'Most reps',
        value: pr.weightKg ? `${pr.value} reps @ ${fmtWeight(pr.weightKg, unit)}` : `${pr.value} reps`,
      };
    case 'volume':
      return { label: 'Best volume', value: fmtVolume(pr.value, unit) };
    case 'duration':
      return { label: 'Longest hold', value: fmtClock(pr.value) };
    default:
      return { label: 'Record', value: String(pr.value) };
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
