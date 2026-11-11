import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import type { Db } from './db';
import { Client, makeApp, makeDb, uniqueEmail, workout } from './test/helpers';

let db: Db;
beforeAll(async () => {
  db = await makeDb();
});
afterAll(async () => {
  await db.close();
});

function sessionCookie(res: request.Response): string {
  const set = res.headers['set-cookie'] as unknown as string[];
  const c = set.find((x) => x.startsWith('lm_session='));
  if (!c) throw new Error('no session cookie');
  return c;
}

describe('auth', () => {
  it('registers, reads /me, logs out and back in', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    const email = uniqueEmail('Mixed.Case');
    const reg = await c.post('/api/auth/register', {
      email: `  ${email.toUpperCase()} `,
      password: 'hunter2hunter2',
      displayName: 'Ada',
      timezone: 'Europe/London',
    });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({
      email: email.toLowerCase(),
      displayName: 'Ada',
      unit: 'kg',
      goal: 'hypertrophy',
      experience: 'beginner',
      daysPerWeek: 3,
      defaultRestSec: 120,
      timezone: 'Europe/London',
      barWeightKg: 20,
      onboarded: false,
    });
    expect(reg.body).not.toHaveProperty('passwordHash');
    expect(reg.body).not.toHaveProperty('password_hash');
    expect(new Date(reg.body.createdAt).toISOString()).toBe(reg.body.createdAt);

    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(reg.body.id);

    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect(c.cookie).toBeUndefined();
    const after = await c.get('/api/auth/me');
    expect(after.status).toBe(401);
    expect(after.body).toMatchObject({ error: 'unauthorized' });

    const login = await c.post('/api/auth/login', { email: email.toUpperCase(), password: 'hunter2hunter2' });
    expect(login.status).toBe(200);
    expect(login.body.id).toBe(reg.body.id);
    expect((await c.get('/api/auth/me')).status).toBe(200);
  });

  it('a logged-out token is dead even if replayed', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    await c.register();
    const stolen = c.cookie!;
    await c.post('/api/auth/logout');
    const res = await request(app).get('/api/auth/me').set('Cookie', stolen);
    expect(res.status).toBe(401);
  });

  it('rejects bad passwords and unknown emails with 401', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    const { email } = await c.register();
    const bad = await new Client(app).post('/api/auth/login', { email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: 'unauthorized', message: 'Invalid email or password' });
    const unknown = await new Client(app).post('/api/auth/login', { email: uniqueEmail(), password: 'whatever1' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(bad.body.message);
  });

  it('409 on duplicate email (case-insensitive)', async () => {
    const { app } = await makeApp({ db });
    const { email } = await new Client(app).register();
    const dup = await new Client(app).post('/api/auth/register', {
      email: email.toUpperCase(),
      password: 'another-pass-1',
      displayName: 'Dup',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('conflict');
    expect(dup.headers['set-cookie']).toBeUndefined();
  });

  it('400 validation with details for weak passwords / bad emails / bad timezones', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    const res = await c.post('/api/auth/register', { email: 'not-an-email', password: 'short', displayName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
    const paths = (res.body.details as Array<{ path: string }>).map((d) => d.path).sort();
    expect(paths).toEqual(['displayName', 'email', 'password']);
    const tz = await c.post('/api/auth/register', {
      email: uniqueEmail(),
      password: 'long-enough-1',
      displayName: 'X',
      timezone: 'Mars/Olympus',
    });
    expect(tz.status).toBe(400);
  });

  it('malformed JSON → 400 ApiError', async () => {
    const { app } = await makeApp({ db });
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation', message: 'Malformed JSON body' });
  });

  it('rate-limits failed logins: 10 per window per IP, then 429 with retryAfterSec', async () => {
    const { app } = await makeApp({ db });
    const { email, password } = await new Client(app).register();
    for (let i = 0; i < 10; i++) {
      const r = await new Client(app).post('/api/auth/login', { email, password: `nope-${i}-xxxx` });
      expect(r.status).toBe(401);
    }
    const blocked = await new Client(app).post('/api/auth/login', { email, password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('rate_limited');
    expect(blocked.body.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.body.retryAfterSec).toBeLessThanOrEqual(15 * 60);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('successful logins do not count toward the limit', async () => {
    const { app } = await makeApp({ db });
    const { email, password } = await new Client(app).register();
    for (let i = 0; i < 12; i++) {
      expect((await new Client(app).post('/api/auth/login', { email, password })).status).toBe(200);
    }
  });
});

describe('session cookie', () => {
  it('dev: HttpOnly; SameSite=Lax; Path=/; Max-Age 30 days; not Secure', async () => {
    const { app } = await makeApp({ db });
    const { res } = await new Client(app).register();
    const c = sessionCookie(res);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    expect(c).toMatch(/Max-Age=2592000/);
    expect(c).not.toMatch(/Secure/i);
  });

  it('production: also Secure', async () => {
    const origin = 'https://lift.example';
    const { app } = await makeApp({ db, env: { NODE_ENV: 'production', APP_ORIGIN: origin } });
    const { res } = await new Client(app, origin).register();
    expect(sessionCookie(res)).toMatch(/; Secure/i);
  });

  it('stores only the SHA-256 of a 32-byte base64url token', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    const { user } = await c.register();
    const token = c.cookie!.slice('lm_session='.length);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const rows = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE user_id = $1', [user.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(rows[0]!.token_hash).not.toContain(token);
  });

  it('slides the expiry when < 15 days remain, and expires after 30 days idle', async () => {
    let now = new Date('2026-11-01T00:00:00Z');
    const { app } = await makeApp({ db, now: () => now });
    const c = new Client(app);
    const { user } = await c.register();
    const expiry = async () =>
      new Date(
        (await db.query<{ e: Date }>('SELECT expires_at AS e FROM sessions WHERE user_id = $1', [user.id]))[0]!.e,
      ).toISOString();
    expect(await expiry()).toBe('2026-12-01T00:00:00.000Z');

    now = new Date('2026-11-10T00:00:00Z'); // 21 days left → untouched
    const early = await c.get('/api/auth/me');
    expect(early.status).toBe(200);
    expect(early.headers['set-cookie']).toBeUndefined();
    expect(await expiry()).toBe('2026-12-01T00:00:00.000Z');

    now = new Date('2026-11-20T00:00:00Z'); // 11 days left → renewed to +30d
    const renewed = await c.get('/api/auth/me');
    expect(renewed.status).toBe(200);
    expect(sessionCookie(renewed)).toMatch(/Max-Age=2592000/);
    expect(await expiry()).toBe('2026-12-20T00:00:00.000Z');

    now = new Date('2026-12-21T00:00:00Z'); // past expiry
    const dead = await c.get('/api/auth/me');
    expect(dead.status).toBe(401);
    expect(await db.query('SELECT 1 FROM sessions WHERE user_id = $1', [user.id])).toHaveLength(0);
  });

  it('uses bcrypt cost 10 by default', async () => {
    expect(loadConfig({}).bcryptCost).toBe(10);
    const { app } = await makeApp({ db, config: { bcryptCost: 10 } });
    const { user } = await new Client(app).register();
    const [row] = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(bcrypt.getRounds(row!.password_hash)).toBe(10);
  });
});

describe('account settings + deletion', () => {
  it('PATCH /api/me updates settings and validates', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    await c.register();
    const res = await c.patch('/api/me', {
      unit: 'lb',
      goal: 'strength',
      experience: 'intermediate',
      daysPerWeek: 4,
      defaultRestSec: 150,
      timezone: 'America/New_York',
      barWeightKg: 20.41,
      onboarded: true,
      displayName: 'New Name',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      unit: 'lb',
      goal: 'strength',
      experience: 'intermediate',
      daysPerWeek: 4,
      defaultRestSec: 150,
      timezone: 'America/New_York',
      barWeightKg: 20.41,
      onboarded: true,
      displayName: 'New Name',
    });
    expect((await c.get('/api/auth/me')).body.unit).toBe('lb');
    expect((await c.patch('/api/me', { daysPerWeek: 9 })).status).toBe(400);
    expect((await c.patch('/api/me', { unit: 'stone' })).status).toBe(400);
  });

  it('DELETE /api/me needs the password and cascades everything', async () => {
    const { app } = await makeApp({ db });
    const c = new Client(app);
    const { user, password } = await c.register();
    const ex = await c.post('/api/exercises/custom', {
      name: 'Zercher Squat',
      primaryMuscle: 'quads',
      secondaryMuscles: ['glutes'],
      equipment: 'barbell',
      mechanic: 'compound',
      trackingType: 'weight_reps',
    });
    await c.post('/api/routines', {
      name: 'Legs',
      notes: '',
      items: [{ exerciseId: ex.body.id, sets: 3, repMin: 5, repMax: 8, restSec: 120 }],
    });
    const w = workout('2026-11-02T10:00:00.000Z', [[ex.body.id, [[100, 5]]]]);
    expect((await c.put(`/api/workouts/${w.id}`, w)).status).toBe(200);
    await c.put('/api/bodyweight/2026-11-02', { weightKg: 80 });
    await db.query(`INSERT INTO ai_usage (user_id, day, count) VALUES ($1, '2026-11-02', 1)`, [user.id]);

    const wrong = await c.del('/api/me', { password: 'not-it-at-all' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe('forbidden');

    expect((await c.del('/api/me', { password })).status).toBe(204);
    for (const table of ['users', 'sessions', 'custom_exercises', 'routines', 'workouts', 'workout_sets', 'bodyweight', 'ai_usage']) {
      const col = table === 'users' ? 'id' : 'user_id';
      const rows = await db.query(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [user.id]);
      expect(rows, table).toHaveLength(0);
    }
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });
});
