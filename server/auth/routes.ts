import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit, type RateLimitInfo } from 'express-rate-limit';
import type { AppContext } from '../context';
import { isUniqueViolation } from '../db/types';
import { conflict, parse, rateLimited, sendError, unauthorized } from '../errors';
import { findUserByEmail, insertUser } from '../repo/users';
import { toUser } from '../repo/mappers';
import { loginSchema, registerSchema } from '../validation';
import { clearSessionCookie, createSession, hashToken, readToken, requireAuth } from './session';

/** Burned on unknown emails so response timing doesn't reveal which accounts exist. */
let dummyHash: string | undefined;
async function dummyCompare(password: string, cost: number) {
  dummyHash ??= await bcrypt.hash('lift-more-timing-equaliser', cost);
  await bcrypt.compare(password, dummyHash);
}

export function authRouter(ctx: AppContext): Router {
  const r = Router();

  const loginLimiter = rateLimit({
    windowMs: ctx.config.loginRateLimit.windowMs,
    limit: ctx.config.loginRateLimit.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Count failed attempts only: a user who signs in successfully isn't penalised, a brute-forcer is.
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      const reset = (req as typeof req & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime?.getTime();
      const retry = reset ? (reset - Date.now()) / 1000 : ctx.config.loginRateLimit.windowMs / 1000;
      sendError(res, rateLimited('Too many sign-in attempts. Try again later.', retry));
    },
  });

  r.post('/register', async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (await findUserByEmail(ctx.db, body.email)) throw conflict('An account with this email already exists');
    const passwordHash = await bcrypt.hash(body.password, ctx.config.bcryptCost);
    let user;
    try {
      user = await insertUser(ctx.db, {
        id: randomUUID(),
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        timezone: body.timezone ?? 'UTC',
      });
    } catch (err) {
      // Lost a race with a concurrent registration of the same email.
      if (isUniqueViolation(err)) throw conflict('An account with this email already exists');
      throw err;
    }
    await createSession(ctx, res, user.id);
    res.status(201).json(user);
  });

  r.post('/login', loginLimiter, async (req, res) => {
    const body = parse(loginSchema, req.body);
    const row = await findUserByEmail(ctx.db, body.email);
    if (!row) {
      await dummyCompare(body.password, ctx.config.bcryptCost);
      throw unauthorized('Invalid email or password');
    }
    if (!(await bcrypt.compare(body.password, row.password_hash))) throw unauthorized('Invalid email or password');
    await createSession(ctx, res, row.id);
    res.json(toUser(row));
  });

  r.post('/logout', async (req, res) => {
    const token = readToken(req.cookies);
    if (token) await ctx.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    clearSessionCookie(ctx, res);
    res.status(204).end();
  });

  r.get('/me', requireAuth(ctx), (req, res) => {
    res.json(req.auth!.user);
  });

  return r;
}
