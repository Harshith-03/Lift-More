import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Exercise, User, UserSettingsPatch } from '../../../shared/types';
import { getExercise } from '../../../shared/engine';
import { api } from './api';
import { qk } from './queryClient';
import { humanizeId } from './format';

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: ({ signal }) => api.me(signal), staleTime: 5 * 60_000 });
}

/** The logged-in user. Only call below the auth gate. */
export function useUser(): User {
  const { data } = useMe();
  if (!data) throw new Error('useUser() called outside the authenticated app');
  return data;
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserSettingsPatch) => api.patchMe(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.me });
      const prev = qc.getQueryData<User | null>(qk.me);
      if (prev) qc.setQueryData<User>(qk.me, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.me, ctx.prev);
    },
    onSuccess: (user, patch) => {
      qc.setQueryData(qk.me, user);
      // goal / experience / unit / days change the plan, targets and stats
      if (patch.goal || patch.experience || patch.unit || patch.daysPerWeek || patch.timezone) {
        void qc.invalidateQueries({ queryKey: qk.plan });
        void qc.invalidateQueries({ queryKey: qk.stats });
      }
    },
  });
}

export function useRoutines() {
  return useQuery({ queryKey: qk.routines, queryFn: ({ signal }) => api.routines(signal) });
}

export function usePlan() {
  return useQuery({ queryKey: qk.plan, queryFn: ({ signal }) => api.plan(signal), staleTime: 60_000 });
}

export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: ({ signal }) => api.stats(signal), staleTime: 60_000 });
}

export function useRecentWorkouts(limit = 50) {
  return useQuery({
    queryKey: [...qk.workoutsRecent, limit],
    queryFn: ({ signal }) => api.workouts({ limit }, signal),
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: qk.workout(id ?? ''),
    queryFn: ({ signal }) => api.workout(id!, signal),
    enabled: !!id,
  });
}

export function useBodyweight() {
  return useQuery({ queryKey: qk.bodyweight, queryFn: ({ signal }) => api.bodyweight(signal) });
}

export function useCustomExercises() {
  return useQuery({
    queryKey: qk.customExercises,
    queryFn: ({ signal }) => api.customExercises(signal),
    staleTime: 5 * 60_000,
  });
}

export interface ExerciseLookup {
  custom: Exercise[];
  get: (id: string) => Exercise | undefined;
  name: (id: string) => string;
}

/** Built-in + custom exercise lookup with a readable fallback name for unknown ids. */
export function useExerciseLookup(): ExerciseLookup {
  const { data } = useCustomExercises();
  return useMemo(() => {
    const custom = data ?? [];
    return {
      custom,
      get: (id: string) => getExercise(id, custom),
      name: (id: string) => getExercise(id, custom)?.name ?? humanizeId(id),
    };
  }, [data]);
}

export function useCoachStatus() {
  return useQuery({ queryKey: qk.coachStatus, queryFn: ({ signal }) => api.coachStatus(signal), staleTime: 60_000 });
}

export function useCoachReview() {
  return useQuery({ queryKey: qk.coachReview, queryFn: ({ signal }) => api.coachReview(signal), staleTime: 5 * 60_000 });
}
