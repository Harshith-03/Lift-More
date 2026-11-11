import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ExerciseRecommendation, Routine, RoutineItem } from '../../../../shared/types';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup, useRoutines, useUser } from '../../lib/queries';
import { useToast } from '../../components/feedback';
import { defaultItemFor } from '../workout/draftFactory';

/** Is this recommendation already reflected in the routine? */
export function isApplied(change: ExerciseRecommendation, routine: Routine | undefined): boolean {
  if (!routine) return false;
  const has = (id: string | undefined) => !!id && routine.items.some((i) => i.exerciseId === id);
  if (change.type === 'add') return has(change.exerciseId);
  if (change.type === 'swap') return has(change.replacementId) && !has(change.exerciseId);
  return !has(change.exerciseId);
}

/** New items for a routine after applying an add / swap / remove. Returns null if not applicable. */
export function applyToItems(
  change: ExerciseRecommendation,
  items: RoutineItem[],
  defaults: (exerciseId: string) => Pick<RoutineItem, 'sets' | 'repMin' | 'repMax' | 'restSec'>,
): RoutineItem[] | null {
  if (change.type === 'add') {
    if (items.some((i) => i.exerciseId === change.exerciseId)) return null;
    return [...items, { exerciseId: change.exerciseId, ...defaults(change.exerciseId) }];
  }
  if (change.type === 'swap') {
    if (!change.replacementId || !items.some((i) => i.exerciseId === change.exerciseId)) return null;
    // keep sets / reps / rest, replace the exercise
    return items.map((i) => (i.exerciseId === change.exerciseId ? { ...i, exerciseId: change.replacementId! } : i));
  }
  if (!items.some((i) => i.exerciseId === change.exerciseId)) return null;
  return items.filter((i) => i.exerciseId !== change.exerciseId);
}

export function useApplyChange() {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useUser();
  const lookup = useExerciseLookup();
  const { data: routines } = useRoutines();

  return useCallback(
    async (change: ExerciseRecommendation, routineId: string): Promise<boolean> => {
      const routine = routines?.find((r) => r.id === routineId);
      if (!routine) {
        toast.error('That routine no longer exists.');
        return false;
      }
      const items = applyToItems(change, routine.items, (id) => defaultItemFor(lookup.get(id), user.goal, user.defaultRestSec));
      if (!items) {
        toast.show(change.type === 'add' ? 'Already in this routine.' : 'Nothing to change in this routine.');
        return false;
      }
      try {
        const updated = await api.updateRoutine(routine.id, { name: routine.name, notes: routine.notes, items, position: routine.position });
        qc.setQueryData<Routine[]>(qk.routines, (old) => old?.map((r) => (r.id === updated.id ? updated : r)));
        void qc.invalidateQueries({ queryKey: qk.plan });
        const what =
          change.type === 'add'
            ? `Added ${lookup.name(change.exerciseId)}`
            : change.type === 'swap'
              ? `Swapped in ${lookup.name(change.replacementId ?? '')}`
              : `Removed ${lookup.name(change.exerciseId)}`;
        toast.success(`${what} · ${routine.name}`);
        return true;
      } catch (e) {
        toast.error(errorMessage(e, 'Could not update the routine'));
        return false;
      }
    },
    [routines, lookup, user.goal, user.defaultRestSec, qc, toast],
  );
}
