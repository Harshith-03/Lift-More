import { Router } from 'express';
import { detectPRs } from '../../shared/engine';
import type { Workout } from '../../shared/types';
import { currentUser, type AppContext } from '../context';
import { badRequest, notFound, parse } from '../errors';
import { listCustomExercises } from '../repo/exercises';
import { deleteWorkout, getWorkout, listSummaries, loadWorkouts, upsertWorkout } from '../repo/workouts';
import { workoutListQuery, workoutSchema } from '../validation';
import { uuidParam } from './params';

/** Lower-cases ids so they round-trip exactly as Postgres stores uuids. */
export function normalizeWorkout(w: ReturnType<typeof workoutSchema.parse>): Workout {
  return {
    id: w.id.toLowerCase(),
    routineId: w.routineId ? w.routineId.toLowerCase() : null,
    name: w.name,
    startedAt: new Date(w.startedAt).toISOString(),
    endedAt: w.endedAt ? new Date(w.endedAt).toISOString() : null,
    notes: w.notes,
    bodyweightKg: w.bodyweightKg,
    sets: w.sets.map((s) => ({ ...s, id: s.id.toLowerCase(), notes: s.notes ?? null })),
  };
}

export function workoutsRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    const user = currentUser(req);
    const { limit, before } = parse(workoutListQuery, req.query);
    res.json(await listSummaries(ctx.db, user.id, limit, before ? new Date(before).toISOString() : undefined));
  });

  r.get('/:id', async (req, res) => {
    const user = currentUser(req);
    const w = await getWorkout(ctx.db, user.id, uuidParam(req, 'id', 'Workout'));
    if (!w) throw notFound('Workout');
    res.json(w);
  });

  /** Idempotent upsert (offline outbox retries): same payload twice → one workout, sets replaced. */
  r.put('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = uuidParam(req, 'id', 'Workout');
    const workout = normalizeWorkout(parse(workoutSchema, req.body));
    if (workout.id !== id) throw badRequest('Body id must match the URL id', [{ path: 'id', message: 'mismatch' }]);

    const outcome = await ctx.db.transaction((tx) => upsertWorkout(tx, user.id, workout));
    if (outcome === 'foreign') throw notFound('Workout');

    const saved = (await getWorkout(ctx.db, user.id, id))!;
    const exerciseIds = [...new Set(saved.sets.map((s) => s.exerciseId))];
    const [prior, custom] = await Promise.all([
      loadWorkouts(ctx.db, user.id, { startedAtOrBefore: saved.startedAt, excludeId: id, exerciseIds }),
      listCustomExercises(ctx.db, user.id),
    ]);
    const prs = detectPRs(saved, prior, custom);
    res.json({ workout: saved, prs });
  });

  r.delete('/:id', async (req, res) => {
    const user = currentUser(req);
    if (!(await deleteWorkout(ctx.db, user.id, uuidParam(req, 'id', 'Workout')))) throw notFound('Workout');
    res.status(204).end();
  });

  return r;
}
