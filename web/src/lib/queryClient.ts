import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { ApiRequestError } from './api';
import { removeKey, STORAGE_KEYS } from './storage';

const DAY = 24 * 60 * 60 * 1000;
export const CACHE_MAX_AGE = 7 * DAY;
/** Bump when the shape of cached data changes; old caches are discarded on load. */
export const CACHE_BUSTER = 'lm-cache-1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: STORAGE_KEYS.queryCache,
  throttleTime: 1000,
});

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && q.meta?.persist !== false,
  },
};

/**
 * Wipe all cached server data (logout / account switch / delete).
 *
 * The `me` query instance is kept on purpose: AuthGate's mounted observer is attached to it, and
 * `queryClient.clear()` would orphan that observer — the caller's follow-up `setQueryData(qk.me, …)`
 * would then land on a brand-new query nobody is subscribed to, leaving the UI stuck on the old screen.
 * Callers always overwrite `me` right after this.
 */
export function clearCachedData(): void {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
  queryClient.getMutationCache().clear();
  removeKey(STORAGE_KEYS.queryCache);
}

export const qk = {
  me: ['me'] as const,
  routines: ['routines'] as const,
  plan: ['plan'] as const,
  stats: ['stats'] as const,
  workouts: ['workouts'] as const,
  workoutList: ['workouts', 'list'] as const,
  workoutsRecent: ['workouts', 'recent'] as const,
  workout: (id: string) => ['workouts', 'detail', id] as const,
  historyLast: (exerciseId: string) => ['history', 'last', exerciseId] as const,
  historyExercise: (exerciseId: string) => ['history', 'exercise', exerciseId] as const,
  history: ['history'] as const,
  bodyweight: ['bodyweight'] as const,
  customExercises: ['exercises', 'custom'] as const,
  coachStatus: ['coach', 'status'] as const,
  coachReview: ['coach', 'review'] as const,
};

/** Everything that depends on logged workouts. */
export function invalidateTrainingData(): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.workouts }),
    queryClient.invalidateQueries({ queryKey: qk.history }),
    queryClient.invalidateQueries({ queryKey: qk.stats }),
    queryClient.invalidateQueries({ queryKey: qk.plan }),
  ]);
}
