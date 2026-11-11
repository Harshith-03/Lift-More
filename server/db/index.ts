import { createPgliteDb } from './pglite';
import { createPostgresDb } from './postgres';
import type { Db } from './types';

export type { Db, Queryable } from './types';
export { isUniqueViolation } from './types';
export { runMigrations, MIGRATIONS } from './migrations';
export { createPgliteDb } from './pglite';
export { createPostgresDb } from './postgres';

/** `DATABASE_URL` → pg Pool; otherwise PGlite at `pgliteDir` (undefined → in-memory). */
export async function createDb(opts: { databaseUrl?: string; pgliteDir?: string }): Promise<Db> {
  if (opts.databaseUrl) return createPostgresDb(opts.databaseUrl);
  return createPgliteDb(opts.pgliteDir);
}
