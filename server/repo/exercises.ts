import type { Exercise } from '../../shared/types';
import type { Queryable } from '../db/types';
import { toExercise, type CustomExerciseRow } from './mappers';

export async function listCustomExercises(q: Queryable, userId: string): Promise<Exercise[]> {
  const rows = await q.query<CustomExerciseRow>(
    'SELECT * FROM custom_exercises WHERE user_id = $1 ORDER BY created_at, id',
    [userId],
  );
  return rows.map(toExercise);
}

export async function getCustomExercise(q: Queryable, userId: string, id: string): Promise<Exercise | undefined> {
  const rows = await q.query<CustomExerciseRow>('SELECT * FROM custom_exercises WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return rows[0] ? toExercise(rows[0]) : undefined;
}

/** Insert or (if the id is already this user's) update. Never touches another user's row. */
export async function upsertCustomExercise(
  q: Queryable,
  userId: string,
  ex: Omit<Exercise, 'isCustom'>,
): Promise<Exercise | undefined> {
  const rows = await q.query<CustomExerciseRow>(
    `INSERT INTO custom_exercises (id, user_id, name, primary_muscle, secondary_muscles, equipment, mechanic, tracking_type, cue)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, primary_muscle = EXCLUDED.primary_muscle, secondary_muscles = EXCLUDED.secondary_muscles,
       equipment = EXCLUDED.equipment, mechanic = EXCLUDED.mechanic, tracking_type = EXCLUDED.tracking_type, cue = EXCLUDED.cue
     WHERE custom_exercises.user_id = EXCLUDED.user_id
     RETURNING *`,
    [
      ex.id,
      userId,
      ex.name,
      ex.primaryMuscle,
      JSON.stringify(ex.secondaryMuscles ?? []),
      ex.equipment,
      ex.mechanic,
      ex.trackingType,
      ex.cue ?? null,
    ],
  );
  return rows[0] ? toExercise(rows[0]) : undefined;
}

export async function deleteCustomExercise(q: Queryable, userId: string, id: string): Promise<boolean> {
  const rows = await q.query('DELETE FROM custom_exercises WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return rows.length > 0;
}
