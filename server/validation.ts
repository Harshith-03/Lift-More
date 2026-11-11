import { z } from 'zod';
import { EQUIPMENT, MUSCLE_GROUPS } from '../shared/types';

/** Bounds shared by every endpoint. */
export const LIMITS = {
  weightKg: 1000,
  reps: 200,
  rpeMin: 5,
  rpeMax: 10,
  setsPerExercise: 60,
  setsPerWorkout: 400,
  name: 80,
  notes: 2000,
  durationSec: 24 * 3600,
  routineItems: 40,
  routineRepRange: 3600, // duration exercises use seconds
  restSec: 3600,
  exerciseId: 100,
  question: 500,
} as const;

/** Any 8-4-4-4-12 hex id (Postgres `uuid` accepts all of them). */
export const uuid = z.guid();
export const isUuid = (s: string) => uuid.safeParse(s).success;

const name = z.string().trim().min(1).max(LIMITS.name);
const notes = z.string().max(LIMITS.notes);
const exerciseId = z.string().trim().min(1).max(LIMITS.exerciseId);
const isoDateTime = z.iso.datetime({ offset: true });
export const isoDate = z.iso.date();
const weightKg = z.number().min(0).max(LIMITS.weightKg);

export const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown IANA timezone');

// ── Auth / user ──

export const email = z
  .string()
  .trim()
  .max(254)
  .transform((s) => s.toLowerCase())
  .pipe(z.email());

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: name,
  timezone: timezone.optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const settingsPatchSchema = z.object({
  displayName: name.optional(),
  unit: z.enum(['kg', 'lb']).optional(),
  goal: z.enum(['strength', 'hypertrophy', 'general']).optional(),
  experience: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  daysPerWeek: z.int().min(1).max(7).optional(),
  defaultRestSec: z.int().min(0).max(LIMITS.restSec).optional(),
  timezone: timezone.optional(),
  barWeightKg: z.number().min(0).max(100).optional(),
  onboarded: z.boolean().optional(),
});

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

// ── Exercises ──

const muscle = z.enum(MUSCLE_GROUPS);
export const customExerciseSchema = z.object({
  name,
  primaryMuscle: muscle,
  secondaryMuscles: z
    .array(muscle)
    .max(MUSCLE_GROUPS.length)
    .default([])
    .transform((a) => [...new Set(a)]),
  equipment: z.enum(EQUIPMENT),
  mechanic: z.enum(['compound', 'isolation']),
  trackingType: z.enum(['weight_reps', 'bodyweight_reps', 'duration']),
  cue: z.string().trim().max(300).optional(),
});
export const customExercisePatchSchema = customExerciseSchema.partial().extend({
  secondaryMuscles: z
    .array(muscle)
    .max(MUSCLE_GROUPS.length)
    .transform((a) => [...new Set(a)])
    .optional(),
  cue: z.string().trim().max(300).nullable().optional(),
});

// ── Routines ──

export const routineItemSchema = z
  .object({
    exerciseId,
    sets: z.int().min(1).max(10),
    repMin: z.int().min(1).max(LIMITS.routineRepRange),
    repMax: z.int().min(1).max(LIMITS.routineRepRange),
    restSec: z.int().min(0).max(LIMITS.restSec),
    notes: z.string().max(LIMITS.notes).optional(),
  })
  .refine((i) => i.repMax >= i.repMin, { message: 'repMax must be ≥ repMin', path: ['repMax'] });

export const routineInputSchema = z.object({
  name,
  notes: notes.default(''),
  items: z.array(routineItemSchema).max(LIMITS.routineItems),
  position: z.int().min(0).max(10_000).optional(),
});

export const fromTemplateSchema = z.object({
  templateId: z.string().min(1).max(100),
  replaceExisting: z.boolean().optional(),
});

export const reorderSchema = z.object({
  ids: z
    .array(uuid)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique'),
});

// ── Workouts ──

