import type { Queryable } from '../db/types';

/** Postgres caps a statement at 65535 bind params; stay well below. */
const MAX_PARAMS = 20_000;

/**
 * Multi-row INSERT, chunked to stay under the bind-parameter limit.
 * `casts` optionally appends a cast per column (e.g. `::jsonb`).
 */
export async function insertMany(
  q: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
  opts: { casts?: Record<string, string>; suffix?: string } = {},
): Promise<void> {
  if (rows.length === 0) return;
  const perChunk = Math.max(1, Math.floor(MAX_PARAMS / columns.length));
  for (let start = 0; start < rows.length; start += perChunk) {
    const chunk = rows.slice(start, start + perChunk);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const ph = row.map((v, i) => {
        params.push(v);
        const col = columns[i] as string;
        return `$${params.length}${opts.casts?.[col] ?? ''}`;
      });
      return `(${ph.join(', ')})`;
    });
    await q.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${opts.suffix ?? ''}`,
      params,
    );
  }
}
