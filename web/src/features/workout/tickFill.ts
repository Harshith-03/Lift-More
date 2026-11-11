import type { TrackingType, WorkoutSet } from '../../../../shared/types';
import type { DraftSet, SetPatch } from './draftReducer';

/**
 * Ticking a set logs exactly what the row shows: every empty field takes the value its placeholder
 * displays (target reps / last session), independently. Returns null when nothing needs filling.
 */
export function tickFill(
  set: Pick<DraftSet, 'completed' | 'weightKg' | 'reps' | 'durationSec'>,
  ctx: { tracking: TrackingType; targetReps: number | null; previous: Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSec'> | null },
): SetPatch | null {
  if (set.completed) return null;
  const isDuration = ctx.tracking === 'duration';
  const patch: SetPatch = {};
  const repsValue = isDuration ? set.durationSec : set.reps;
  if (repsValue == null) {
    const prevValue = ctx.previous ? (isDuration ? ctx.previous.durationSec : ctx.previous.reps) : null;
    const v = ctx.targetReps ?? prevValue;
    if (v != null) {
      if (isDuration) patch.durationSec = v;
      else patch.reps = v;
    }
  }
  // Only weight_reps rows show last session's weight as the placeholder; the others show "BW".
  if (ctx.tracking === 'weight_reps' && set.weightKg == null && ctx.previous?.weightKg != null) {
    patch.weightKg = ctx.previous.weightKg;
  }
  return Object.keys(patch).length ? patch : null;
}
