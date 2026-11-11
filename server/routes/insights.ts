import { Router } from 'express';
import { exerciseHistory } from '../../shared/engine';
import { currentUser, type AppContext } from '../context';
import { parse } from '../errors';
import { listCustomExercises } from '../repo/exercises';
import { lastSessions, loadWorkouts } from '../repo/workouts';
import { planFor, statsFor } from '../services/training';
import { historyQuery, lastQuery } from '../validation';
import { stringParam } from './params';

/** /api/history/* — per-exercise history (engine) and "previous" numbers for the logger. */
export function historyRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/last', async (req, res) => {
    const user = currentUser(req);
    const { exerciseIds } = parse(lastQuery, { exerciseIds: req.query.exerciseIds ?? '' });
    res.json(await lastSessions(ctx.db, user.id, exerciseIds));
  });

  r.get('/exercise/:exerciseId', async (req, res) => {
    const user = currentUser(req);
    const exerciseId = stringParam(req, 'exerciseId', 'Exercise');
    const { limit } = parse(historyQuery, req.query);
    const [workouts, custom] = await Promise.all([
      loadWorkouts(ctx.db, user.id, { exerciseIds: [exerciseId] }),
      listCustomExercises(ctx.db, user.id),
    ]);
    const history = exerciseHistory(exerciseId, workouts, custom);
    res.json({ ...history, sessions: history.sessions.slice(0, limit) });
  });

  return r;
}

export function statsRouter(ctx: AppContext): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json(await statsFor(ctx.db, currentUser(req), ctx.now()));
  });
  return r;
}

export function planRouter(ctx: AppContext): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json(await planFor(ctx.db, currentUser(req), ctx.now()));
  });
  return r;
}
