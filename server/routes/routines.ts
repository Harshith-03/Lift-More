import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { TEMPLATES } from '../../shared/engine';
import type { Routine } from '../../shared/types';
import { currentUser, type AppContext } from '../context';
import { notFound, parse } from '../errors';
import { compactPositions, getRoutine, insertRoutine, listRoutines, nextPosition } from '../repo/routines';
import { fromTemplateSchema, reorderSchema, routineInputSchema } from '../validation';
import { uuidParam } from './params';

export function routinesRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json(await listRoutines(ctx.db, currentUser(req).id));
  });

  r.post('/', async (req, res) => {
    const user = currentUser(req);
    const input = parse(routineInputSchema, req.body);
    const routine = await ctx.db.transaction(async (tx) =>
      insertRoutine(tx, user.id, {
        id: randomUUID(),
        name: input.name,
        notes: input.notes,
        items: input.items,
        position: input.position ?? (await nextPosition(tx, user.id)),
      }),
    );
    res.status(201).json(routine);
  });

  r.post('/from-template', async (req, res) => {
    const user = currentUser(req);
    const { templateId, replaceExisting } = parse(fromTemplateSchema, req.body);
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) throw notFound('Template');
    const created = await ctx.db.transaction(async (tx) => {
      if (replaceExisting) await tx.query('DELETE FROM routines WHERE user_id = $1', [user.id]);
      let pos = await nextPosition(tx, user.id);
      const out: Routine[] = [];
      for (const t of template.routines) {
        out.push(
          await insertRoutine(tx, user.id, {
            id: randomUUID(),
            name: t.name,
            notes: t.notes ?? '',
            items: t.items.map((i) => ({ ...i })),
            position: pos++,
          }),
        );
      }
      return out;
    });
    res.status(201).json(created);
  });

  r.post('/reorder', async (req, res) => {
    const user = currentUser(req);
    const { ids } = parse(reorderSchema, req.body);
    const wanted = ids.map((id) => id.toLowerCase());
    const result = await ctx.db.transaction(async (tx) => {
      const current = await listRoutines(tx, user.id);
      const own = new Set(current.map((c) => c.id));
      if (wanted.some((id) => !own.has(id))) throw notFound('Routine');
      // Listed ids first in the given order, then any unlisted ones in their existing order.
      const order = [...wanted, ...current.map((c) => c.id).filter((id) => !wanted.includes(id))];
      for (let i = 0; i < order.length; i++) {
        await tx.query(
          'UPDATE routines SET position = $3, updated_at = now() WHERE id = $1 AND user_id = $2 AND position <> $3',
          [order[i], user.id, i],
        );
      }
      return listRoutines(tx, user.id);
    });
    res.json(result);
  });

  r.put('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = uuidParam(req, 'id', 'Routine');
    const input = parse(routineInputSchema, req.body);
    const params: unknown[] = [id, user.id, input.name, input.notes, JSON.stringify(input.items)];
    let posSql = '';
    if (input.position !== undefined) {
      params.push(input.position);
      posSql = ', position = $6';
    }
    const rows = await ctx.db.query<{ id: string }>(
      `UPDATE routines SET name = $3, notes = $4, items = $5::jsonb, updated_at = now()${posSql}
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      params,
    );
    if (!rows[0]) throw notFound('Routine');
    res.json(await getRoutine(ctx.db, user.id, id));
  });

  r.delete('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = uuidParam(req, 'id', 'Routine');
    const deleted = await ctx.db.transaction(async (tx) => {
      const rows = await tx.query('DELETE FROM routines WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id]);
      if (rows.length) await compactPositions(tx, user.id);
      return rows.length > 0;
    });
    if (!deleted) throw notFound('Routine');
    res.status(204).end();
  });

  return r;
}
