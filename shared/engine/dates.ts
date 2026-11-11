/**
 * Calendar helpers. Calendar dates are plain `YYYY-MM-DD` strings in the user's timezone; all
 * arithmetic on them is done on the proleptic Gregorian calendar via UTC (no DST involved).
 */

const DAY_MS = 86_400_000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timezone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      // Unknown / invalid IANA zone → fall back to UTC rather than crash a whole request.
      f = formatterFor('UTC');
    }
    formatterCache.set(timezone, f);
  }
  return f;
}

function toDate(at: Date | string): Date {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) throw new RangeError(`engine: invalid date ${String(at)}`);
  return d;
}

function pad(n: number, width: number): string {
  return String(Math.abs(n)).padStart(width, '0');
}

function formatYmd(y: number, m: number, d: number): string {
  const year = y < 0 ? `-${pad(y, 6)}` : y > 9999 ? `+${pad(y, 6)}` : pad(y, 4);
  return `${year}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** Local calendar date (YYYY-MM-DD) of an instant in an IANA timezone. */
export function localDate(at: Date | string, timezone: string): string {
  const d = toDate(at);
  const parts = formatterFor(timezone || 'UTC').formatToParts(d);
  let y = NaN;
  let m = NaN;
  let day = NaN;
  let bc = false;
  for (const p of parts) {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') m = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'era') bc = /^b/i.test(p.value);
  }
  if (bc) y = 1 - y;
  return formatYmd(y, m, day);
}

/** Parse YYYY-MM-DD → UTC epoch ms at midnight. */
export function parseYmd(date: string): number {
  const m = /^([+-]?\d{4,6})-(\d{2})-(\d{2})/.exec(date);
  if (!m) throw new RangeError(`engine: invalid calendar date ${date}`);
  const t = new Date(0);
  t.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  t.setUTCHours(0, 0, 0, 0);
  return t.getTime();
}

function ymdFromMs(ms: number): string {
  const d = new Date(ms);
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Add days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
  return ymdFromMs(parseYmd(date) + Math.round(days) * DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function isoWeekdayIndex(date: string): number {
  const dow = new Date(parseYmd(date)).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

/** Monday (YYYY-MM-DD) of the week containing `at`, in `timezone`. */
export function weekStartOf(at: Date | string, timezone: string): string {
  const day = localDate(at, timezone);
  return addDays(day, -isoWeekdayIndex(day));
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b) - parseYmd(a)) / DAY_MS);
}
