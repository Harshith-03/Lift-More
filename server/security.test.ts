import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db';
import { Client, makeApp, makeDb, signedIn } from './test/helpers';

let db: Db;
let staticDir: string;
beforeAll(async () => {
  db = await makeDb();
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liftmore-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Lift More</title><div id="root"></div>');
  fs.writeFileSync(path.join(staticDir, 'sw.js'), 'self.addEventListener("fetch",()=>{})');
  fs.writeFileSync(path.join(staticDir, 'registerSW.js'), '/* sw */');
  fs.writeFileSync(path.join(staticDir, 'manifest.webmanifest'), '{"name":"Lift More"}');
  fs.writeFileSync(path.join(staticDir, 'icon.png'), 'png');
  fs.mkdirSync(path.join(staticDir, 'assets'));
  fs.writeFileSync(path.join(staticDir, 'assets', 'index-AbC123.js'), 'console.log(1)');
});
afterAll(async () => {
  await db.close();
  fs.rmSync(staticDir, { recursive: true, force: true });
});

describe('CSRF', () => {
  it('rejects mutating requests that are not application/json', async () => {
    const { app } = await makeApp({ db });
    const c = await signedIn(app);
    const text = await request(app)
      .post('/api/routines')
      .set('Cookie', c.cookie!)
      .set('Content-Type', 'text/plain')
      .send('{"name":"x","notes":"","items":[]}');
    expect(text.status).toBe(403);
    expect(text.body.error).toBe('forbidden');

    const form = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'a@b.co', password: 'x' });
    expect(form.status).toBe(403);

    const put = await request(app)
      .put('/api/bodyweight/2026-11-01')
      .set('Cookie', c.cookie!)
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .send('--x--');
    expect(put.status).toBe(403);
    expect((await c.get('/api/bodyweight')).body).toEqual([]);
  });

  it('allows body-less DELETE / POST without a content type', async () => {
    const { app } = await makeApp({ db });
    const c = await signedIn(app);
    const del = await request(app).delete('/api/bodyweight/2026-01-01').set('Cookie', c.cookie!);
    expect(del.status).toBe(404); // got past CSRF, entry just doesn't exist
    const out = await request(app).post('/api/auth/logout').set('Cookie', c.cookie!);
    expect(out.status).toBe(204);
  });

  it('accepts application/json with a charset', async () => {
    const { app } = await makeApp({ db });
    const c = await signedIn(app);
    const res = await request(app)
      .put('/api/bodyweight/2026-11-01')
      .set('Cookie', c.cookie!)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ weightKg: 81 }));
    expect(res.status).toBe(200);
  });

  describe('production Origin check', () => {
    const origin = 'https://lift.example';

    it('rejects a missing or foreign Origin, accepts APP_ORIGIN', async () => {
      const { app } = await makeApp({ db, env: { NODE_ENV: 'production', APP_ORIGIN: origin } });
      const c = new Client(app, origin);
      await c.register();

      const none = await request(app)
        .put('/api/bodyweight/2026-11-01')
        .set('Cookie', c.cookie!)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ weightKg: 80 }));
      expect(none.status).toBe(403);
      expect(none.body.error).toBe('forbidden');

      for (const bad of ['https://evil.example', 'null', 'https://lift.example.evil.com']) {
        const r = await request(app)
          .put('/api/bodyweight/2026-11-01')
          .set('Cookie', c.cookie!)
          .set('Origin', bad)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ weightKg: 80 }));
        expect(r.status, bad).toBe(403);
      }

      const ok = await c.put('/api/bodyweight/2026-11-01', { weightKg: 80 });
      expect(ok.status).toBe(200);
      // GETs are never Origin-checked.
      expect((await request(app).get('/api/bodyweight').set('Cookie', c.cookie!)).status).toBe(200);
    });

    it('without APP_ORIGIN, accepts an Origin matching the request host', async () => {
      const { app } = await makeApp({ db, env: { NODE_ENV: 'production' } });
      const res = await request(app)
        .post('/api/auth/register')
        .set('Host', 'lift.onrender.example')
        .set('Origin', 'https://lift.onrender.example')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: `host-${Date.now()}@example.com`, password: 'long-enough-1', displayName: 'H' }));
      expect(res.status).toBe(201);
      const cross = await request(app)
        .post('/api/auth/login')
        .set('Host', 'lift.onrender.example')
        .set('Origin', 'https://attacker.example')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.co', password: 'whatever1' }));
      expect(cross.status).toBe(403);
    });
  });
});

describe('security headers', () => {
  it('sets a CSP suitable for the Vite PWA and a referrer policy that keeps Origin', async () => {
    const { app } = await makeApp({ db });
    const res = await request(app).get('/api/health');
    const csp = res.headers['content-security-policy'] as string;
    for (const d of [
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
    ]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/health', async () => {
    const { app } = await makeApp({ db });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'pglite', ai: false });
    const withKey = await makeApp({ db, env: { GEMINI_API_KEY: 'k' } });
    expect((await request(withKey.app).get('/api/health')).body.ai).toBe(true);
  });

  it('unknown /api routes → 404 ApiError JSON (even signed out)', async () => {
    const { app } = await makeApp({ db });
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
    expect((await request(app).post('/api/nope').set('Content-Type', 'application/json').send('{}')).status).toBe(404);
  });

  it('protected routes → 401 when signed out', async () => {
    const { app } = await makeApp({ db });
    for (const p of ['/api/routines', '/api/workouts', '/api/stats', '/api/plan', '/api/coach/status', '/api/export']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    }
  });

  it('enforces the 1 MB body limit (413 ApiError)', async () => {
    const { app } = await makeApp({ db });
    const c = await signedIn(app);
    const res = await c.post('/api/routines', { name: 'x', notes: 'a'.repeat(1_100_000), items: [] });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('validation');
  });
});

describe('production static SPA', () => {
  async function prodApp() {
    return (await makeApp({ db, env: { NODE_ENV: 'production' }, config: { staticDir } })).app;
  }

  it('serves index.html at / and as the fallback for client routes', async () => {
    const app = await prodApp();
    for (const p of ['/', '/history', '/workout/active', '/progress/barbell-bench-press']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('<div id="root">');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('caches hashed assets immutably and the shell files never', async () => {
    const app = await prodApp();
    const asset = await request(app).get('/assets/index-AbC123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const p of ['/sw.js', '/registerSW.js', '/manifest.webmanifest', '/index.html']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers['cache-control'], p).toBe('no-cache');
    }
    expect((await request(app).get('/icon.png')).status).toBe(200);
  });

  it('missing hashed assets 404 instead of returning HTML', async () => {
    const app = await prodApp();
    const res = await request(app).get('/assets/index-gone.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<div id="root">');
  });

  it('never falls back to the SPA for /api', async () => {
    const app = await prodApp();
    const res = await request(app).get('/api/not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('not_found');
    expect((await request(app).get('/api/health')).body.ok).toBe(true);
  });
});
