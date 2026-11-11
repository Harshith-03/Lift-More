import type { Request } from 'express';
import { notFound } from '../errors';
import { isoDate, isUuid } from '../validation';

/** A uuid route param; anything else can't exist → 404 (never a SQL cast error). */
export function uuidParam(req: Request, name: string, what: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !isUuid(v)) throw notFound(what);
  return v.toLowerCase();
}

export function dateParam(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !isoDate.safeParse(v).success) throw notFound('Bodyweight entry');
  return v;
}

export function stringParam(req: Request, name: string, what: string, max = 100): string {
  const v = req.params[name];
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw notFound(what);
  return v;
}
