import { describe, expect, it } from 'vitest';
import {
  buildWorkoutPayload,
  countSets,
  draftFromWorkout,
  draftReducer,
  draftVolumeKg,
  emptySet,
  nextKind,
  type DraftExercise,
  type DraftSet,
  type WorkoutDraft,
} from './draftReducer';
import { draftFromRoutine, newExerciseBlock } from './draftFactory';
import type { Exercise, Routine, WeeklyPlan } from '../../../../shared/types';

const NOW = Date.parse('2026-11-10T18:00:00.000Z');

function set(id: string, patch: Partial<DraftSet> = {}): DraftSet {
  return { ...emptySet(id), ...patch };
}

function block(key: string, exerciseId: string, sets: DraftSet[], patch: Partial<DraftExercise> = {}): DraftExercise {
  return { key, exerciseId, restSec: 90, repMin: 8, repMax: 12, notes: '', hint: null, sets, ...patch };
}

function draft(exercises: DraftExercise[] = [], patch: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    v: 1,
    id: 'w1',
    userId: 'u1',
    mode: 'live',
    routineId: null,
    name: 'Push',
    startedAt: '2026-11-10T17:00:00.000Z',
    endedAt: null,
    notes: '',
    bodyweightKg: null,
    exercises,
    rest: null,
    ...patch,
  };
}

describe('draftReducer — exercises', () => {
  it('adds an exercise to the end', () => {
    const s0 = draft([block('a', 'bench', [set('s1')])]);
    const s1 = draftReducer(s0, { type: 'addExercise', exercise: block('b', 'squat', [set('s2')]) });
    expect(s1.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'squat']);
    expect(s0.exercises).toHaveLength(1); // immutable
  });

  it('removes an exercise (and its running rest timer)', () => {
    const s0 = draft([block('a', 'bench', []), block('b', 'squat', [])], {
      rest: { endsAt: NOW + 60_000, totalSec: 60, exerciseKey: 'b' },
    });
    const s1 = draftReducer(s0, { type: 'removeExercise', key: 'b' });
    expect(s1.exercises.map((e) => e.key)).toEqual(['a']);
    expect(s1.rest).toBeNull();
    expect(draftReducer(s1, { type: 'removeExercise', key: 'zzz' })).toBe(s1);
  });

  it('reorders exercises up/down and ignores moves past the ends', () => {
    const s0 = draft([block('a', 'bench', []), block('b', 'squat', []), block('c', 'row', [])]);
    const down = draftReducer(s0, { type: 'moveExercise', key: 'a', delta: 1 });
    expect(down.exercises.map((e) => e.key)).toEqual(['b', 'a', 'c']);
    const up = draftReducer(down, { type: 'moveExercise', key: 'c', delta: -1 });
    expect(up.exercises.map((e) => e.key)).toEqual(['b', 'c', 'a']);
    expect(draftReducer(s0, { type: 'moveExercise', key: 'a', delta: -1 })).toBe(s0);
    expect(draftReducer(s0, { type: 'moveExercise', key: 'c', delta: 1 })).toBe(s0);
  });

  it('swaps an exercise keeping sets/reps, clearing weight of unfinished sets and the hint', () => {
    const s0 = draft([
      block('a', 'barbell-bench-press', [set('s1', { weightKg: 80, reps: 8, completed: true }), set('s2', { weightKg: 80, reps: 8 })], {
        hint: { action: 'increase_weight', reason: 'Add 2.5 kg' },
      }),
    ]);
    const s1 = draftReducer(s0, { type: 'swapExercise', key: 'a', exerciseId: 'dumbbell-bench-press' });
    const ex = s1.exercises[0]!;
    expect(ex.exerciseId).toBe('dumbbell-bench-press');
    expect(ex.key).toBe('a');
    expect(ex.hint).toBeNull();
    expect(ex.sets).toHaveLength(2);
    expect(ex.sets[0]).toMatchObject({ weightKg: 80, reps: 8, completed: true });
    expect(ex.sets[1]).toMatchObject({ weightKg: null, reps: 8, completed: false });
  });
});