export const workoutSetSchema = z.object({
  id: uuid,
  exerciseId,
  exerciseOrder: z.int().min(0).max(200),
  setOrder: z.int().min(0).max(LIMITS.setsPerExercise - 1),
  kind: z.enum(['warmup', 'working', 'drop', 'failure']),
  weightKg: weightKg.nullable(),
  reps: z.int().min(0).max(LIMITS.reps).nullable(),
  durationSec: z.int().min(0).max(LIMITS.durationSec).nullable(),
  rpe: z.number().min(LIMITS.rpeMin).max(LIMITS.rpeMax).nullable(),
  completed: z.boolean(),
  notes: z.string().max(LIMITS.notes).nullable().optional(),
});

export const workoutSchema = z
  .object({
    id: uuid,
    routineId: uuid.nullable(),
    name,
    startedAt: isoDateTime,
    endedAt: isoDateTime.nullable(),
    notes: notes.default(''),
    bodyweightKg: weightKg.nullable().default(null),
    sets: z.array(workoutSetSchema).max(LIMITS.setsPerWorkout),
    updatedAt: z.string().optional(),
  })
  .superRefine((w, ctx) => {
    const ids = new Set<string>();
    const perExercise = new Map<number, number>();
    w.sets.forEach((s, i) => {
      if (ids.has(s.id.toLowerCase())) ctx.addIssue({ code: 'custom', path: ['sets', i, 'id'], message: 'Duplicate set id' });
      ids.add(s.id.toLowerCase());
      const n = (perExercise.get(s.exerciseOrder) ?? 0) + 1;
      perExercise.set(s.exerciseOrder, n);
      if (n === LIMITS.setsPerExercise + 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['sets', i],
          message: `At most ${LIMITS.setsPerExercise} sets per exercise`,
        });
      }
    });
    if (w.endedAt && Date.parse(w.endedAt) < Date.parse(w.startedAt)) {
      ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'endedAt must be after startedAt' });
    }
  });

export const workoutListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: isoDateTime.optional(),
});

// ── History ──

export const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(30),
});
export const lastQuery = z.object({
  exerciseIds: z
    .string()
    .max(5000)
    .transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(exerciseId).max(100)),
});

// ── Bodyweight ──

export const bodyweightBody = z.object({ weightKg: z.number().gt(0).max(LIMITS.weightKg) });

// ── Coach ──

export const coachReviewBody = z.object({ force: z.boolean().optional() });
export const coachAskBody = z.object({ question: z.string().trim().min(1).max(LIMITS.question) });

// ── Export / import ──

const exportExerciseSchema = customExerciseSchema.extend({
  id: z.string().min(1).max(LIMITS.exerciseId),
  isCustom: z.boolean().optional(),
});

const exportRoutineSchema = z.object({
  id: uuid,
  name,
  notes: notes.default(''),
  position: z.int().min(0).max(10_000).default(0),
  items: z.array(routineItemSchema).max(LIMITS.routineItems),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const importSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  user: z
    .object({
      displayName: name.optional(),
      unit: z.enum(['kg', 'lb']).optional(),
      goal: z.enum(['strength', 'hypertrophy', 'general']).optional(),
      experience: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      daysPerWeek: z.int().min(1).max(7).optional(),
      defaultRestSec: z.int().min(0).max(LIMITS.restSec).optional(),
      timezone: timezone.optional(),
      barWeightKg: z.number().min(0).max(100).optional(),
    })
    .optional(),
  customExercises: z.array(exportExerciseSchema).max(1000).default([]),
  routines: z.array(exportRoutineSchema).max(500).default([]),
  workouts: z.array(workoutSchema).max(20_000).default([]),
  bodyweight: z
    .array(z.object({ id: uuid.optional(), date: isoDate, weightKg: z.number().gt(0).max(LIMITS.weightKg) }))
    .max(20_000)
    .default([]),
});
export type ImportBundle = z.output<typeof importSchema>;
