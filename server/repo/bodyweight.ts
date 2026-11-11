import { randomUUID } from 'node:crypto';
import type { BodyweightEntry } from '../../shared/types';
import type { Queryable } from '../db/types';
import { toBodyweight, type BodyweightRow } from './mappers';

export async function listBodyweight(q: Queryable, userId: string): Promise<BodyweightEntry[]> {
  const rows = await q.query<BodyweightRow>('SELECT * FROM bodyweight WHERE user_id = $1 ORDER BY date ASC', [userId]);
  return rows.map(toBodyweight);
}

/** Upsert by (user, date). `id` is only used when the row is new. */
export async function upsertBodyweight(
  q: Queryable,
  userId: string,
  date: string,
  weightKg: number,
  id: string = randomUUID(),
): Promise<BodyweightEntry> {
  const rows = await q.query<BodyweightRow>(
    `INSERT INTO bodyweight (id, user_id, date, weight_kg) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
     RETURNING *`,
    [id, userId, date, weightKg],
  );
  return toBodyweight(rows[0] as BodyweightRow);
}

export async function deleteBodyweight(q: Queryable, userId: string, date: string): Promise<boolean> {
  const rows = await q.query('DELETE FROM bodyweight WHERE user_id = $1 AND date = $2 RETURNING id', [userId, date]);
  return rows.length > 0;
}
