import { Router } from 'express';
import { currentUser, type AppContext } from '../context';
import { notFound, parse } from '../errors';
import { deleteBodyweight, listBodyweight, upsertBodyweight } from '../repo/bodyweight';
import { bodyweightBody } from '../validation';
import { dateParam } from './params';

export function bodyweightRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json(await listBodyweight(ctx.db, currentUser(req).id));
  });

  r.put('/:date', async (req, res) => {
    const user = currentUser(req);
    const date = dateParam(req, 'date');
    const { weightKg } = parse(bodyweightBody, req.body);
    res.json(await upsertBodyweight(ctx.db, user.id, date, weightKg));
  });

  r.delete('/:date', async (req, res) => {
    const user = currentUser(req);
    if (!(await deleteBodyweight(ctx.db, user.id, dateParam(req, 'date')))) throw notFound('Bodyweight entry');
    res.status(204).end();
  });

  return r;
}