describe('draftReducer — sets', () => {
  it('adds a set copying the last working set (never completed, no RPE)', () => {
    const s0 = draft([block('a', 'bench', [set('w', { kind: 'warmup', weightKg: 40, reps: 10 }), set('s1', { weightKg: 80, reps: 8, rpe: 8, completed: true })])]);
    const s1 = draftReducer(s0, { type: 'addSet', key: 'a', id: 'new' });
    const added = s1.exercises[0]!.sets[2]!;
    expect(added).toEqual({ id: 'new', kind: 'working', weightKg: 80, reps: 8, durationSec: null, rpe: null, completed: false });
  });

  it('adds a working set after warm-ups only', () => {
    const s0 = draft([block('a', 'bench', [set('w', { kind: 'warmup', weightKg: 40, reps: 10 })])]);
    const added = draftReducer(s0, { type: 'addSet', key: 'a', id: 'n' }).exercises[0]!.sets[1]!;
    expect(added.kind).toBe('working');
    expect(added.weightKg).toBe(40);
  });

  it('adds an empty working set to an exercise without sets', () => {
    const s1 = draftReducer(draft([block('a', 'bench', [])]), { type: 'addSet', key: 'a', id: 'n' });
    expect(s1.exercises[0]!.sets).toEqual([emptySet('n')]);
  });

  it('removes a set', () => {
    const s0 = draft([block('a', 'bench', [set('s1'), set('s2')])]);
    expect(draftReducer(s0, { type: 'removeSet', key: 'a', setId: 's1' }).exercises[0]!.sets.map((s) => s.id)).toEqual(['s2']);
  });

  it('updates a set', () => {
    const s0 = draft([block('a', 'bench', [set('s1')])]);
    const s1 = draftReducer(s0, { type: 'updateSet', key: 'a', setId: 's1', patch: { weightKg: 100, reps: 5, rpe: 8.5 } });
    expect(s1.exercises[0]!.sets[0]).toMatchObject({ weightKg: 100, reps: 5, rpe: 8.5 });
  });

  it('cycles kind warmup → working → drop → failure → warmup', () => {
    expect(nextKind('warmup')).toBe('working');
    expect(nextKind('working')).toBe('drop');
    expect(nextKind('drop')).toBe('failure');
    expect(nextKind('failure')).toBe('warmup');
    let s = draft([block('a', 'bench', [set('s1')])]);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = draftReducer(s, { type: 'cycleKind', key: 'a', setId: 's1' });
      seen.push(s.exercises[0]!.sets[0]!.kind);
    }
    expect(seen).toEqual(['drop', 'failure', 'warmup', 'working']);
  });

  it('completing a set starts the rest timer with the exercise rest (warm-ups capped at 60 s)', () => {
    const s0 = draft([block('a', 'bench', [set('w', { kind: 'warmup', reps: 10 }), set('s1', { weightKg: 80, reps: 8 })], { restSec: 150 })]);
    const s1 = draftReducer(s0, { type: 'toggleComplete', key: 'a', setId: 's1', now: NOW, defaultRestSec: 120 });
    expect(s1.exercises[0]!.sets[1]!.completed).toBe(true);
    expect(s1.rest).toEqual({ endsAt: NOW + 150_000, totalSec: 150, exerciseKey: 'a' });

    const s2 = draftReducer(s0, { type: 'toggleComplete', key: 'a', setId: 'w', now: NOW, defaultRestSec: 120 });
    expect(s2.rest?.totalSec).toBe(60);
  });

  it('falls back to the user default rest and un-ticking does not restart the timer', () => {
    const s0 = draft([block('a', 'bench', [set('s1', { reps: 8 })], { restSec: 0 })]);
    const s1 = draftReducer(s0, { type: 'toggleComplete', key: 'a', setId: 's1', now: NOW, defaultRestSec: 120 });
    expect(s1.rest?.totalSec).toBe(120);
    const cleared = draftReducer(s1, { type: 'restClear' });
    const s2 = draftReducer(cleared, { type: 'toggleComplete', key: 'a', setId: 's1', now: NOW + 5000, defaultRestSec: 120 });
    expect(s2.exercises[0]!.sets[0]!.completed).toBe(false);
    expect(s2.rest).toBeNull();
  });

  it('does not run a rest timer while editing a saved workout', () => {
    const s0 = draft([block('a', 'bench', [set('s1', { reps: 8 })])], { mode: 'edit' });
    const s1 = draftReducer(s0, { type: 'toggleComplete', key: 'a', setId: 's1', now: NOW, defaultRestSec: 120 });
    expect(s1.exercises[0]!.sets[0]!.completed).toBe(true);
    expect(s1.rest).toBeNull();
  });

  it('adjusts rest by ±15 s and clears it when it would go below zero', () => {
    const s0 = draft([], { rest: { endsAt: NOW + 30_000, totalSec: 90, exerciseKey: null } });
    const plus = draftReducer(s0, { type: 'restAdjust', now: NOW, deltaSec: 15 });
    expect(plus.rest).toEqual({ endsAt: NOW + 45_000, totalSec: 105, exerciseKey: null });
    // 30 s left − 15 s → 15 s left
    const minus = draftReducer(s0, { type: 'restAdjust', now: NOW, deltaSec: -15 });
    expect(minus.rest).toEqual({ endsAt: NOW + 15_000, totalSec: 75, exerciseKey: null });
    // only 5 s left − 15 s → timer ends
    expect(draftReducer(s0, { type: 'restAdjust', now: NOW + 25_000, deltaSec: -15 }).rest).toBeNull();
  });

  it('only clears the rest timer it was asked about', () => {
    const s0 = draft([], { rest: { endsAt: NOW + 15_000, totalSec: 60, exerciseKey: null } });
    expect(draftReducer(s0, { type: 'restClear', ifEndsAt: NOW })).toBe(s0);
    expect(draftReducer(s0, { type: 'restClear', ifEndsAt: NOW + 15_000 }).rest).toBeNull();
  });

  it('inserts warm-ups first, replacing untouched old ones', () => {
    const s0 = draft([block('a', 'squat', [set('old', { kind: 'warmup', weightKg: 20, reps: 10 }), set('s1', { weightKg: 100, reps: 5 })])]);
    const s1 = draftReducer(s0, {
      type: 'addWarmups',
      key: 'a',
      sets: [set('w1', { weightKg: 40, reps: 8 }), set('w2', { weightKg: 60, reps: 5 })],
    });
    const sets = s1.exercises[0]!.sets;
    expect(sets.map((s) => s.id)).toEqual(['w1', 'w2', 's1']);
    expect(sets.slice(0, 2).every((s) => s.kind === 'warmup')).toBe(true);
  });

  it('late prefill only applies while the block is untouched', () => {
    const s0 = draft([block('a', 'bench', [set('s1')])]);
    const filled = draftReducer(s0, { type: 'prefillExercise', key: 'a', sets: [set('p1', { weightKg: 60, reps: 10 })], hint: { action: 'increase_reps', reason: 'x' } });
    expect(filled.exercises[0]!.sets[0]!.weightKg).toBe(60);
    const typed = draftReducer(s0, { type: 'updateSet', key: 'a', setId: 's1', patch: { reps: 6 } });
    expect(draftReducer(typed, { type: 'prefillExercise', key: 'a', sets: [set('p1', { weightKg: 60 })], hint: null })).toBe(typed);
  });

  it('marks every filled, unticked set complete', () => {
    const s0 = draft([block('a', 'bench', [set('s1', { reps: 8 }), set('s2'), set('s3', { reps: 8, completed: true })])]);
    const s1 = draftReducer(s0, { type: 'completeAllFilled' });
    expect(s1.exercises[0]!.sets.map((s) => s.completed)).toEqual([true, false, true]);
  });
});

