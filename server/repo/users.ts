import type { User, UserSettingsPatch } from '../../shared/types';
import type { Queryable } from '../db/types';
import { toUser, type UserRow } from './mappers';

export async function findUserByEmail(q: Queryable, email: string): Promise<UserRow | undefined> {
  const rows = await q.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
}

export async function findUserById(q: Queryable, id: string): Promise<UserRow | undefined> {
  const rows = await q.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
}

export async function insertUser(
  q: Queryable,
  u: { id: string; email: string; passwordHash: string; displayName: string; timezone: string },
): Promise<User> {
  const rows = await q.query<UserRow>(
    `INSERT INTO users (id, email, password_hash, display_name, timezone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [u.id, u.email, u.passwordHash, u.displayName, u.timezone],
  );
  return toUser(rows[0] as UserRow);
}

const SETTINGS_COLUMNS: Record<keyof UserSettingsPatch, string> = {
  displayName: 'display_name',
  unit: 'unit',
  goal: 'goal',
  experience: 'experience',
  daysPerWeek: 'days_per_week',
  defaultRestSec: 'default_rest_sec',
  timezone: 'timezone',
  barWeightKg: 'bar_weight_kg',
  onboarded: 'onboarded',
};

export async function updateUserSettings(q: Queryable, userId: string, patch: UserSettingsPatch): Promise<User> {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  for (const [key, col] of Object.entries(SETTINGS_COLUMNS) as Array<[keyof UserSettingsPatch, string]>) {
    const v = patch[key];
    if (v === undefined) continue;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  const rows = sets.length
    ? await q.query<UserRow>(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params)
    : await q.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  return toUser(rows[0] as UserRow);
}
