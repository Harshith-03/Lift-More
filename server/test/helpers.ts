import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { User, Workout, WorkoutSet } from '../../shared/types';
import { createApp, type AppDeps } from '../app';
import { loadConfig, type AppConfig } from '../config';
import { createPgliteDb, runMigrations, type Db } from '../db';

export async function makeDb(): Promise<Db> {
  const db = await createPgliteDb();
  await runMigrations(db);
  return db;
}

export interface TestAppOpts {
  db?: Db;
  env?: NodeJS.ProcessEnv;
  config?: Partial<AppConfig>;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** App over in-memory PGlite. GEMINI_API_KEY is never inherited from the real env. */
export async function makeApp(opts: TestAppOpts = {}) {
  const db = opts.db ?? (await makeDb());
  const config = loadConfig({ NODE_ENV: 'test', ...opts.env }, { bcryptCost: 4, ...opts.config });
  const deps: AppDeps = { db, config, fetch: opts.fetch ?? noNetwork, now: opts.now };
  return { app: createApp(deps), db, config };
}

/** Default fetch for tests: any network attempt fails loudly. */
export const noNetwork: typeof fetch = async (input) => {
  throw new Error(`network access attempted in test: ${String(input)}`);
};

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${++counter}@example.com`;

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Cookie-carrying API client (manual jar so Secure cookies work over plain-http supertest). */
export class Client {
  cookie: string | undefined;
  user: User | undefined;
  constructor(
    readonly app: Express,
    readonly origin?: string,
  ) {}

  req(method: Method, path: string, body?: unknown) {
    let r = request(this.app)[method](path);
    if (this.cookie) r = r.set('Cookie', this.cookie);
    if (this.origin) r = r.set('Origin', this.origin);
    if (body !== undefined) r = r.set('Content-Type', 'application/json').send(JSON.stringify(body));
    return r.then((res) => {
      const set = res.headers['set-cookie'] as unknown as string[] | undefined;
      const session = set?.find((c) => c.startsWith('lm_session='));
      if (session) {
        const value = session.split(';')[0]!;
        this.cookie = value === 'lm_session=' ? undefined : value;
      }
      return res;
    });
  }
  get(path: string) {
    return this.req('get', path);
  }
  post(path: string, body?: unknown) {
    return this.req('post', path, body);
  }
  put(path: string, body?: unknown) {
    return this.req('put', path, body);
  }
  patch(path: string, body?: unknown) {
    return this.req('patch', path, body);
  }
  del(path: string, body?: unknown) {
    return this.req('delete', path, body);
  }

  async register(email = uniqueEmail(), password = 'correct-horse-1', displayName = 'Test Lifter') {
    const res = await this.post('/api/auth/register', { email, password, displayName, timezone: 'UTC' });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    this.user = res.body as User;
    return { res, email, password, user: this.user };
  }
}

export async function signedIn(app: Express, origin?: string) {
  const c = new Client(app, origin);
  await c.register();
  return c;
}

export function set(partial: Partial<WorkoutSet> & Pick<WorkoutSet, 'exerciseId'>): WorkoutSet {
  return {
    id: randomUUID(),
    exerciseOrder: 0,
    setOrder: 0,
    kind: 'working',
    weightKg: 100,
    reps: 10,
    durationSec: null,
    rpe: null,
    completed: true,
    notes: null,
    ...partial,
  };
}

/** A finished workout: `blocks` = [exerciseId, [[weightKg, reps], ...]] */
export function workout(
  startedAt: string,
  blocks: Array<[string, Array<[number | null, number]>]>,
  extra: Partial<Workout> = {},
): Workout {
  const sets: WorkoutSet[] = [];
  blocks.forEach(([exerciseId, rows], exerciseOrder) =>
    rows.forEach(([weightKg, reps], setOrder) => sets.push(set({ exerciseId, exerciseOrder, setOrder, weightKg, reps }))),
  );
  return {
    id: randomUUID(),
    routineId: null,
    name: 'Session',
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + 60 * 60 * 1000).toISOString(),
    notes: '',
    bodyweightKg: null,
    sets,
    ...extra,
  };
}

export function geminiOk(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