describe('derived values', () => {
  it('counts sets and volume (completed non-warm-up only)', () => {
    const d = draft([
      block('a', 'bench', [
        set('w', { kind: 'warmup', weightKg: 40, reps: 10, completed: true }),
        set('s1', { weightKg: 80, reps: 8, completed: true }),
        set('s2', { weightKg: 80, reps: 7 }),
        set('s3'),
      ]),
    ]);
    expect(countSets(d)).toEqual({ completed: 2, total: 3, unticked: 1 });
    expect(draftVolumeKg(d)).toBe(640);
  });
});

describe('buildWorkoutPayload', () => {
  const d = draft(
    [
      block(
        'a',
        'bench',
        [
          set('s1', { weightKg: 80, reps: 8, rpe: 8, completed: true }),
          set('s2'), // empty + incomplete → dropped
          set('s3', { weightKg: 80, reps: 6 }), // filled but unticked → kept as incomplete
        ],
        { notes: '  elbows tucked ' },
      ),
      block('b', 'fly', [set('s4'), set('s5')]), // only empty sets → whole exercise dropped
      block('c', 'plank', [set('s6', { durationSec: 60, completed: true })]),
    ],
    { name: '  ', notes: ' felt good ', bodyweightKg: 81.5 },
  );

  it('drops empty sets and empty exercises and renumbers orders', () => {
    const w = buildWorkoutPayload(d, { endedAt: '2026-11-10T18:05:00.000Z' });
    expect(w).toMatchObject({
      id: 'w1',
      routineId: null,
      name: 'Workout',
      startedAt: '2026-11-10T17:00:00.000Z',
      endedAt: '2026-11-10T18:05:00.000Z',
      notes: 'felt good',
      bodyweightKg: 81.5,
    });
    expect(w.sets.map((s) => [s.id, s.exerciseId, s.exerciseOrder, s.setOrder, s.completed])).toEqual([
      ['s1', 'bench', 0, 0, true],
      ['s3', 'bench', 0, 1, false],
      ['s6', 'plank', 1, 0, true],
    ]);
    expect(w.sets[0]).toEqual({
      id: 's1',
      exerciseId: 'bench',
      exerciseOrder: 0,
      setOrder: 0,
      kind: 'working',
      weightKg: 80,
      reps: 8,
      durationSec: null,
      rpe: 8,
      completed: true,
      notes: 'elbows tucked',
    });
    expect(w.sets[1]!.notes).toBeNull();
  });

  it('can also drop filled-but-unticked sets', () => {
    const w = buildWorkoutPayload(d, { dropIncomplete: true });
    expect(w.sets.map((s) => s.id)).toEqual(['s1', 's6']);
    expect(w.endedAt).toBeNull(); // keeps the draft's own endedAt by default
  });

  it('round-trips through draftFromWorkout (edit mode keeps ids and completion)', () => {
    const w = buildWorkoutPayload(d, { endedAt: '2026-11-10T18:05:00.000Z' });
    const back = draftFromWorkout(w, { userId: 'u1', mode: 'edit', restFor: () => 90 });
    expect(back.mode).toBe('edit');
    expect(back.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'plank']);
    expect(back.exercises[0]!.notes).toBe('elbows tucked');
    expect(buildWorkoutPayload(back).sets).toEqual(w.sets);
  });

  it('repeat creates fresh ids and nothing completed', () => {
    const w = buildWorkoutPayload(d, { endedAt: '2026-11-10T18:05:00.000Z' });
    let n = 0;
    const rep = draftFromWorkout(w, { userId: 'u1', mode: 'live', restFor: () => 90, newId: () => `id${++n}`, asNew: { startedAt: '2026-11-12T10:00:00.000Z' } });
    expect(rep.id).not.toBe(w.id);
    expect(rep.endedAt).toBeNull();
    expect(rep.exercises.flatMap((e) => e.sets).every((s) => !s.completed && s.id.startsWith('id'))).toBe(true);
  });
});

