/** Anything that can run a parameterised SQL statement (the pool, or a transaction handle). */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** One adapter interface over `pg` (Postgres/Neon) and PGlite (embedded/in-memory). */
export interface Db extends Queryable {
  readonly kind: 'postgres' | 'pglite';
  /** Runs `fn` inside BEGIN/COMMIT; rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Postgres OIDs we override so both drivers return the same JS types. */
export const OID = {
  INT8: 20,
  NUMERIC: 1700,
  DATE: 1082,
} as const;

/** Postgres SQLSTATE codes we react to. */
export const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION;
}
