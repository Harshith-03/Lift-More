import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, RequestHandler, Response } from 'express';
import type { AppContext } from '../context';
import type { Queryable } from '../db/types';
import { unauthorized } from '../errors';
import { toUser, type UserRow } from '../repo/mappers';

export const SESSION_COOKIE = 'lm_session';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 32 random bytes, base64url. Only its SHA-256 ever touches the DB. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function cookieOptions(ctx: AppContext, maxAgeMs?: number): CookieOptions {
  const opts: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: ctx.config.isProduction,
  };
  if (maxAgeMs !== undefined) opts.maxAge = maxAgeMs;
  return opts;
}

export async function createSession(ctx: AppContext, res: Response, userId: string, q: Queryable = ctx.db) {
  const token = newToken();
  const ttl = ctx.config.sessionTtlDays * DAY_MS;
  const now = ctx.now();
  await q.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
    hashToken(token),
    userId,
    now.toISOString(),
    new Date(now.getTime() + ttl).toISOString(),
  ]);
  // Opportunistic cleanup of this user's dead sessions.
  await q.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at < $2', [userId, now.toISOString()]);
  res.cookie(SESSION_COOKIE, token, cookieOptions(ctx, ttl));
}

export function clearSessionCookie(ctx: AppContext, res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(ctx));
}

function readToken(cookies: unknown): string | undefined {
  const t = (cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
  return typeof t === 'string' && t.length > 0 && t.length <= 200 ? t : undefined;
}

/**
 * Resolves the session cookie → `req.auth`, or 401. Sliding renewal: when fewer than
 * `sessionRenewBelowDays` remain, the expiry is pushed out to a full TTL and the cookie re-issued.
 */
export function requireAuth(ctx: AppContext): RequestHandler {
  return async (req, res, next) => {
    const token = readToken(req.cookies);
    if (!token) throw unauthorized();
    const tokenHash = hashToken(token);
    const rows = await ctx.db.query<UserRow & { session_expires_at: Date | string }>(
      `SELECT u.*, s.expires_at AS session_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    const now = ctx.now();
    if (!row) {
      clearSessionCookie(ctx, res);
      throw unauthorized('Session expired — please sign in again');
    }
    const expiresAt = new Date(row.session_expires_at).getTime();
    if (expiresAt <= now.getTime()) {
      await ctx.db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      clearSessionCookie(ctx, res);
      throw unauthorized('Session expired — please sign in again');
    }
    const ttl = ctx.config.sessionTtlDays * DAY_MS;
    if (expiresAt - now.getTime() < ctx.config.sessionRenewBelowDays * DAY_MS) {
      await ctx.db.query('UPDATE sessions SET expires_at = $2 WHERE token_hash = $1', [
        tokenHash,
        new Date(now.getTime() + ttl).toISOString(),
      ]);
      res.cookie(SESSION_COOKIE, token, cookieOptions(ctx, ttl));
    }
    req.auth = { user: toUser(row), tokenHash };
    next();
  };
}

export { readToken };
