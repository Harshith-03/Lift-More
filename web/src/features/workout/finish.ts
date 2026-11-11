import type { PersonalRecord, Workout } from '../../../../shared/types';
import { api, isRetryable } from '../../lib/api';
import { qk, queryClient, invalidateTrainingData } from '../../lib/queryClient';
import { readJSON, STORAGE_KEYS, writeJSON } from '../../lib/storage';
import { outboxStore } from '../sync/outboxStore';

export interface WorkoutResult {
  workout: Workout;
  prs: PersonalRecord[];
  /** Saved to the outbox (offline) — PRs are computed once it syncs. */
  queued: boolean;
}

/**
 * Save a workout: PUT, and on a network/5xx failure queue it in the outbox instead.
 * Non-retryable errors (validation) are thrown so the draft stays intact.
 */
export async function saveWorkout(workout: Workout, userId: string): Promise<WorkoutResult> {
  try {
    const res = await api.putWorkout(workout);
    queryClient.setQueryData(qk.workout(workout.id), res.workout);
    void invalidateTrainingData();
    // if an older copy was queued, the server now has the latest — drop it
    outboxStore.discard(workout.id);
    return { workout: res.workout, prs: res.prs, queued: false };
  } catch (e) {
    if (!isRetryable(e)) throw e;
    outboxStore.add(workout, userId);
    return { workout, prs: [], queued: true };
  }
}

export function rememberSummary(r: WorkoutResult): void {
  writeJSON(STORAGE_KEYS.lastSummary, r);
}

export function lastSummary(): WorkoutResult | null {
  const r = readJSON<WorkoutResult | null>(STORAGE_KEYS.lastSummary, null);
  return r && r.workout && Array.isArray(r.workout.sets) ? r : null;
}
