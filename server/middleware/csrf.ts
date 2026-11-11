import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../config';
import { forbidden } from '../errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasBody(req: Request): boolean {
  if (req.headers['transfer-encoding']) return true;
  const len = req.headers['content-length'];
  return len !== undefined && len !== '0';
}

function isJson(req: Request): boolean {
  const ct = req.headers['content-type'];
  if (!ct) return false;
  const mime = ct.split(';')[0]?.trim().toLowerCase();
  return mime === 'application/json';
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * CSRF defence (on top of SameSite=Lax cookies):
 * 1. Mutating requests carrying a body must be `Content-Type: application/json` — HTML forms can't send that
 *    cross-site without a CORS preflight, which we never grant. Body-less requests (DELETE, logout) may omit it.
 * 2. In production, mutating requests must carry an `Origin` equal to APP_ORIGIN or to the request's own host.
 */
export function csrfGuard(config: AppConfig): RequestHandler {
  const allowed = new Set(config.appOrigins.map((o) => o.toLowerCase()));
  return (req, _res, next) => {
    if (!MUTATING.has(req.method)) return next();

    if (hasBody(req) || req.headers['content-type']) {
      if (!isJson(req)) throw forbidden('Mutating requests must use Content-Type: application/json');
    }

    if (config.isProduction) {
      const origin = req.headers.origin;
      if (!origin || origin === 'null') throw forbidden('Missing Origin header');
      const normalized = origin.replace(/\/+$/, '').toLowerCase();
      const host = originHost(origin);
      const requestHosts = [req.headers.host, req.get('x-forwarded-host')?.split(',')[0]?.trim()]
        .filter((h): h is string => Boolean(h))
        .map((h) => h.toLowerCase());
      const ok = allowed.has(normalized) || (host !== null && requestHosts.includes(host));
      if (!ok) throw forbidden('Cross-origin request rejected');
    }
    next();
  };
}
