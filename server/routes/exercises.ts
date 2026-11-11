import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { currentUser, type AppContext } from '../context';
import { notFound, parse } from '../errors';
import {
  deleteCustomExercise,
  getCustomExercise,
  listCustomExercises,
  upsertCustomExercise,
} from '../repo/exercises';
import { customExercisePatchSchema, customExerciseSchema } from '../validation';
import { stringParam } from './params';

export function exercisesRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/custom', async (req, res) => {
    res.json(await listCustomExercises(ctx.db, currentUser(req).id));
  });

  r.post('/custom', async (req, res) => {
    const user = currentUser(req);
    const input = parse(customExerciseSchema, req.body);
    const ex = await upsertCustomExercise(ctx.db, user.id, { id: `custom-${randomUUID()}`, ...input });
    res.status(201).json(ex);
  });

  r.patch('/custom/:id', async (req, res) => {
    const user = currentUser(req);
    const id = stringParam(req, 'id', 'Exercise');
    const patch = parse(customExercisePatchSchema, req.body ?? {});
    const existing = await getCustomExercise(ctx.db, user.id, id);
    if (!existing) throw notFound('Exercise');
    const { cue, ...rest } = patch;
    const merged = { ...existing, ...rest, cue: cue === null ? undefined : (cue ?? existing.cue) };
    const ex = await upsertCustomExercise(ctx.db, user.id, merged);
    if (!ex) throw notFound('Exercise');
    res.json(ex);
  });

  r.delete('/custom/:id', async (req, res) => {
    const user = currentUser(req);
    const id = stringParam(req, 'id', 'Exercise');
    if (!(await deleteCustomExercise(ctx.db, user.id, id))) throw notFound('Exercise');
    res.status(204).end();
  });

  return r;
}
