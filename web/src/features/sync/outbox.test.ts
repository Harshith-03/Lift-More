import { describe, expect, it, vi } from 'vitest';
import type { Workout } from '../../../../shared/types';
import { ApiRequestError } from '../../lib/api';
import {
  BACKOFF_BASE_MS,
  backoffMs,
  dueEntries,
  enqueue,
  flushOutbox,
  nextDueAt,
  recordFailure,
  removeEntry,
  type FlushDeps,
  type OutboxEntry,
} from './outbox';

const T0 = 1_000_000;

function workout(id: string, name = 'Push'): Workout {
  return {
    id,
    routineId: null,
    name,
    startedAt: '2026-11-10T17:00:00.000Z',
    endedAt: '2026-11-10T18:00:00.000Z',
    notes: '',
    bodyweightKg: null,
    sets: [
      { id: `${id}-s1`, exerciseId: 'bench', exerciseOrder: 0, setOrder: 0, kind: 'working', weightKg: 80, reps: 8, durationSec: null, rpe: null, completed: true },
    ],
  };
}

/** In-memory storage-backed deps (mirrors how outboxStore wires localStorage). */
function memoryDeps(initial: OutboxEntry[], send: FlushDeps['send'], now = () => T0, userId: string | null = 'u1') {
  let stored = initial;
  const deps: FlushDeps = {
    load: () => stored,
    save: (e) => {
      stored = e;
    },
    send,
    now,
    userId,
  };
  return { deps, get: () => stored };
}

describe('outbox list ops', () => {
  it('enqueues a workout as immediately due', () => {
    const q = enqueue([], workout('w1'), 'u1', T0);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: 'w1', userId: 'u1', rev: 1, attempts: 0, nextAttemptAt: T0, stuck: false });
  });

  it('dedupes by workout id: replaces the payload, bumps rev and resets backoff', () => {
    let q = enqueue([], workout('w1', 'old name'), 'u1', T0);
    q = enqueue(q, workout('w2'), 'u1', T0);
    q = recordFailure(q, 'w1', 1, T0, 'offline');
    expect(q[0]!.attempts).toBe(1);
    q = enqueue(q, workout('w1', 'new name'), 'u1', T0 + 10);
    expect(q).toHaveLength(2);
    const w1 = q.find((e) => e.id === 'w1')!;
    expect(w1.workout.name).toBe('new name');
    expect(w1).toMatchObject({ rev: 2, attempts: 0, nextAttemptAt: T0 + 10, lastError: null, enqueuedAt: T0 });
  });

  it('backs off exponentially with a cap', () => {
    expect(backoffMs(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(3)).toBe(BACKOFF_BASE_MS * 4);
    expect(backoffMs(50)).toBe(5 * 60_000);
    const q = recordFailure(enqueue([], workout('w1'), 'u1', T0), 'w1', 1, T0, 'boom');
    expect(q[0]!.nextAttemptAt).toBe(T0 + BACKOFF_BASE_MS);
    expect(dueEntries(q, T0, 'u1')).toHaveLength(0);
    expect(dueEntries(q, T0 + BACKOFF_BASE_MS, 'u1')).toHaveLength(1);
    expect(dueEntries(q, T0, 'u1', true)).toHaveLength(1);
    expect(nextDueAt(q, 'u1')).toBe(T0 + BACKOFF_BASE_MS);
  });

  it('only exposes entries for the signed-in user', () => {
    const q = enqueue(enqueue([], workout('w1'), 'u1', T0), workout('w2'), 'u2', T0);
    expect(dueEntries(q, T0, 'u1').map((e) => e.id)).toEqual(['w1']);
    expect(nextDueAt(q, 'u3')).toBeNull();
  });

  it('removeEntry with a stale rev keeps the newer payload', () => {
    let q = enqueue([], workout('w1'), 'u1', T0);
    q = enqueue(q, workout('w1', 'edited'), 'u1', T0); // rev 2
    expect(removeEntry(q, 'w1', 1)).toHaveLength(1);
    expect(removeEntry(q, 'w1', 2)).toHaveLength(0);
  });
});

describe('flushOutbox', () => {
  it('a successful retry removes the entry and reports PRs', async () => {
    const send = vi.fn(async (w: Workout) => ({ workout: w, prs: [] }));
    const { deps, get } = memoryDeps(enqueue([], workout('w1'), 'u1', T0), send);
    const report = await flushOutbox(deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(report.sent.map((s) => s.entry.id)).toEqual(['w1']);
    expect(get()).toEqual([]);
  });

  it('a network failure keeps the entry with backoff; a later retry succeeds and removes it', async () => {
    let online = false;
    let now = T0;
    const send = vi.fn(async (w: Workout) => {
      if (!online) throw new ApiRequestError(0, { error: 'network', message: 'offline' });
      return { workout: w, prs: [] };
    });
    const { deps, get } = memoryDeps(enqueue(enqueue([], workout('w1'), 'u1', T0), workout('w2'), 'u1', T0), send, () => now);

    const r1 = await flushOutbox(deps);
    expect(r1).toMatchObject({ failed: 1, sent: [] });
    expect(send).toHaveBeenCalledTimes(1); // stops after the first network error
    expect(get()).toHaveLength(2);
    expect(get()[0]).toMatchObject({ attempts: 1, nextAttemptAt: T0 + BACKOFF_BASE_MS, stuck: false });
    expect(get()[1]!.nextAttemptAt).toBe(T0 + BACKOFF_BASE_MS); // deferred, not hammered
    expect(get()[1]!.attempts).toBe(0);

    // not due yet → nothing sent
    await flushOutbox(deps);
    expect(send).toHaveBeenCalledTimes(1);

    online = true;
    now = T0 + BACKOFF_BASE_MS;
    const r3 = await flushOutbox(deps);
    expect(r3.sent.map((s) => s.entry.id)).toEqual(['w1', 'w2']);
    expect(get()).toEqual([]);
  });

  it('a validation error marks the entry stuck instead of retrying forever', async () => {
    const send = vi.fn(async () => {
      throw new ApiRequestError(400, { error: 'validation', message: 'bad set' });
    });
    const { deps, get } = memoryDeps(enqueue([], workout('w1'), 'u1', T0), send);
    await flushOutbox(deps);
    expect(get()[0]).toMatchObject({ stuck: true, lastError: 'bad set' });
    await flushOutbox(deps, { force: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stops on 401 and keeps everything queued', async () => {
    const send = vi.fn(async () => {
      throw new ApiRequestError(401, { error: 'unauthorized', message: 'login' });
    });
    const { deps, get } = memoryDeps(enqueue(enqueue([], workout('w1'), 'u1', T0), workout('w2'), 'u1', T0), send);
    const r = await flushOutbox(deps);
    expect(r.unauthorized).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(get().map((e) => [e.id, e.attempts])).toEqual([
      ['w1', 0],
      ['w2', 0],
    ]);
  });

  it('does not delete a payload that was replaced while its send was in flight', async () => {
    const { deps, get } = memoryDeps(enqueue([], workout('w1', 'v1'), 'u1', T0), async (w) => {
      // user edits + re-saves the same workout mid-request
      deps.save(enqueue(deps.load(), workout('w1', 'v2'), 'u1', T0));
      return { workout: w, prs: [] };
    });
    await flushOutbox(deps);
    expect(get()).toHaveLength(1);
    expect(get()[0]!.workout.name).toBe('v2');
  });
});
