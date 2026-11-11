import { memo } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { SetKind, TrackingType, Unit, WorkoutSet } from '../../../../shared/types';
import { kgToUnit } from '../../../../shared/engine';
import { NumericInput } from '../../components/NumericInput';
import { inputToKg, roundTo } from '../../lib/format';
import { formatPrevious } from './previous';
import type { DraftSet, SetPatch } from './draftReducer';

// narrow phones (360 px) get slightly slimmer number columns so "Previous" stays readable
export const SET_GRID =
  'grid grid-cols-[2.75rem_minmax(0,1fr)_4rem_3.25rem_2.75rem_2.75rem] min-[380px]:grid-cols-[2.75rem_minmax(0,1fr)_4.25rem_3.5rem_2.75rem_2.75rem] items-center gap-1';

const KIND_STYLE: Record<SetKind, string> = {
  warmup: 'bg-warn-soft text-warn',
  working: 'bg-surface-2 text-ink',
  drop: 'bg-info-soft text-info',
  failure: 'bg-danger-soft text-danger',
};
const KIND_NAME: Record<SetKind, string> = { warmup: 'warm-up', working: 'working', drop: 'drop set', failure: 'to failure' };

export function kindLabel(kind: SetKind, workingIndex: number): string {
  if (kind === 'warmup') return 'W';
  if (kind === 'drop') return 'D';
  if (kind === 'failure') return 'F';
  return String(workingIndex);
}

function normalizeRpe(v: number | null): number | null {
  if (v == null) return null;
  if (v > 10 && v <= 100) v = v / 10; // "85" → 8.5
  return Math.min(10, Math.max(5, Math.round(v * 2) / 2));
}

const inputCls =
  'h-11 w-full min-w-0 rounded-xl bg-surface-2 px-1 text-center text-[17px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-faint focus:bg-surface-3 focus:ring-2 focus:ring-accent-ink';

export interface SetRowProps {
  set: DraftSet;
  index: number;
  /** 1-based number among working-type sets (for the badge). */
  workingIndex: number;
  tracking: TrackingType;
  unit: Unit;
  previous: WorkoutSet | null;
  targetReps: number | null;
  exerciseName: string;
  onChange: (setId: string, patch: SetPatch) => void;
  onCycleKind: (setId: string) => void;
  onToggle: (set: DraftSet, fill: SetPatch | null) => void;
}

export const SetRow = memo(function SetRow({
  set,
  index,
  workingIndex,
  tracking,
  unit,
  previous,
  targetReps,
  exerciseName,
  onChange,
  onCycleKind,
  onToggle,
}: SetRowProps) {
  const weightDisplay = set.weightKg == null ? null : roundTo(kgToUnit(set.weightKg, unit), 2);
  const isDuration = tracking === 'duration';
  const repsValue = isDuration ? set.durationSec : set.reps;
  const prevValue = previous ? (isDuration ? previous.durationSec : previous.reps) : null;
  const label = `${exerciseName} set ${index + 1}`;

  const fillFromPrevious = () => {
    if (!previous) return;
    onChange(set.id, {
      weightKg: previous.weightKg,
      ...(isDuration ? { durationSec: previous.durationSec } : { reps: previous.reps }),
    });
  };

  const tick = () => {
    // ticking an empty set fills it from the target / last session first
    let fill: SetPatch | null = null;
    if (!set.completed && repsValue == null) {
      const v = targetReps ?? prevValue;
      if (v != null) fill = isDuration ? { durationSec: v } : { reps: v };
      if (set.weightKg == null && previous?.weightKg != null && tracking === 'weight_reps') fill = { ...fill, weightKg: previous.weightKg };
    }
    onToggle(set, fill);
  };

  return (
    <div
      className={clsx(SET_GRID, 'rounded-xl px-0.5 py-1 transition-colors', set.completed && 'bg-accent-soft')}
      data-completed={set.completed || undefined}
    >
      <button
        type="button"
        onClick={() => onCycleKind(set.id)}
        aria-label={`Set ${index + 1}, ${KIND_NAME[set.kind]}. Change set type`}
        className={clsx('flex h-11 items-center justify-center rounded-xl text-[15px] font-bold', KIND_STYLE[set.kind])}
      >
        {kindLabel(set.kind, workingIndex)}
      </button>

      <button
        type="button"
        onClick={fillFromPrevious}
        disabled={!previous}
        aria-label={previous ? `Previous: ${formatPrevious(previous, tracking, unit)}. Use these values` : 'No previous set'}
        className="h-11 min-w-0 truncate rounded-xl px-0.5 text-center text-[13px] font-medium tracking-tight text-muted active:bg-surface-2 disabled:text-faint"
      >
        {formatPrevious(previous, tracking, unit)}
      </button>

      <NumericInput
        decimal
        aria-label={`${label} ${tracking === 'weight_reps' ? `weight (${unit})` : `added weight (${unit})`}`}
        placeholder={tracking === 'weight_reps' ? (previous?.weightKg != null ? String(roundTo(kgToUnit(previous.weightKg, unit), 2)) : unit) : 'BW'}
        value={weightDisplay}
        onValueChange={(v) => onChange(set.id, { weightKg: inputToKg(v, unit) })}
        className={clsx(inputCls, set.completed && 'bg-transparent')}
      />

      <NumericInput
        aria-label={`${label} ${isDuration ? 'seconds' : 'reps'}`}
        placeholder={targetReps != null ? String(targetReps) : prevValue != null ? String(prevValue) : isDuration ? 'sec' : 'reps'}
        value={repsValue}
        onValueChange={(v) => onChange(set.id, isDuration ? { durationSec: v == null ? null : Math.round(v) } : { reps: v == null ? null : Math.round(v) })}
        className={clsx(inputCls, set.completed && 'bg-transparent')}
      />

      <NumericInput
        decimal
        maxDecimals={1}
        aria-label={`${label} RPE (5 to 10)`}
        placeholder="–"
        value={set.rpe}
        onValueChange={(v) => onChange(set.id, { rpe: v != null && v >= 5 && v <= 10 ? v : v == null ? null : set.rpe })}
        normalize={normalizeRpe}
        className={clsx(inputCls, 'text-[15px]', set.completed && 'bg-transparent')}
      />

      <button
        type="button"
        onClick={tick}
        aria-pressed={set.completed}
        aria-label={set.completed ? `${label} done. Mark not done` : `Complete ${label}`}
        className={clsx(
          'flex h-11 items-center justify-center rounded-xl transition-[background-color,transform] active:scale-95',
          set.completed ? 'bg-accent text-on-accent' : 'bg-surface-2 text-faint',
        )}
      >
        <Check className="size-6" strokeWidth={3} aria-hidden />
      </button>
    </div>
  );
});
