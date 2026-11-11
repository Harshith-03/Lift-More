import { describe, expect, it } from 'vitest';
import { tickFill } from './tickFill';

const prev = { weightKg: 40, reps: 8, durationSec: null };
const blank = { completed: false, weightKg: null, reps: null, durationSec: null };

describe('tickFill (ticking logs what the row shows)', () => {
  it('fills the placeholder weight even when reps were prefilled (regression: saved as bodyweight)', () => {
    expect(tickFill({ ...blank, reps: 5 }, { tracking: 'weight_reps', targetReps: 5, previous: prev })).toEqual({ weightKg: 40 });
  });

  it('fills reps from the target first, then last session, plus weight', () => {
    expect(tickFill(blank, { tracking: 'weight_reps', targetReps: 6, previous: prev })).toEqual({ reps: 6, weightKg: 40 });
    expect(tickFill(blank, { tracking: 'weight_reps', targetReps: null, previous: prev })).toEqual({ reps: 8, weightKg: 40 });
  });

  it('never overwrites typed values and does nothing when un-ticking', () => {
    expect(tickFill({ ...blank, weightKg: 50, reps: 7 }, { tracking: 'weight_reps', targetReps: 5, previous: prev })).toBeNull();
    expect(tickFill({ ...blank, completed: true }, { tracking: 'weight_reps', targetReps: 5, previous: prev })).toBeNull();
  });

  it('bodyweight rows keep weight empty (placeholder is "BW"); duration rows fill seconds', () => {
    expect(tickFill(blank, { tracking: 'bodyweight_reps', targetReps: 8, previous: { weightKg: 10, reps: 8, durationSec: null } })).toEqual({ reps: 8 });
    expect(tickFill(blank, { tracking: 'duration', targetReps: null, previous: { weightKg: null, reps: null, durationSec: 45 } })).toEqual({ durationSec: 45 });
  });

  it('no target and no history → nothing to fill', () => {
    expect(tickFill(blank, { tracking: 'weight_reps', targetReps: null, previous: null })).toBeNull();
  });
});
