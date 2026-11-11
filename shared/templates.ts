import type { RoutineItem, RoutineTemplate } from './types';

/** Compact item builder: exercise, sets, repMin, repMax, rest (s), optional note. */
function it(exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number, notes?: string): RoutineItem {
  return notes ? { exerciseId, sets, repMin, repMax, restSec, notes } : { exerciseId, sets, repMin, repMax, restSec };
}

export const TEMPLATES: RoutineTemplate[] = [
  {
    id: 'full-body-3x',
    name: 'Full Body 3x',
    description:
      'Three full-body sessions a week built on the big barbell lifts plus a few accessories. The simplest way to start lifting and progress quickly.',
    daysPerWeek: 3,
    level: 'beginner',
    goal: 'general',
    routines: [
      {
        name: 'Full Body A',
        notes: 'Squat and bench focus. Leave 1–2 reps in reserve on the main lifts.',
        items: [
          it('barbell-back-squat', 3, 5, 8, 180),
          it('barbell-bench-press', 3, 5, 8, 180),
          it('barbell-row', 3, 8, 10, 120),
          it('dumbbell-lateral-raise', 2, 10, 15, 60),
          it('plank', 3, 30, 60, 60, 'Seconds per set.'),
        ],
      },
      {
        name: 'Full Body B',
        notes: 'Hinge and overhead focus.',
        items: [
          it('romanian-deadlift', 3, 6, 10, 150),
          it('overhead-press', 3, 5, 8, 150),
          it('lat-pulldown', 3, 8, 12, 90),
          it('goblet-squat', 3, 10, 12, 90),
          it('dumbbell-curl', 2, 10, 12, 60),
          it('triceps-pushdown', 2, 10, 12, 60),
          it('farmers-carry', 2, 30, 45, 90, 'Seconds per carry — go heavy.'),
        ],
      },
      {
        name: 'Full Body C',
        notes: 'Machine-friendly day — higher reps.',
        items: [
          it('leg-press', 3, 8, 12, 120),
          it('incline-dumbbell-press', 3, 8, 12, 120),
          it('seated-cable-row', 3, 8, 12, 90),
          it('lying-leg-curl', 3, 10, 12, 75),
          it('face-pull', 2, 12, 15, 60),
          it('standing-calf-raise', 3, 10, 15, 60),
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper/Lower 4x',
    description:
      'Four days a week alternating upper- and lower-body sessions: one heavier, one higher-rep day for each. Every muscle gets trained twice a week.',
    daysPerWeek: 4,
    level: 'intermediate',
    goal: 'hypertrophy',
    routines: [
      {
        name: 'Upper A',
        notes: 'Heavier day — main presses and rows in the 5–8 range.',
        items: [
          it('barbell-bench-press', 4, 5, 8, 180),
          it('barbell-row', 4, 6, 10, 150),
          it('seated-dumbbell-shoulder-press', 3, 8, 12, 120),
          it('lat-pulldown', 3, 8, 12, 90),
          it('skull-crusher', 3, 8, 12, 75),
          it('dumbbell-curl', 3, 8, 12, 75),
          it('reverse-pec-deck', 2, 12, 15, 60),
          it('dumbbell-shrug', 2, 10, 15, 60),
        ],
      },
      {
        name: 'Lower A',
        notes: 'Heavier day — squat and hinge.',
        items: [
          it('barbell-back-squat', 4, 5, 8, 180),
          it('romanian-deadlift', 3, 6, 10, 150),
          it('leg-press', 3, 10, 15, 120),
          it('seated-leg-curl', 3, 10, 12, 75),
          it('standing-calf-raise', 4, 8, 12, 60),
          it('cable-crunch', 4, 10, 15, 60),
        ],
      },
      {
        name: 'Upper B',
        notes: 'Volume day — controlled tempo, short rest on accessories.',
        items: [
          it('incline-dumbbell-press', 4, 8, 12, 120),
          it('pull-up', 4, 6, 10, 120),
          it('seated-cable-row', 3, 10, 12, 90),
          it('cable-fly', 3, 12, 15, 60),
          it('cable-lateral-raise', 3, 12, 15, 60),
          it('face-pull', 3, 12, 15, 60),
          it('triceps-pushdown', 3, 10, 15, 60),
          it('hammer-curl', 3, 10, 12, 60),
        ],
      },
      {
        name: 'Lower B',
        notes: 'Volume day — single-leg and machine work.',
        items: [
          it('hack-squat', 3, 8, 12, 150),
          it('hip-thrust', 3, 8, 12, 120),
          it('bulgarian-split-squat', 3, 8, 12, 90),
          it('leg-extension', 3, 12, 15, 60),
          it('lying-leg-curl', 3, 10, 15, 60),
          it('seated-calf-raise', 4, 12, 15, 60),
          it('hanging-leg-raise', 4, 8, 15, 60),
        ],
      },
    ],
  },
  {
    id: 'ppl',
    name: 'Push/Pull/Legs',
    description:
      'Six days a week: push, pull and legs twice each. A heavier A rotation and a higher-rep B rotation for high weekly volume.',
    daysPerWeek: 6,
    level: 'intermediate',
    goal: 'hypertrophy',
    routines: [
      {
        name: 'Push A',
        notes: 'Chest, shoulders, triceps — heavy bench first.',
        items: [
          it('barbell-bench-press', 4, 5, 8, 180),
          it('overhead-press', 3, 6, 10, 150),
          it('incline-dumbbell-press', 3, 8, 12, 120),
          it('dumbbell-lateral-raise', 4, 12, 15, 60),
          it('triceps-pushdown', 3, 10, 12, 60),
          it('overhead-cable-triceps-extension', 3, 10, 15, 60),
        ],
      },
      {
        name: 'Pull A',
        notes: 'Back, rear delts, biceps — heavy rows first.',
        items: [
          it('barbell-row', 4, 6, 10, 150),
          it('pull-up', 3, 6, 10, 120),
          it('seated-cable-row', 3, 10, 12, 90),
          it('face-pull', 3, 12, 15, 60),
          it('barbell-curl', 3, 8, 12, 75),
          it('hammer-curl', 2, 10, 12, 60),
        ],
      },
      {
        name: 'Legs A',
        notes: 'Squat-focused.',
        items: [
          it('barbell-back-squat', 4, 5, 8, 180),
          it('romanian-deadlift', 3, 8, 10, 150),
          it('leg-press', 3, 10, 15, 120),
          it('leg-extension', 3, 12, 15, 60),
          it('seated-leg-curl', 3, 10, 12, 60),
          it('standing-calf-raise', 4, 8, 12, 60),
          it('cable-crunch', 4, 10, 15, 60),
        ],
      },
      {
        name: 'Push B',
        notes: 'Higher reps, more stretch.',
        items: [
          it('incline-barbell-bench-press', 4, 6, 10, 150),
          it('machine-shoulder-press', 3, 8, 12, 120),
          it('dip', 3, 8, 12, 90),
          it('cable-fly', 3, 12, 15, 60),
          it('cable-lateral-raise', 3, 12, 15, 60),
          it('skull-crusher', 3, 10, 12, 75),
        ],
      },
      {
        name: 'Pull B',
        notes: 'Vertical pull focus.',
        items: [
          it('lat-pulldown', 4, 8, 12, 120),
          it('chest-supported-dumbbell-row', 3, 8, 12, 90),
          it('straight-arm-pulldown', 3, 12, 15, 60),
          it('reverse-pec-deck', 3, 12, 15, 60),
          it('dumbbell-shrug', 3, 10, 15, 60),
          it('incline-dumbbell-curl', 3, 10, 12, 60),
        ],
      },
      {
        name: 'Legs B',
        notes: 'Hinge- and glute-focused.',
        items: [
          it('conventional-deadlift', 3, 4, 6, 210),
          it('hack-squat', 3, 8, 12, 150),
          it('hip-thrust', 3, 8, 12, 120),
          it('lying-leg-curl', 3, 10, 15, 75),
          it('adductor-machine', 2, 12, 15, 60),
          it('seated-calf-raise', 4, 12, 15, 60),
          it('hanging-leg-raise', 3, 8, 15, 60),
        ],
      },
    ],
  },
  {
    id: '5x5-strength',
    name: 'Strength 5×5',
    description:
      'Two alternating barbell sessions, three days a week. Five sets of five on the main lifts; add weight every session while the reps are clean.',
    daysPerWeek: 3,
    level: 'beginner',
    goal: 'strength',
    routines: [
      {
        name: 'Workout A',
        notes: 'Squat, bench, row. Alternate with Workout B.',
        items: [
          it('barbell-back-squat', 5, 5, 5, 180),
          it('barbell-bench-press', 5, 5, 5, 180),
          it('barbell-row', 5, 5, 5, 150),
          it('plank', 2, 30, 60, 60, 'Seconds per set.'),
        ],
      },
      {
        name: 'Workout B',
        notes: 'Squat, overhead press, deadlift. Alternate with Workout A.',
        items: [
          it('barbell-back-squat', 5, 5, 5, 180),
          it('overhead-press', 5, 5, 5, 180),
          it('conventional-deadlift', 2, 5, 5, 240),
          it('chin-up', 3, 5, 8, 120),
        ],
      },
    ],
  },
  {
    id: 'dumbbell-home-3x',
    name: 'Dumbbell-only Home 3x',
    description:
      'Three full-body sessions that need nothing but a pair of adjustable dumbbells, a bench (or sturdy chair) and some floor space.',
    daysPerWeek: 3,
    level: 'beginner',
    goal: 'general',
    routines: [
      {
        name: 'Home A',
        notes: 'Squat and press.',
        items: [
          it('goblet-squat', 3, 8, 15, 90),
          it('dumbbell-bench-press', 3, 8, 12, 90),
          it('single-arm-dumbbell-row', 4, 8, 12, 75),
          it('dumbbell-lateral-raise', 3, 12, 15, 60),
          it('dumbbell-curl', 2, 10, 15, 60),
          it('plank', 3, 30, 60, 45, 'Seconds per set.'),
        ],
      },
      {
        name: 'Home B',
        notes: 'Hinge and overhead.',
        items: [
          it('dumbbell-romanian-deadlift', 4, 8, 12, 90),
          it('seated-dumbbell-shoulder-press', 3, 8, 12, 90),
          it('chest-supported-dumbbell-row', 3, 10, 12, 75),
          it('dumbbell-glute-bridge', 4, 10, 15, 60),
          it('overhead-dumbbell-triceps-extension', 2, 10, 15, 60),
          it('dumbbell-shrug', 2, 10, 15, 60),
          it('single-leg-dumbbell-calf-raise', 3, 10, 15, 45),
        ],
      },
      {
        name: 'Home C',
        notes: 'Single-leg and push-up day.',
        items: [
          it('bulgarian-split-squat', 3, 8, 12, 90),
          it('push-up', 3, 8, 20, 75),
          it('incline-dumbbell-press', 3, 8, 12, 90),
          it('dumbbell-pullover', 2, 10, 15, 60),
          it('rear-delt-fly', 3, 12, 15, 60),
          it('hammer-curl', 2, 10, 15, 60),
          it('crunch', 3, 12, 20, 45),
        ],
      },
    ],
  },
  {
    id: 'body-part-split-5x',
    name: 'Body-Part Split 5x',
    description:
      'Five days a week, one major area per session for maximum per-session volume. Best for experienced lifters who recover well.',
    daysPerWeek: 5,
    level: 'advanced',
    goal: 'hypertrophy',
    routines: [
      {
        name: 'Chest',
        notes: 'Press heavy first, then stretch-focused work.',
        items: [
          it('barbell-bench-press', 4, 6, 10, 180),
          it('incline-dumbbell-press', 4, 8, 12, 120),
          it('machine-chest-press', 3, 10, 12, 90),
          it('cable-fly', 3, 12, 15, 60),
          it('dip', 3, 8, 12, 90),
        ],
      },
      {
        name: 'Back',
        notes: 'Vertical and horizontal pulls.',
        items: [
          it('pull-up', 4, 6, 10, 120),
          it('barbell-row', 4, 6, 10, 150),
          it('lat-pulldown', 3, 10, 12, 90),
          it('seated-cable-row', 3, 10, 12, 90),
          it('straight-arm-pulldown', 3, 12, 15, 60),
          it('face-pull', 2, 12, 15, 60),
          it('back-extension', 3, 10, 15, 60),
        ],
      },
      {
        name: 'Shoulders',
        notes: 'All three delt heads plus traps.',
        items: [
          it('overhead-press', 4, 6, 10, 150),
          it('arnold-press', 3, 8, 12, 90),
          it('dumbbell-lateral-raise', 4, 12, 20, 60),
          it('cable-lateral-raise', 3, 12, 15, 60),
          it('reverse-pec-deck', 4, 12, 15, 60),
          it('barbell-shrug', 4, 8, 12, 75),
          it('hanging-leg-raise', 3, 8, 15, 60),
        ],
      },
      {
        name: 'Legs',
        notes: 'Quads, hamstrings, glutes, calves.',
        items: [
          it('barbell-back-squat', 4, 6, 10, 180),
          it('romanian-deadlift', 4, 8, 10, 150),
          it('leg-press', 3, 10, 15, 120),
          it('hip-thrust', 3, 8, 12, 120),
          it('leg-extension', 3, 12, 15, 60),
          it('seated-leg-curl', 3, 10, 15, 60),
          it('standing-calf-raise', 4, 10, 15, 60),
          it('seated-calf-raise', 4, 12, 15, 60),
          it('adductor-machine', 2, 12, 15, 60),
        ],
      },
      {
        name: 'Arms',
        notes: 'Biceps and triceps supersets work well here.',
        items: [
          it('close-grip-bench-press', 3, 6, 10, 120),
          it('ez-bar-curl', 3, 8, 12, 75),
          it('skull-crusher', 3, 8, 12, 75),
          it('preacher-curl', 3, 10, 12, 60),
          it('triceps-pushdown', 3, 10, 15, 60),
          it('hammer-curl', 3, 10, 12, 60),
          it('cable-crunch', 3, 10, 15, 60),
          it('wrist-curl', 2, 12, 20, 45),
        ],
      },
    ],
  },
];
