/**
 * Lift More — shared domain + API contract.
 *
 * FROZEN during the parallel build. Every agent codes against this file; do not edit it.
 * If you need an extra type, define it locally in your own area.
 *
 * Conventions
 * - All weights are stored and transported in **kilograms** (`...Kg` fields). Convert only for display/input.
 * - Timestamps are ISO-8601 strings in UTC (`2026-11-10T18:30:00.000Z`).
 * - Calendar dates are `YYYY-MM-DD` strings in the user's timezone.
 * - Weeks start on **Monday**.
 * - IDs: entity ids are UUID v4 strings (client may generate them — workouts/sets always are client-generated).
 *   Built-in exercise ids are kebab-case slugs ("barbell-back-squat"); custom ones are "custom-<uuid>".
 */

// ───────────────────────────── Enums ─────────────────────────────

export type Unit = 'kg' | 'lb';
export type Goal = 'strength' | 'hypertrophy' | 'general';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export const MUSCLE_GROUPS = [
  'chest',
  'lats',
  'upper_back',
  'traps',
  'shoulders',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'ez_bar',
  'other',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export type Mechanic = 'compound' | 'isolation';

/**
 * How a set is measured.
 * - weight_reps:     weightKg + reps (bench press)
 * - bodyweight_reps: reps, optional added weightKg (pull-up, dip). weightKg null/0 = bodyweight only
 * - duration:        durationSec, optional weightKg (plank, carry)
 */
export type TrackingType = 'weight_reps' | 'bodyweight_reps' | 'duration';

export type SetKind = 'warmup' | 'working' | 'drop' | 'failure';

// ───────────────────────────── Users ─────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  unit: Unit;
  goal: Goal;
  experience: Experience;
  /** Planned training days per week (1–7). */
  daysPerWeek: number;
  /** Default rest timer in seconds. */
  defaultRestSec: number;
  /** IANA timezone, e.g. "America/New_York". Used for week boundaries. */
  timezone: string;
  /** Barbell weight used by plate math + warm-ups. Default 20 (kg) — 45 lb users get 20.41. */
  barWeightKg: number;
  /** False until the onboarding flow is completed. */
  onboarded: boolean;
  createdAt: string;
}

export type UserSettingsPatch = Partial<
  Pick<
    User,
    | 'displayName'
    | 'unit'
    | 'goal'
    | 'experience'
    | 'daysPerWeek'
    | 'defaultRestSec'
    | 'timezone'
    | 'barWeightKg'
    | 'onboarded'
  >
>;

export interface RegisterRequest {
  email: string;
  /** min 8 chars */
  password: string;
  displayName: string;
  timezone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ───────────────────────────── Exercises ─────────────────────────────

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  mechanic: Mechanic;
  trackingType: TrackingType;
  isCustom: boolean;
  /** One-line technique cue. */
  cue?: string;
}

export type CustomExerciseInput = Omit<Exercise, 'id' | 'isCustom'>;

// ───────────────────────────── Routines ─────────────────────────────

export interface RoutineItem {
  exerciseId: string;
  /** Working sets (warm-ups are extra). 1–10 */
  sets: number;
  /** Target rep range, e.g. 8–12. For duration exercises these are seconds. */
  repMin: number;
  repMax: number;
  restSec: number;
  notes?: string;
}

export interface Routine {
  id: string;
  name: string;
  notes: string;
  /** Order in the user's rotation (0-based). */
  position: number;
  items: RoutineItem[];
  createdAt: string;
  updatedAt: string;
}

export type RoutineInput = Pick<Routine, 'name' | 'notes' | 'items'> & { position?: number };

/** Built-in starter program (a set of routines). */
export interface RoutineTemplate {
  id: string; // e.g. "ppl", "upper-lower", "full-body-3x", "5x5-strength"
  name: string;
  description: string;
  daysPerWeek: number;
  level: Experience;
  goal: Goal;
  routines: Array<Pick<Routine, 'name' | 'notes' | 'items'>>;
}

// ───────────────────────────── Workouts ─────────────────────────────

export interface WorkoutSet {
  /** client-generated uuid */
  id: string;
  exerciseId: string;
  /** 0-based position of the exercise block within the workout. */
  exerciseOrder: number;
  /** 0-based position of the set within its exercise block. */
  setOrder: number;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  /** Rate of perceived exertion 5–10 (0.5 steps), or null if not recorded. */
  rpe: number | null;
  completed: boolean;
  notes?: string | null;
}

export interface Workout {
  /** client-generated uuid — makes PUT idempotent for offline retries */
  id: string;
  routineId: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  notes: string;
  bodyweightKg: number | null;
  sets: WorkoutSet[];
  updatedAt?: string;
}

export interface WorkoutSummary {
  id: string;
  routineId: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  exerciseIds: string[];
  /** completed working+failure+drop sets */
  setCount: number;
  /** Σ weightKg × reps over completed non-warmup sets */
  volumeKg: number;
}

// ───────────────────────────── Analytics ─────────────────────────────

/** One exercise's sets inside one workout. */
export interface ExerciseSession {
  workoutId: string;
  /** workout startedAt (ISO) */
  date: string;
  sets: WorkoutSet[];
}

