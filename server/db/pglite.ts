import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { OID, type Db, type Queryable } from './types';

/** Embedded Postgres (WASM). `dataDir` undefined → in-memory (tests). */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const parsers = {
    [OID.DATE]: (v: string) => v,
    [OID.INT8]: (v: string) => Number(v),
    [OID.NUMERIC]: (v: string) => Number(v),
  };
  if (dataDir && !dataDir.includes('://')) mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir, { parsers }) : new PGlite({ parsers });
  await pg.waitReady;

  return {
    kind: 'pglite',
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params as unknown[]);
      return res.rows;
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return pg.transaction(async (t) => {
        const tx: Queryable = {
          async query<R>(text: string, params: unknown[] = []) {
            const res = await t.query<R>(text, params as unknown[]);
            return res.rows;
          },
        };
        return fn(tx);
      });
    },
    async close() {
      if (!pg.closed) await pg.close();
    },
  };
}
