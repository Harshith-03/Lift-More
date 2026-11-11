import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { createCoach } from './ai/coach';
import { authRouter } from './auth/routes';
import { requireAuth } from './auth/session';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import type { Db } from './db/types';
import { apiNotFound, errorHandler, HttpError } from './errors';
import { csrfGuard } from './middleware/csrf';
import { mountStatic } from './middleware/static';
import { bodyweightRouter } from './routes/bodyweight';
import { coachRouter } from './routes/coach';
import { exercisesRouter } from './routes/exercises';
import { historyRouter, planRouter, statsRouter } from './routes/insights';
import { meRouter } from './routes/me';
import { routinesRouter } from './routes/routines';
import { exportRouter, importRouter } from './routes/transfer';
import { workoutsRouter } from './routes/workouts';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  /** Injected into the AI layer (tests pass a mock; never real network in tests). */
  fetch?: typeof fetch;
  /** Clock for sessions, plans, rate limits. */
  now?: () => Date;
}

export function createApp(deps: AppDeps): Express {
  const now = deps.now ?? (() => new Date());
  const ctx: AppContext = {
    db: deps.db,
    config: deps.config,
    now,
    coach: createCoach({ db: deps.db, config: deps.config.gemini, fetch: deps.fetch, now }),
  };

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          // Render terminates TLS; forcing upgrades would break `npm start` on plain-http localhost.
          'upgrade-insecure-requests': null,
        },
      },
      // Browsers send `Origin: null` on same-origin POSTs under `no-referrer`, which would trip the CSRF check.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.use('/api', apiRouter(ctx));
  if (deps.config.staticDir) mountStatic(app, deps.config.staticDir);
  app.use(errorHandler);
  return app;
}

function apiRouter(ctx: AppContext): Router {
  const api = Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(csrfGuard(ctx.config));
  api.use('/import', express.json({ limit: '15mb' }));
  api.use(express.json({ limit: '1mb' }));

  api.get('/health', async (_req, res) => {
    try {
      await ctx.db.query('SELECT 1');
    } catch {
      throw new HttpError(503, 'internal', 'Database unavailable');
    }
    res.json({ ok: true, db: ctx.db.kind, ai: ctx.coach.enabled });
  });

  const auth = requireAuth(ctx);
  api.use('/auth', authRouter(ctx));
  api.use('/me', auth, meRouter(ctx));
  api.use('/exercises', auth, exercisesRouter(ctx));
  api.use('/routines', auth, routinesRouter(ctx));
  api.use('/workouts', auth, workoutsRouter(ctx));
  api.use('/history', auth, historyRouter(ctx));
  api.use('/stats', auth, statsRouter(ctx));
  api.use('/plan', auth, planRouter(ctx));
  api.use('/bodyweight', auth, bodyweightRouter(ctx));
  api.use('/coach', auth, coachRouter(ctx));
  api.use('/export', auth, exportRouter(ctx));
  api.use('/import', auth, importRouter(ctx));

  api.use(apiNotFound);
  return api;
}
