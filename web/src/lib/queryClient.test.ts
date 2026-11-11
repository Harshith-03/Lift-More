// @vitest-environment jsdom
import { QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { clearCachedData, qk, queryClient } from './queryClient';

describe('clearCachedData', () => {
  it('wipes server data but keeps the `me` query observable (login/logout must re-render AuthGate)', () => {
    queryClient.setQueryData(qk.me, null);
    queryClient.setQueryData(qk.routines, [{ id: 'r-1' }]);
    queryClient.setQueryData(qk.plan, { weekStart: '2026-11-09' });

    // Mirrors AuthGate's useMe(): an observer mounted on the `me` query before login.
    const observer = new QueryObserver(queryClient, { queryKey: qk.me, queryFn: async () => null, enabled: false });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((r) => seen.push(r.data));

    clearCachedData();
    queryClient.setQueryData(qk.me, { id: 'u-2' });

    expect(seen.at(-1)).toEqual({ id: 'u-2' });
    expect(queryClient.getQueryData(qk.routines)).toBeUndefined();
    expect(queryClient.getQueryData(qk.plan)).toBeUndefined();
    unsubscribe();
  });
});
