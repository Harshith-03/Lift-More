import type { Request } from 'express';
import type { User } from '../shared/types';
import type { Coach } from './ai/coach';
import type { AppConfig } from './config';
import type { Db } from './db/types';
import { unauthorized } from './errors';

/** Everything a route needs, built once per app. */
export interface AppContext {
  db: Db;
  config: AppConfig;
  now: () => Date;
  coach: Coach;
}

export interface AuthInfo {
  user: User;
  tokenHash: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

/** The signed-in user (requireAuth must have run). */
export function currentUser(req: Request): User {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}
