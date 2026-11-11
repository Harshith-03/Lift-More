import type {
  BodyweightEntry,
  Equipment,
  Exercise,
  Experience,
  Goal,
  Mechanic,
  MuscleGroup,
  Routine,
  RoutineItem,
  SetKind,
  TrackingType,
  Unit,
  User,
  Workout,
  WorkoutSet,
} from '../../shared/types';

/**
 * Row → API type normalisation. Drivers differ (pg vs PGlite, text vs parsed), so everything that leaves
 * the DB goes through here: timestamptz → ISO string, date → YYYY-MM-DD, numerics → number, jsonb → object.
 */

type Ts = Date | string;

export function iso(v: Ts): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}
export function isoOrNull(v: Ts | null | undefined): string | null {
  return v === null || v === undefined ? null : iso(v);
}
export function ymd(v: Ts): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}
export function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}
export function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}
export function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

// ── users ──

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  unit: string;
  goal: string;
  experience: string;
  days_per_week: number;
  default_rest_sec: number;
  timezone: string;
  bar_weight_kg: number;
  onboarded: boolean;
  created_at: Ts;
}

export function toUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    unit: r.unit as Unit,
    goal: r.goal as Goal,
    experience: r.experience as Experience,
    daysPerWeek: num(r.days_per_week),
    defaultRestSec: num(r.default_rest_sec),
    timezone: r.timezone,
    barWeightKg: num(r.bar_weight_kg),
    onboarded: Boolean(r.onboarded),
    createdAt: iso(r.created_at),
  };
}

// ── custom exercises ──

export interface CustomExerciseRow {
  id: string;
  user_id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: unknown;
  equipment: string;
  mechanic: string;
  tracking_type: string;
  cue: string | null;
  created_at: Ts;
}

export function toExercise(r: CustomExerciseRow): Exercise {
  const ex: Exercise = {
    id: r.id,
    name: r.name,
    primaryMuscle: r.primary_muscle as MuscleGroup,
    secondaryMuscles: json<MuscleGroup[]>(r.secondary_muscles, []),
    equipment: r.equipment as Equipment,
    mechanic: r.mechanic as Mechanic,
    trackingType: r.tracking_type as TrackingType,
    isCustom: true,
  };
  if (r.cue) ex.cue = r.cue;
  return ex;
}

// ── routines ──

export interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  notes: string;
  position: number;
  items: unknown;
  created_at: Ts;
  updated_at: Ts;
}

export function toRoutine(r: RoutineRow): Routine {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? '',
    position: num(r.position),
    items: json<RoutineItem[]>(r.items, []).map(cleanItem),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function cleanItem(i: RoutineItem): RoutineItem {
  const out: RoutineItem = {
    exerciseId: i.exerciseId,
    sets: num(i.sets),
    repMin: num(i.repMin),
    repMax: num(i.repMax),
    restSec: num(i.restSec),
  };
  if (i.notes) out.notes = i.notes;
  return out;
}

// ── workouts ──

export interface WorkoutRow {
  id: string;
  user_id: string;
  routine_id: string | null;
  name: string;
  started_at: Ts;
  ended_at: Ts | null;
  notes: string;
  bodyweight_kg: number | null;
  created_at: Ts;
  updated_at: Ts;
}

export interface SetRow {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  exercise_order: number;
  set_order: number;
  kind: string;
  weight_kg: number | null;
  reps: number | null;
  duration_sec: number | null;
  rpe: number | null;
  completed: boolean;
  notes: string | null;
}

export function toSet(r: SetRow): WorkoutSet {
  return {
    id: r.id,
    exerciseId: r.exercise_id,
    exerciseOrder: num(r.exercise_order),
    setOrder: num(r.set_order),
    kind: r.kind as SetKind,
    weightKg: numOrNull(r.weight_kg),
    reps: numOrNull(r.reps),
    durationSec: numOrNull(r.duration_sec),
    rpe: numOrNull(r.rpe),
    completed: Boolean(r.completed),
    notes: r.notes ?? null,
  };
}

export function toWorkout(r: WorkoutRow, sets: SetRow[]): Workout {
  return {
    id: r.id,
    routineId: r.routine_id ?? null,
    name: r.name,
    startedAt: iso(r.started_at),
    endedAt: isoOrNull(r.ended_at),
    notes: r.notes ?? '',
    bodyweightKg: numOrNull(r.bodyweight_kg),
    sets: sets.map(toSet),
    updatedAt: iso(r.updated_at),
  };
}

// ── bodyweight ──

export interface BodyweightRow {
  id: string;
  user_id: string;
  date: Ts;
  weight_kg: number;
}

export function toBodyweight(r: BodyweightRow): BodyweightEntry {
  return { id: r.id, date: ymd(r.date), weightKg: num(r.weight_kg) };
}
