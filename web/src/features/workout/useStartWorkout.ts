import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Routine, WeeklyPlan, Workout } from '../../../../shared/types';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup, usePlan, useUser } from '../../lib/queries';
import { timeOfDayName } from '../../lib/format';
import { uuid } from '../../lib/storage';
import { useConfirm } from '../../components/feedback';
import { draftFromRoutine, emptyDraft } from './draftFactory';
import { draftFromWorkout, type WorkoutDraft } from './draftReducer';
import { draftStore } from './draftStore';

export type StartSource = { routine: Routine } | { empty: true } | { repeat: Workout };

/**
 * The plan to prefill from: always refreshed when online (history may have changed on another device or
 * since the cache was restored), but never blocking a gym-basement start — offline or slow (>3 s), the
 * cached plan is used.
 */
async function latestPlan(qc: QueryClient, cached: WeeklyPlan | undefined): Promise<WeeklyPlan | undefined> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return cached;
  try {
    const fresh = await Promise.race([
      qc.fetchQuery({ queryKey: qk.plan, queryFn: ({ signal }) => api.plan(signal), staleTime: 0 }),
      new Promise<undefined>((resolve) => setTimeout(resolve, 3_000, undefined)),
    ]);
    return fresh ?? cached;
  } catch {
    return cached;
  }
}

/** Start a live workout (routine prefilled from the plan, empty, or repeat of a past one). */
export function useStartWorkout() {
  const user = useUser();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const lookup = useExerciseLookup();
  const qc = useQueryClient();
  const { data: plan } = usePlan();

  return useCallback(
    async (source: StartSource) => {
      const existing = draftStore.get();
      if (existing && existing.userId === user.id) {
        const ok = await confirm({
          title: 'Workout in progress',
          message: `You’re still logging “${existing.name}”. Discard it and start a new one?`,
          confirmLabel: 'Discard & start new',
          cancelLabel: 'Keep it',
          tone: 'danger',
        });
        if (!ok) return;
      }
      const now = new Date();
      let draft: WorkoutDraft;
      if ('routine' in source) {
        const current = await latestPlan(qc, plan);
        draft = draftFromRoutine({ routine: source.routine, plan: current, userId: user.id, getExercise: lookup.get, newId: uuid, now });
      } else if ('repeat' in source) {
        draft = draftFromWorkout(source.repeat, {
          userId: user.id,
          mode: 'live',
          newId: uuid,
          asNew: { startedAt: now.toISOString() },
          restFor: () => user.defaultRestSec,
        });
      } else {
        draft = emptyDraft({ userId: user.id, name: timeOfDayName(now), now, newId: uuid });
      }
      draftStore.start(draft);
      navigate('/workout');
    },
    [user.id, user.defaultRestSec, confirm, lookup.get, plan, qc, navigate],
  );
}