export type PRType = 'e1rm' | 'weight' | 'reps' | 'volume' | 'duration';

export interface PersonalRecord {
  exerciseId: string;
  type: PRType;
  /** e1rm/weight/volume: kg. reps: count (at weightKg). duration: seconds. */
  value: number;
  weightKg: number | null;
  reps: number | null;
  date: string;
  workoutId: string;
}

export interface MuscleVolume {
  muscle: MuscleGroup;
  /** Hard sets this week: primary muscle counts 1, each secondary muscle 0.5. */
  sets: number;
  /** Recommended weekly hard-set range for the user's goal/experience. */
  target: { min: number; max: number };
}

export interface ExerciseHistory {
  exerciseId: string;
  /** most recent first */
  sessions: Array<
    ExerciseSession & {
      topSet: { weightKg: number | null; reps: number | null; durationSec: number | null } | null;
      e1rmKg: number | null;
      volumeKg: number;
    }
  >;
  prs: PersonalRecord[];
}

export interface StatsSummary {
  /** consecutive weeks (ending this or last week) with ≥1 workout */
  streakWeeks: number;
  workoutsThisWeek: number;
  /** = user.daysPerWeek */
  targetThisWeek: number;
  totalWorkouts: number;
  /** oldest → newest, last 12 weeks including the current one */
  weeklyVolume: Array<{ weekStart: string; volumeKg: number; sets: number; workouts: number }>;
  muscleVolumeThisWeek: MuscleVolume[];
  /** most recent first, max 10 */
  recentPRs: PersonalRecord[];
}

// ───────────────────────────── Progression / plan ─────────────────────────────

export type ProgressionAction =
  | 'increase_weight'
  | 'increase_reps'
  | 'increase_duration'
  | 'hold'
  | 'deload'
  | 'start';

export interface ExerciseSuggestion {
  exerciseId: string;
  action: ProgressionAction;
  sets: number;
  /** Suggested working weight, kg, already rounded to a loadable value in the user's unit. null = bodyweight / unknown. */
  weightKg: number | null;
  /** Target reps for each working set (length === sets). For duration exercises: seconds. */
  repsPerSet: number[];
  repMin: number;
  repMax: number;
  /** Short human-readable explanation shown in the UI. */
  reason: string;
  lastPerformance: { date: string; sets: Array<Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSec' | 'rpe'>> } | null;
  e1rmKg: number | null;
  /** No e1RM improvement over the last 3 sessions. */
  stalled: boolean;
}

export interface RoutinePlan {
  routineId: string;
  routineName: string;
  exercises: ExerciseSuggestion[];
}

export interface ExerciseRecommendation {
  type: 'add' | 'swap' | 'remove';
  /** add: exercise to add. swap/remove: exercise currently in the routine. */
  exerciseId: string;
  /** swap only: the replacement exercise. */
  replacementId?: string;
  routineId?: string;
  reason: string;
  source: 'rules' | 'ai';
}

export interface WeeklyPlan {
  /** Monday of the week being planned (YYYY-MM-DD, user tz). */
  weekStart: string;
  generatedAt: string;
  /** Routine to do next in the rotation (after the most recently performed one). null if no routines. */
  nextRoutineId: string | null;
  routines: RoutinePlan[];
  /** Volume for the last *completed* 7 days vs targets. */
  volume: MuscleVolume[];
  /** Rule-based exercise suggestions (under-trained muscles, stalled lifts). */
  recommendations: ExerciseRecommendation[];
  /** True if the engine recommends a deload week (multiple stalls / long streak of hard weeks). */
  deloadRecommended: boolean;
}

// ───────────────────────────── AI coach ─────────────────────────────

export interface CoachReview {
  weekStart: string;
  createdAt: string;
  model: string;
  /** 2–4 sentence overview. */
  summary: string;
  wins: string[];
  concerns: string[];
  /** Overrides / tweaks to the rule-based plan. */
  adjustments: Array<{ exerciseId: string; weightKg: number | null; reps: number | null; reason: string }>;
  exerciseChanges: ExerciseRecommendation[];
  /** One actionable tip for the week. */
  tip: string;
  /** true when served from cache */
  cached?: boolean;
}

export interface CoachAskRequest {
  question: string;
}
export interface CoachAskResponse {
  answer: string;
  model: string;
}

export interface CoachStatus {
  enabled: boolean;
  /** AI calls left for this user today. */
  remainingToday: number;
}

// ───────────────────────────── Body metrics ─────────────────────────────

export interface BodyweightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
}

// ───────────────────────────── Export ─────────────────────────────

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  user: Pick<User, 'displayName' | 'unit' | 'goal' | 'experience' | 'daysPerWeek' | 'defaultRestSec' | 'timezone' | 'barWeightKg'>;
  customExercises: Exercise[];
  routines: Routine[];
  workouts: Workout[];
  bodyweight: BodyweightEntry[];
}

// ───────────────────────────── API errors ─────────────────────────────

/** Every non-2xx JSON response has this shape. */
export interface ApiError {
  /** machine code: 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'ai_unavailable' | 'internal' */
  error: string;
  message: string;
  /** rate_limited only */
  retryAfterSec?: number;
  details?: unknown;
}
