import { randomUUID } from 'node:crypto';
import type { ExerciseSession, Workout, WorkoutSummary } from '../../shared/types';
import type { Queryable } from '../db/types';
import { iso, toSet, toWorkout, type SetRow, type WorkoutRow } from './mappers';
import { insertMany } from './sql';

export interface LoadOpts {
  /** started_at >= since */
  since?: Date;
  /** started_at <= startedAtOrBefore (the engine breaks same-instant ties itself) */
  startedAtOrBefore?: string;
  excludeId?: string;
  /** Only workouts containing these exercises, and only those exercises' sets. */
  exerciseIds?: string[];
}

/** User's workouts with their sets, newest first. Two queries total (no N+1). */
export async function loadWorkouts(q: Queryable, userId: string, opts: LoadOpts = {}): Promise<Workout[]> {
  const where = ['w.user_id = $1'];
  const params: unknown[] = [userId];
  if (opts.since) {
    params.push(opts.since.toISOString());
    where.push(`w.started_at >= $${params.length}`);
  }
  if (opts.startedAtOrBefore) {
    params.push(opts.startedAtOrBefore);
    where.push(`w.started_at <= $${params.length}`);
  }
  if (opts.excludeId) {
    params.push(opts.excludeId);
    where.push(`w.id <> $${params.length}`);
  }
  if (opts.exerciseIds) {
    if (opts.exerciseIds.length === 0) return [];
    params.push(opts.exerciseIds);
    where.push(
      `EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_id = w.id AND s.exercise_id = ANY($${params.length}::text[]))`,
    );
  }
  const rows = await q.query<WorkoutRow>(
    `SELECT w.* FROM workouts w WHERE ${where.join(' AND ')} ORDER BY w.started_at DESC, w.id DESC`,
    params,
  );
  return attachSets(q, userId, rows, opts.exerciseIds);
}

async function attachSets(q: Queryable, userId: string, rows: WorkoutRow[], exerciseIds?: string[]): Promise<Workout[]> {
  if (rows.length === 0) return [];
  const params: unknown[] = [rows.map((r) => r.id), userId];
  let filter = '';
  if (exerciseIds) {
    params.push(exerciseIds);
    filter = ' AND exercise_id = ANY($3::text[])';
  }
  const sets = await q.query<SetRow>(
    `SELECT * FROM workout_sets WHERE workout_id = ANY($1::uuid[]) AND user_id = $2${filter}
     ORDER BY exercise_order, set_order`,
    params,
  );
  const byWorkout = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = byWorkout.get(s.workout_id);
    if (list) list.push(s);
    else byWorkout.set(s.workout_id, [s]);
  }
  return rows.map((r) => toWorkout(r, byWorkout.get(r.id) ?? []));
}

