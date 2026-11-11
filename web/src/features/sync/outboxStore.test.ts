// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workout } from '../../../../shared/types';

const KEY = 'lm.outbox.v1';

function workout(id: string, name = 'Legs'): Workout {
  return {
    id,
    routineId: null,
    name,
    startedAt: '2026-11-10T17:00:00.000Z',
    endedAt: '2026-11-10T18:00:00.000Z',
    notes: '',
    bodyweightKg: null,
    sets: [],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('outboxStore (localStorage + online retry)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists to lm.outbox.v1 and dedupes by workout id', async () => {
    const { outboxStore } = await import('./outboxStore');
    outboxStore.add(workout('w1', 'first'), 'u1');
    outboxStore.add(workout('w1', 'second'), 'u1');
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].workout.name).toBe('second');
    expect(outboxStore.get()).toHaveLength(1);
  });

  it('retries on start and on the online event; success removes the entry', async () => {
    let online = false;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch');
      const w = JSON.parse(String(init?.body)) as Workout;
      return jsonResponse({ workout: w, prs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(
      KEY,
      JSON.stringify([{ id: 'w1', userId: 'u1', workout: workout('w1'), rev: 1, enqueuedAt: 0, attempts: 0, nextAttemptAt: 0, lastError: null, stuck: false }]),
    );

    const { startOutboxSync, outboxStore, syncNow } = await import('./outboxStore');
    const onReport = vi.fn();
    const stop = startOutboxSync({ getUserId: () => 'u1', onReport });

    // app-start attempt fails (offline) → entry kept with backoff
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await syncNow(); // wait for the in-flight flush to settle
    expect(outboxStore.get()).toHaveLength(1);
    expect(outboxStore.get()[0]!.attempts).toBe(1);

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(outboxStore.get()).toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toBe('/api/workouts/w1');
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PUT', credentials: 'same-origin' });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
    expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ sent: [expect.objectContaining({ entry: expect.objectContaining({ id: 'w1' }) })] }));
    stop();
  });
});
