/**
 * Outbox for finished workouts that couldn't be saved (no signal in the gym basement).
 * Pure list operations + a dependency-injected flush, so the logic is unit-testable.
 * PUT /api/workouts/:id is an idempotent upsert, so re-sending is always safe.
 */
import type { PersonalRecord, Workout } from '../../../../shared/types';
import { isRetryable, ApiRequestError } from '../../lib/api';

export interface OutboxEntry {
  /** = workout.id (one entry per workout) */
  id: string;
  /** Owner — entries are only sent while that user is logged in. */
  userId: string;
  workout: Workout;
  /** Bumped whenever the payload is replaced, so a stale in-flight send can't delete newer data. */
  rev: number;
  enqueuedAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  /** Server rejected it (4xx other than auth/rate-limit): not auto-retried, needs user action. */
  stuck: boolean;
}

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** 2 s, 4 s, 8 s … capped at 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/** Add a workout, or replace the queued payload for the same workout id (dedupe). */
export function enqueue(entries: OutboxEntry[], workout: Workout, userId: string, now: number): OutboxEntry[] {
  const existing = entries.find((e) => e.id === workout.id);
  if (existing) {
    return entries.map((e) =>
      e.id === workout.id
        ? { ...e, workout, userId, rev: e.rev + 1, attempts: 0, nextAttemptAt: now, lastError: null, stuck: false }
        : e,
    );
  }
  return [
    ...entries,
    { id: workout.id, userId, workout, rev: 1, enqueuedAt: now, attempts: 0, nextAttemptAt: now, lastError: null, stuck: false },
  ];
}

export function removeEntry(entries: OutboxEntry[], id: string, rev?: number): OutboxEntry[] {
  return entries.filter((e) => !(e.id === id && (rev === undefined || e.rev === rev)));
}

export function recordFailure(
  entries: OutboxEntry[],
  id: string,
  rev: number,
  now: number,
  error: string,
  stuck = false,
): OutboxEntry[] {
  return entries.map((e) => {
    if (e.id !== id || e.rev !== rev) return e;
    const attempts = e.attempts + 1;
    return { ...e, attempts, lastError: error, stuck, nextAttemptAt: now + backoffMs(attempts) };
  });
}

export function dueEntries(entries: OutboxEntry[], now: number, userId: string | null, force = false): OutboxEntry[] {
  return entries.filter((e) => (!userId || e.userId === userId) && !e.stuck && (force || e.nextAttemptAt <= now));
}

/** Earliest time a non-stuck entry for this user becomes due (for scheduling), or null. */
export function nextDueAt(entries: OutboxEntry[], userId: string | null): number | null {
  let t: number | null = null;
  for (const e of entries) {
    if (e.stuck || (userId && e.userId !== userId)) continue;
    if (t === null || e.nextAttemptAt < t) t = e.nextAttemptAt;
  }
  return t;
}

export interface SendResult {
  workout: Workout;
  prs: PersonalRecord[];
}

export interface FlushDeps {
  load: () => OutboxEntry[];
  save: (entries: OutboxEntry[]) => void;
  send: (w: Workout) => Promise<SendResult>;
  now: () => number;
  userId: string | null;
}

export interface FlushReport {
  sent: Array<{ entry: OutboxEntry; result: SendResult }>;
  failed: number;
  /** A 401 stopped the flush (session expired). */
  unauthorized: boolean;
}

/**
 * Send every due entry once. Entries are re-read from storage around each send so concurrent
 * enqueues (another tab, a just-finished workout) are never clobbered.
 */
export async function flushOutbox(deps: FlushDeps, opts: { force?: boolean } = {}): Promise<FlushReport> {
  const report: FlushReport = { sent: [], failed: 0, unauthorized: false };
  const due = dueEntries(deps.load(), deps.now(), deps.userId, opts.force);
  for (const entry of due) {
    try {
      const result = await deps.send(entry.workout);
      deps.save(removeEntry(deps.load(), entry.id, entry.rev));
      report.sent.push({ entry, result });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        report.unauthorized = true;
        break;
      }
      const msg = e instanceof Error ? e.message : String(e);
      let entries = recordFailure(deps.load(), entry.id, entry.rev, deps.now(), msg, !isRetryable(e));
      report.failed++;
      if (e instanceof ApiRequestError && e.isNetwork) {
        // offline: don't hammer the rest of the queue — defer it to the same retry time
        const until = entries.find((x) => x.id === entry.id)?.nextAttemptAt ?? deps.now() + BACKOFF_BASE_MS;
        const rest = new Set(due.slice(due.indexOf(entry) + 1).map((x) => x.id));
        entries = entries.map((x) => (rest.has(x.id) && x.nextAttemptAt < until ? { ...x, nextAttemptAt: until } : x));
        deps.save(entries);
        break;
      }
      deps.save(entries);
    }
  }
  return report;
}