export async function getWorkout(q: Queryable, userId: string, id: string): Promise<Workout | undefined> {
  const rows = await q.query<WorkoutRow>('SELECT * FROM workouts WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rows[0]) return undefined;
  const [w] = await attachSets(q, userId, rows);
  return w;
}

/**
 * Idempotent upsert: writes the workout row and replaces all its sets.
 * Returns 'foreign' (and writes nothing) if the id belongs to another user.
 * Set ids already used by any *other* workout are re-issued so a replayed/imported payload can never collide.
 */
export async function upsertWorkout(tx: Queryable, userId: string, w: Workout): Promise<'ok' | 'foreign'> {
  const existing = await tx.query<{ user_id: string }>('SELECT user_id FROM workouts WHERE id = $1 FOR UPDATE', [w.id]);
  if (existing[0] && existing[0].user_id !== userId) return 'foreign';

  const written = await tx.query(
    `INSERT INTO workouts (id, user_id, routine_id, name, started_at, ended_at, notes, bodyweight_kg)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       routine_id = EXCLUDED.routine_id, name = EXCLUDED.name, started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at, notes = EXCLUDED.notes, bodyweight_kg = EXCLUDED.bodyweight_kg, updated_at = now()
     WHERE workouts.user_id = EXCLUDED.user_id
     RETURNING id`,
    [w.id, userId, w.routineId, w.name, w.startedAt, w.endedAt, w.notes ?? '', w.bodyweightKg],
  );
  if (written.length === 0) return 'foreign';

  await tx.query('DELETE FROM workout_sets WHERE workout_id = $1 AND user_id = $2', [w.id, userId]);
  if (w.sets.length === 0) return 'ok';

  const taken = new Set(
    (
      await tx.query<{ id: string }>('SELECT id FROM workout_sets WHERE id = ANY($1::uuid[])', [w.sets.map((s) => s.id)])
    ).map((r) => r.id),
  );
  await insertMany(
    tx,
    'workout_sets',
    [
      'id',
      'workout_id',
      'user_id',
      'exercise_id',
      'exercise_order',
      'set_order',
      'kind',
      'weight_kg',
      'reps',
      'duration_sec',
      'rpe',
      'completed',
      'notes',
    ],
    w.sets.map((s) => [
      taken.has(s.id) ? randomUUID() : s.id,
      w.id,
      userId,
      s.exerciseId,
      s.exerciseOrder,
      s.setOrder,
      s.kind,
      s.weightKg,
      s.reps,
      s.durationSec,
      s.rpe,
      s.completed,
      s.notes ?? null,
    ]),
  );
  return 'ok';
}

export async function deleteWorkout(q: Queryable, userId: string, id: string): Promise<boolean> {
  const rows = await q.query('DELETE FROM workouts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return rows.length > 0;
}

/** Newest-first summaries, cursor = started_at of the last item seen. */
export async function listSummaries(
  q: Queryable,
  userId: string,
  limit: number,
  before?: string,
): Promise<WorkoutSummary[]> {
  const params: unknown[] = [userId, limit];
  let cursor = '';
  if (before) {
    params.push(before);
    cursor = ' AND started_at < $3';
  }
  const rows = await q.query<WorkoutRow>(
    `SELECT * FROM workouts WHERE user_id = $1${cursor} ORDER BY started_at DESC, id DESC LIMIT $2`,
    params,
  );
  if (rows.length === 0) return [];
  const sets = await q.query<
    Pick<SetRow, 'workout_id' | 'exercise_id' | 'exercise_order' | 'set_order' | 'kind' | 'completed' | 'weight_kg' | 'reps'>
  >(
    `SELECT workout_id, exercise_id, exercise_order, set_order, kind, completed, weight_kg, reps
     FROM workout_sets WHERE workout_id = ANY($1::uuid[]) AND user_id = $2 ORDER BY exercise_order, set_order`,
    [rows.map((r) => r.id), userId],
  );
  const agg = new Map<string, { exerciseIds: string[]; setCount: number; volumeKg: number }>();
  for (const r of rows) agg.set(r.id, { exerciseIds: [], setCount: 0, volumeKg: 0 });
  for (const s of sets) {
    const a = agg.get(s.workout_id);
    if (!a) continue;
    if (!a.exerciseIds.includes(s.exercise_id)) a.exerciseIds.push(s.exercise_id);
    if (s.completed && s.kind !== 'warmup') {
      a.setCount += 1;
      if (s.weight_kg !== null && s.reps !== null) a.volumeKg += Number(s.weight_kg) * Number(s.reps);
    }
  }
  return rows.map((r) => {
    const a = agg.get(r.id)!;
    const startedAt = iso(r.started_at);
    const endedAt = r.ended_at ? iso(r.ended_at) : null;
    return {
      id: r.id,
      routineId: r.routine_id ?? null,
      name: r.name,
      startedAt,
      endedAt,
      durationSec: endedAt ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)) : null,
      exerciseIds: a.exerciseIds,
      setCount: a.setCount,
      volumeKg: Math.round(a.volumeKg * 100) / 100,
    };
  });
}

/** Most recent session (completed non-warm-up sets) per exercise; null when never performed. */
export async function lastSessions(
  q: Queryable,
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, ExerciseSession | null>> {
  const out: Record<string, ExerciseSession | null> = {};
  for (const id of exerciseIds) out[id] = null;
  if (exerciseIds.length === 0) return out;

  const latest = await q.query<{ exercise_id: string; workout_id: string; started_at: Date | string }>(
    `SELECT DISTINCT ON (s.exercise_id) s.exercise_id, w.id AS workout_id, w.started_at
     FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.user_id = $1 AND w.user_id = $1 AND s.exercise_id = ANY($2::text[])
       AND s.completed AND s.kind <> 'warmup'
     ORDER BY s.exercise_id, w.started_at DESC, w.id DESC`,
    [userId, exerciseIds],
  );
  if (latest.length === 0) return out;

  const sets = await q.query<SetRow>(
    `SELECT * FROM workout_sets
     WHERE user_id = $1 AND workout_id = ANY($2::uuid[]) AND exercise_id = ANY($3::text[])
       AND completed AND kind <> 'warmup'
     ORDER BY exercise_order, set_order`,
    [userId, [...new Set(latest.map((l) => l.workout_id))], latest.map((l) => l.exercise_id)],
  );
  for (const l of latest) {
    out[l.exercise_id] = {
      workoutId: l.workout_id,
      date: iso(l.started_at),
      sets: sets.filter((s) => s.workout_id === l.workout_id && s.exercise_id === l.exercise_id).map(toSet),
    };
  }
  return out;
}
