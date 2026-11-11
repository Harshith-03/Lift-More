import type { Routine, RoutineInput } from '../../shared/types';
import type { Queryable } from '../db/types';
import { toRoutine, type RoutineRow } from './mappers';

export async function listRoutines(q: Queryable, userId: string): Promise<Routine[]> {
  const rows = await q.query<RoutineRow>(
    'SELECT * FROM routines WHERE user_id = $1 ORDER BY position, created_at, id',
    [userId],
  );
  return rows.map(toRoutine);
}

export async function getRoutine(q: Queryable, userId: string, id: string): Promise<Routine | undefined> {
  const rows = await q.query<RoutineRow>('SELECT * FROM routines WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] ? toRoutine(rows[0]) : undefined;
}

export async function nextPosition(q: Queryable, userId: string): Promise<number> {
  const rows = await q.query<{ p: number | null }>('SELECT max(position) AS p FROM routines WHERE user_id = $1', [
    userId,
  ]);
  const p = rows[0]?.p;
  return p === null || p === undefined ? 0 : Number(p) + 1;
}

export async function insertRoutine(
  q: Queryable,
  userId: string,
  r: { id: string; name: string; notes: string; items: RoutineInput['items']; position: number },
): Promise<Routine> {
  const rows = await q.query<RoutineRow>(
    `INSERT INTO routines (id, user_id, name, notes, position, items)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
    [r.id, userId, r.name, r.notes, r.position, JSON.stringify(r.items)],
  );
  return toRoutine(rows[0] as RoutineRow);
}

/** Insert-or-update by id, scoped to the user (another user's id → no row returned). */
export async function upsertRoutine(
  q: Queryable,
  userId: string,
  r: { id: string; name: string; notes: string; items: RoutineInput['items']; position: number },
): Promise<Routine | undefined> {
  const rows = await q.query<RoutineRow>(
    `INSERT INTO routines (id, user_id, name, notes, position, items)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, notes = EXCLUDED.notes, position = EXCLUDED.position, items = EXCLUDED.items, updated_at = now()
     WHERE routines.user_id = EXCLUDED.user_id
     RETURNING *`,
    [r.id, userId, r.name, r.notes, r.position, JSON.stringify(r.items)],
  );
  return rows[0] ? toRoutine(rows[0]) : undefined;
}

/** Re-number positions 0..n-1 keeping the current order. */
export async function compactPositions(q: Queryable, userId: string): Promise<void> {
  await q.query(
    `UPDATE routines r SET position = o.rn - 1
     FROM (SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS rn FROM routines WHERE user_id = $1) o
     WHERE r.id = o.id AND r.user_id = $1 AND r.position <> o.rn - 1`,
    [userId],
  );
}