describe('draftFactory', () => {
  const bench: Exercise = {
    id: 'barbell-bench-press',
    name: 'Bench Press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps'],
    equipment: 'barbell',
    mechanic: 'compound',
    trackingType: 'weight_reps',
    isCustom: false,
  };
  const plank: Exercise = { ...bench, id: 'plank', name: 'Plank', trackingType: 'duration', equipment: 'bodyweight', mechanic: 'isolation' };

  it('prefills a routine from the plan suggestion', () => {
    const routine: Routine = {
      id: 'r1',
      name: 'Push',
      notes: '',
      position: 0,
      createdAt: '',
      updatedAt: '',
      items: [
        { exerciseId: 'barbell-bench-press', sets: 3, repMin: 6, repMax: 10, restSec: 150 },
        { exerciseId: 'plank', sets: 2, repMin: 30, repMax: 60, restSec: 60 },
      ],
    };
    const plan: WeeklyPlan = {
      weekStart: '2026-11-09',
      generatedAt: '',
      nextRoutineId: 'r1',
      volume: [],
      recommendations: [],
      deloadRecommended: false,
      routines: [
        {
          routineId: 'r1',
          routineName: 'Push',
          exercises: [
            {
              exerciseId: 'barbell-bench-press',
              action: 'increase_weight',
              sets: 3,
              weightKg: 82.5,
              repsPerSet: [6, 6, 6],
              repMin: 6,
              repMax: 10,
              reason: 'Hit 3×10 at 80 kg — add 2.5 kg',
              lastPerformance: null,
              e1rmKg: 100,
              stalled: false,
            },
          ],
        },
      ],
    };
    let n = 0;
    const d = draftFromRoutine({ routine, plan, userId: 'u1', getExercise: (id) => (id === 'plank' ? plank : bench), newId: () => `id${++n}`, now: new Date(NOW) });
    expect(d.routineId).toBe('r1');
    expect(d.name).toBe('Push');
    const [b, p] = d.exercises;
    expect(b!.hint).toEqual({ action: 'increase_weight', reason: 'Hit 3×10 at 80 kg — add 2.5 kg' });
    expect(b!.sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [82.5, 6],
      [82.5, 6],
      [82.5, 6],
    ]);
    expect(b!.restSec).toBe(150);
    // no suggestion → item sets, nothing prefilled
    expect(p!.sets).toHaveLength(2);
    expect(p!.sets.every((s) => s.durationSec === null && s.reps === null)).toBe(true);
  });

  it('falls back to last session working sets', () => {
    let n = 0;
    const blk = newExerciseBlock({
      exerciseId: 'barbell-bench-press',
      exercise: bench,
      item: { sets: 3, repMin: 8, repMax: 12, restSec: 120 },
      last: {
        workoutId: 'old',
        date: '2026-11-01T10:00:00.000Z',
        sets: [
          { id: 'x0', exerciseId: 'barbell-bench-press', exerciseOrder: 0, setOrder: 0, kind: 'warmup', weightKg: 40, reps: 10, durationSec: null, rpe: null, completed: true },
          { id: 'x1', exerciseId: 'barbell-bench-press', exerciseOrder: 0, setOrder: 1, kind: 'working', weightKg: 70, reps: 10, durationSec: null, rpe: null, completed: true },
          { id: 'x2', exerciseId: 'barbell-bench-press', exerciseOrder: 0, setOrder: 2, kind: 'working', weightKg: 70, reps: 9, durationSec: null, rpe: null, completed: true },
        ],
      },
      newId: () => `id${++n}`,
    });
    expect(blk.sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [70, 10],
      [70, 9],
      [70, 9],
    ]);
  });
});
