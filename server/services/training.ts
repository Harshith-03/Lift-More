import { buildWeeklyPlan, computeStats, type PlanInput } from '../../shared/engine';
import type { StatsSummary, User, WeeklyPlan, Workout } from '../../shared/types';
import type { Queryable } from '../db/types';
import { listCustomExercises } from '../repo/exercises';
import { listRoutines } from '../repo/routines';
import { loadWorkouts } from '../repo/workouts';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Plan history window (spec: last 12 weeks). One extra day absorbs timezone offsets at the boundary. */
export const PLAN_WINDOW_DAYS = 12 * 7 + 1;

export function planProfile(user: User): PlanInput['profile'] {
  return {
    unit: user.unit,
    goal: user.goal,
    experience: user.experience,
    timezone: user.timezone,
    daysPerWeek: user.daysPerWeek,
  };
}

/** Everything `buildWeeklyPlan` needs, loaded with a fixed number of queries. */
export async function loadPlanInput(q: Queryable, user: User, now: Date, allWorkouts?: Workout[]): Promise<PlanInput> {
  const since = new Date(now.getTime() - PLAN_WINDOW_DAYS * DAY_MS);
  const [routines, customExercises, workouts] = await Promise.all([
    listRoutines(q, user.id),
    listCustomExercises(q, user.id),
    allWorkouts
      ? Promise.resolve(allWorkouts.filter((w) => Date.parse(w.startedAt) >= since.getTime()))
      : loadWorkouts(q, user.id, { since }),
  ]);
  return { routines, workouts, customExercises, profile: planProfile(user), now };
}

export async function planFor(q: Queryable, user: User, now: Date): Promise<WeeklyPlan> {
  return buildWeeklyPlan(await loadPlanInput(q, user, now));
}

export async function statsFor(q: Queryable, user: User, now: Date): Promise<StatsSummary> {
  const [workouts, custom] = await Promise.all([loadWorkouts(q, user.id), listCustomExercises(q, user.id)]);
  return computeStats(workouts, user, now, custom);
}
