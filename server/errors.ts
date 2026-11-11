import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import type { ApiError } from '../shared/types';

export type ErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'ai_unavailable'
  | 'internal';

/** Throw anywhere in a route; the central handler turns it into `ApiError` JSON. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly extra: { retryAfterSec?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const unauthorized = (msg = 'Not signed in') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg: string) => new HttpError(403, 'forbidden', msg);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'validation', msg, { details });
export const rateLimited = (msg: string, retryAfterSec: number) =>
  new HttpError(429, 'rate_limited', msg, { retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)) });
export const aiUnavailable = (msg = 'The AI coach is not configured on this server', status = 503) =>
  new HttpError(status, 'ai_unavailable', msg);

export function zodDetails(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message, code: i.code }));
}

/** Parse with zod or throw 400 `validation` with issue details. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest('Invalid request', zodDetails(r.error));
  return r.data;
}

export function sendError(res: Parameters<RequestHandler>[1], err: HttpError) {
  const body: ApiError = { error: err.code, message: err.message };
  if (err.extra.retryAfterSec !== undefined) {
    body.retryAfterSec = err.extra.retryAfterSec;
    res.setHeader('Retry-After', String(err.extra.retryAfterSec));
  }
  if (err.extra.details !== undefined) body.details = err.extra.details;
  res.status(err.status).json(body);
}

export const apiNotFound: RequestHandler = (req, res) => {
  sendError(res, new HttpError(404, 'not_found', `No such endpoint: ${req.method} ${req.originalUrl.split('?')[0]}`));
};

/** Central error handler: every non-2xx is `ApiError` JSON. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return sendError(res, err);
  if (err instanceof z.ZodError) return sendError(res, badRequest('Invalid request', zodDetails(err)));

  // body-parser / http-errors style errors
  const e = err as { type?: string; status?: number; statusCode?: number; expose?: boolean; message?: string };
  const status = e.status ?? e.statusCode;
  if (e.type === 'entity.parse.failed') return sendError(res, badRequest('Malformed JSON body'));
  if (e.type === 'entity.too.large') return sendError(res, new HttpError(413, 'validation', 'Request body too large'));
  if (status && status >= 400 && status < 500 && e.expose) {
    return sendError(res, new HttpError(status, status === 404 ? 'not_found' : 'validation', e.message ?? 'Bad request'));
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  sendError(res, new HttpError(500, 'internal', 'Something went wrong'));
};
