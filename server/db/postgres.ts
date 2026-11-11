import pg from 'pg';
import { OID, type Db, type Queryable } from './types';

/**
 * `pg` Pool adapter (Neon in production). TLS follows `sslmode` in the connection string:
 * - absent / `disable`                       → plain TCP (local Postgres)
 * - `require` / `prefer` / `verify-*` (Neon) → TLS with certificate verification
 * - `no-verify`                              → TLS without verification (self-signed providers)
 */
export function createPostgresDb(connectionString: string): Db {
  const url = safeUrl(connectionString);
  const sslmode = url?.searchParams.get('sslmode')?.toLowerCase() ?? null;
  const ssl =
    !sslmode || sslmode === 'disable' || sslmode === 'allow'
      ? undefined
      : { rejectUnauthorized: sslmode !== 'no-verify' };

  // pg would otherwise re-parse sslmode from the URL (and print a deprecation warning), overriding `ssl`.
  let cs = connectionString;
  if (url && sslmode) {
    url.searchParams.delete('sslmode');
    cs = url.toString();
  }

  const types = {
    getTypeParser(oid: number, format?: 'text' | 'binary') {
      if (oid === OID.DATE) return (v: string) => v; // keep YYYY-MM-DD, never a local-midnight Date
      if (oid === OID.INT8 || oid === OID.NUMERIC) return (v: string) => (v === null ? null : Number(v));
      return pg.types.getTypeParser(oid, format as 'text');
    },
  };

  const pool = new pg.Pool({
    connectionString: cs,
    ssl,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    types: types as pg.CustomTypesConfig,
  });
  // An idle client erroring (e.g. Neon suspending compute) must not crash the process.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  return {
    kind: 'postgres',
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params as unknown[]);
      return res.rows as T[];
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query<R>(text: string, params: unknown[] = []) {
            const res = await client.query(text, params as unknown[]);
            return res.rows as R[];
          },
        };
        const out = await fn(tx);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

function safeUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
