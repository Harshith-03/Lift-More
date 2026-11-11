import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { Routine, Workout } from '../../../../shared/types';
import { useExerciseLookup, usePlan, useUser } from '../../lib/queries';
import { timeOfDayName } from '../../lib/format';
import { uuid } from '../../lib/storage';
import { useConfirm } from '../../components/feedback';
import { draftFromRoutine, emptyDraft } from './draftFactory';
import { draftFromWorkout, type WorkoutDraft } from './draftReducer';
import { draftStore } from './draftStore';

export type StartSource = { routine: Routine } | { empty: true } | { repeat: Workout };

/** Start a live workout (routine prefilled from the plan, empty, or repeat of a past one). */
export function useStartWorkout() {
  const user = useUser();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const lookup = useExerciseLookup();
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
        draft = draftFromRoutine({ routine: source.routine, plan, userId: user.id, getExercise: lookup.get, newId: uuid, now });
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
    [user.id, user.defaultRestSec, confirm, lookup.get, plan, navigate],
  );
}
