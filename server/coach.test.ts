import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CoachReview, CoachStatus, Routine, WeeklyPlan } from '../shared/types';
import {
  buildAskContext,
  capWords,
  clampAdjustmentKg,
  sanitizeReview,
  type SanitizeContext,
} from './ai/coach';
import { createGemini, extractJson, retryAfterFrom } from './ai/gemini';
import { secondsUntilUtcMidnight, TokenBucket } from './ai/rateLimit';
import type { Db } from './db';
import { HttpError } from './errors';
import { Client, geminiOk, makeApp, makeDb, signedIn, workout } from './test/helpers';

const NOW = new Date('2026-11-11T12:00:00.000Z'); // Wednesday; week starts 2026-11-09
const KEY = 'test-gemini-key';

// ───────────────────────────── pure units ─────────────────────────────

describe('coach post-processing (unit)', () => {
  const plan: WeeklyPlan = {
    weekStart: '2026-11-09',
    generatedAt: NOW.toISOString(),
    nextRoutineId: 'r1',
    routines: [
      {
        routineId: 'r1',
        routineName: 'Push',
        exercises: [
          {
            exerciseId: 'barbell-bench-press',
            action: 'increase_reps',
            sets: 3,
            weightKg: 100,
            repsPerSet: [9, 9, 9],
            repMin: 8,
            repMax: 12,
            reason: '',
            lastPerformance: null,
            e1rmKg: 130,
            stalled: false,
          },
          {
            exerciseId: 'pull-up',
            action: 'increase_reps',
            sets: 3,
            weightKg: null,
            repsPerSet: [8, 8, 8],
            repMin: 6,
            repMax: 10,
            reason: '',
            lastPerformance: null,
            e1rmKg: null,
            stalled: false,
          },
        ],
      },
    ],
    volume: [],
    recommendations: [],
    deloadRecommended: false,
  };
  const routines: Routine[] = [
    {
      id: 'r1',
      name: 'Push',
      notes: '',
      position: 0,
      items: [
        { exerciseId: 'barbell-bench-press', sets: 3, repMin: 8, repMax: 12, restSec: 120 },
        { exerciseId: 'pull-up', sets: 3, repMin: 6, repMax: 10, restSec: 120 },
      ],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
  ];
  const ctx: SanitizeContext = {
    unit: 'kg',
    plan,
    routines,
    allowedExerciseIds: new Set(['barbell-bench-press', 'pull-up', 'dumbbell-bench-press', 'cable-fly']),
    weekStart: '2026-11-09',
    model: 'gemini-test',
    now: NOW,
  };
  const base = { summary: 'Solid week.', wins: ['Benched 100'], concerns: [], tip: 'Sleep 8h.' };

  it('clamps weights to ±15% of the rule weight and keeps them loadable', () => {
    expect(clampAdjustmentKg(150, 100, 'kg')).toBe(115);
    expect(clampAdjustmentKg(10, 100, 'kg')).toBe(85);
    expect(clampAdjustmentKg(103.3, 100, 'kg')).toBe(103.5);
    const lb = clampAdjustmentKg(400, 100, 'lb'); // 100 kg ≈ 220.5 lb → max 253.5 lb
    expect(lb).toBeLessThanOrEqual(115 + 1e-9);
    expect(lb).toBeGreaterThan(114);
  });

  it('drops unknown exercise/routine ids, clamps adjustments, tags source=ai', () => {
    const out = sanitizeReview(
      {
        ...base,
        adjustments: [
          { exerciseId: 'barbell-bench-press', weight: 150, reps: 8, reason: 'Feeling strong' },
          { exerciseId: 'barbell-bench-press', weight: 90, reps: 8, reason: 'duplicate' },
          { exerciseId: 'made-up-lift', weight: 50, reps: 5, reason: 'hallucinated' },
          { exerciseId: 'cable-fly', weight: 20, reps: 12, reason: 'not in plan' },
          { exerciseId: 'pull-up', weight: 10, reps: 9, reason: 'no rule weight to clamp' },
          { exerciseId: 'barbell-bench-press-x', weight: null, reps: null, reason: 'nothing' },
          'garbage',
        ],
        exerciseChanges: [
          { type: 'swap', exerciseId: 'barbell-bench-press', replacementId: 'dumbbell-bench-press', routineId: 'r1', reason: 'shoulders' },
          { type: 'swap', exerciseId: 'barbell-bench-press', replacementId: 'imaginary-press', routineId: 'r1', reason: 'bad replacement' },
          { type: 'add', exerciseId: 'cable-fly', routineId: 'r-unknown', reason: 'unknown routine' },
          { type: 'add', exerciseId: 'cable-fly', routineId: 'r1', reason: 'more chest' },
          { type: 'add', exerciseId: 'unicorn-curl', routineId: 'r1', reason: 'unknown exercise' },
          { type: 'remove', exerciseId: 'cable-fly', routineId: 'r1', reason: 'not in routine' },
          { type: 'remove', exerciseId: 'pull-up', reason: 'routine inferred' },
          { type: 'teleport', exerciseId: 'pull-up', reason: 'bad type' },
        ],
      },
      ctx,
    );
    expect(out.adjustments).toEqual([
      { exerciseId: 'barbell-bench-press', weightKg: 115, reps: 8, reason: 'Feeling strong' },
      { exerciseId: 'pull-up', weightKg: null, reps: 9, reason: 'no rule weight to clamp' },
    ]);
    expect(out.exerciseChanges).toEqual([
      { type: 'swap', exerciseId: 'barbell-bench-press', replacementId: 'dumbbell-bench-press', routineId: 'r1', reason: 'shoulders', source: 'ai' },
      { type: 'add', exerciseId: 'cable-fly', routineId: 'r1', reason: 'more chest', source: 'ai' },
      { type: 'remove', exerciseId: 'pull-up', routineId: 'r1', reason: 'routine inferred', source: 'ai' },
    ]);
    expect(out).toMatchObject({ weekStart: '2026-11-09', model: 'gemini-test', createdAt: NOW.toISOString(), summary: 'Solid week.' });
  });

  it('converts lb adjustments back to kg', () => {
    const out = sanitizeReview(
      { ...base, adjustments: [{ exerciseId: 'barbell-bench-press', weight: 225, reps: 8, reason: 'x' }], exerciseChanges: [] },
      { ...ctx, unit: 'lb' },
    );
    expect(out.adjustments[0]!.weightKg).toBeCloseTo(225 * 0.45359237, 3);
  });

  it('rejects output missing required fields', () => {
    expect(() => sanitizeReview({ wins: [] }, ctx)).toThrow(HttpError);
  });

  it('caps answers at ~120 words', () => {
    const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const capped = capWords(long);
    expect(capped.split(' ')).toHaveLength(120);
    expect(capped.endsWith('…')).toBe(true);
    expect(capWords('short answer.')).toBe('short answer.');
  });

  it('extracts JSON from fenced / chatty output', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here you go: {"a":3} hope that helps')).toEqual({ a: 3 });
    expect(() => extractJson('no json here')).toThrow(HttpError);
  });

  it('parses Gemini retry hints', () => {
    const body = { error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }] } };
    expect(retryAfterFrom(new Response(null, { status: 429 }), body)).toBe(17);
    expect(retryAfterFrom(new Response(null, { status: 429, headers: { 'retry-after': '5' } }), body)).toBe(5);
    expect(retryAfterFrom(new Response(null, { status: 429 }), null)).toBe(60);
  });

  it('token bucket: N immediate calls, then rejects with retryAfterSec, then refills', () => {
    let t = NOW.getTime();
    const b = new TokenBucket(3, () => new Date(t));
    expect([b.tryTake().ok, b.tryTake().ok, b.tryTake().ok]).toEqual([true, true, true]);
    const denied = b.tryTake();
    expect(denied).toEqual({ ok: false, retryAfterSec: 20 });
    t += 20_000;
    expect(b.tryTake().ok).toBe(true);
    expect(b.tryTake().ok).toBe(false);
  });

  it('seconds until UTC midnight', () => {
    expect(secondsUntilUtcMidnight(NOW)).toBe(12 * 3600);
  });

  it('ask context carries no identity', () => {
    const ctxObj = buildAskContext(
      {
        id: 'user-uuid-123',
        email: 'secret@example.com',
        displayName: 'Secret Name',
        unit: 'kg',
        goal: 'strength',
        experience: 'beginner',
        daysPerWeek: 3,
        defaultRestSec: 120,
        timezone: 'UTC',
        barWeightKg: 20,
        onboarded: true,
        createdAt: NOW.toISOString(),
      },
      plan,
      [],
    );
    const s = JSON.stringify(ctxObj);
    expect(s).not.toContain('secret@example.com');
    expect(s).not.toContain('user-uuid-123');
    expect(s).not.toContain('Secret Name');
    expect(s).toContain('Push');
  });

  it('gemini client falls back on 404 and remembers the live model', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return String(url).includes('/models/gemini-dead:') ? new Response('{}', { status: 404 }) : geminiOk({ ok: true });
    }) as unknown as typeof fetch;
    const g = createGemini({ apiKey: KEY, model: 'gemini-dead', fetch: fetchMock });
    expect(await g.generateJson({ system: 's', prompt: 'p', schema: {} })).toEqual({ data: { ok: true }, model: 'gemini-flash-latest' });
    await g.generateJson({ system: 's', prompt: 'p', schema: {} });
    expect(calls.filter((u) => u.includes('gemini-dead'))).toHaveLength(1);
  });

  it('gemini client times out via AbortController', async () => {
    const fetchMock = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as unknown as typeof fetch;
    const g = createGemini({ apiKey: KEY, model: 'm', fetch: fetchMock, timeoutMs: 30 });
    await expect(g.generateJson({ system: 's', prompt: 'p', schema: {} })).rejects.toMatchObject({ status: 504, code: 'ai_unavailable' });
  });
});

// ───────────────────────────── HTTP ─────────────────────────────

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { contents: Array<{ parts: Array<{ text: string }> }>; systemInstruction: { parts: Array<{ text: string }> }; generationConfig: Record<string, unknown> };
}

function mockGemini(responder: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body)),
    };
    calls.push(call);
    return responder(call, calls.length);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const reviewPayload = (benchWeight: number) => ({
  summary: 'Good first week back. Bench is moving well.',
  wins: ['Hit all reps on bench'],
  concerns: ['Low pulling volume'],
  adjustments: [
    { exerciseId: 'barbell-bench-press', weight: benchWeight, reps: 8, reason: 'Bar speed looked great' },
    { exerciseId: 'totally-fake-exercise', weight: 40, reps: 10, reason: 'hallucinated' },
  ],
  exerciseChanges: [
    { type: 'add', exerciseId: 'not-a-real-id', routineId: null, replacementId: null, reason: 'hallucinated' },
    { type: 'swap', exerciseId: 'barbell-bench-press', replacementId: 'dumbbell-bench-press', routineId: 'bogus-routine', reason: 'bad routine id' },
    { type: 'add', exerciseId: 'barbell-row', routineId: '__ROUTINE__', replacementId: null, reason: 'Balance pressing with rows' },
  ],
  tip: 'Pause the first rep of each set.',
});

let db: Db;
beforeAll(async () => {
  db = await makeDb();
});
afterAll(async () => {
  await db.close();
});

async function coachApp(opts: { fetch?: typeof fetch; rpm?: number; daily?: number; key?: string | null; model?: string } = {}) {
  const env: NodeJS.ProcessEnv = {
    GEMINI_RPM: String(opts.rpm ?? 100),
    GEMINI_USER_DAILY_LIMIT: String(opts.daily ?? 100),
    GEMINI_MODEL: opts.model ?? 'gemini-test-model',
  };
  if (opts.key !== null) env.GEMINI_API_KEY = opts.key ?? KEY;
  return (await makeApp({ db, env, fetch: opts.fetch, now: () => NOW })).app;
}

async function lifterWithHistory(app: Express) {
  const c = await signedIn(app);
  await c.patch('/api/me', { onboarded: true, goal: 'hypertrophy', experience: 'intermediate' });
  const routine = (
    await c.post('/api/routines', {
      name: 'Push Day',
      notes: '',
      items: [{ exerciseId: 'barbell-bench-press', sets: 3, repMin: 8, repMax: 12, restSec: 120 }],
    })
  ).body as Routine;
  for (const day of ['2026-11-02T17:00:00.000Z', '2026-11-09T17:00:00.000Z']) {
    const w = workout(day, [['barbell-bench-press', [[100, 10], [100, 9], [100, 9]]]], { routineId: routine.id });
    expect((await c.put(`/api/workouts/${w.id}`, w)).status).toBe(200);
  }
  await c.put('/api/bodyweight/2026-11-09', { weightKg: 84 });
  const plan = (await c.get('/api/plan')).body as WeeklyPlan;
  const rule = plan.routines[0]!.exercises.find((e) => e.exerciseId === 'barbell-bench-press')!;
  return { c, routine, ruleWeightKg: rule.weightKg! };
}

describe('coach endpoints without a key', () => {
  let app: Express;
  beforeAll(async () => {
    app = await coachApp({ key: null });
  });

  it('status says disabled; review/ask → 503 ai_unavailable', async () => {
    const c = await signedIn(app);
    expect((await c.get('/api/coach/status')).body).toEqual({ enabled: false, remainingToday: 0 });
    for (const res of [
      await c.get('/api/coach/review'),
      await c.post('/api/coach/review', {}),
      await c.post('/api/coach/ask', { question: 'How many sets for chest?' }),
    ]) {
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('ai_unavailable');
    }
  });
});

describe('POST /api/coach/review', () => {
  it('returns a validated review; filters unknown ids; clamps; caches; force bypasses', async () => {
    let routineId = '';
    const gem = mockGemini(() => geminiOk(JSON.parse(JSON.stringify(reviewPayload(200)).replace('__ROUTINE__', routineId))));
    const app = await coachApp({ fetch: gem.fetch });
    const { c, routine, ruleWeightKg } = await lifterWithHistory(app);
    routineId = routine.id;
    expect(ruleWeightKg).toBeGreaterThan(0);

    expect((await c.get('/api/coach/review')).status).toBe(404);

    const res = await c.post('/api/coach/review', {});
    expect(res.status).toBe(200);
    const review = res.body as CoachReview;
    expect(review).toMatchObject({
      weekStart: '2026-11-09',
      model: 'gemini-test-model',
      summary: 'Good first week back. Bench is moving well.',
      wins: ['Hit all reps on bench'],
      concerns: ['Low pulling volume'],
      tip: 'Pause the first rep of each set.',
      cached: false,
    });
    expect(review.createdAt).toBe(NOW.toISOString());
    // unknown exercise dropped; 200 kg clamped to +15% of the rule weight
    expect(review.adjustments).toHaveLength(1);
    expect(review.adjustments[0]!.exerciseId).toBe('barbell-bench-press');
    expect(review.adjustments[0]!.weightKg).toBe(clampAdjustmentKg(200, ruleWeightKg, 'kg'));
    expect(review.adjustments[0]!.weightKg!).toBeLessThanOrEqual(ruleWeightKg * 1.15 + 1e-9);
    expect(review.exerciseChanges).toEqual([
      { type: 'add', exerciseId: 'barbell-row', routineId: routine.id, reason: 'Balance pressing with rows', source: 'ai' },
    ]);

    // request shape (SPEC §7) + privacy
    expect(gem.calls).toHaveLength(1);
    const call = gem.calls[0]!;
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
    expect(call.headers['x-goog-api-key']).toBe(KEY);
    expect(call.body.generationConfig).toMatchObject({ temperature: 0.4, responseMimeType: 'application/json' });
    expect(call.body.generationConfig.responseSchema).toBeTruthy();
    const sent = JSON.stringify(call.body);
    expect(sent).not.toContain(c.user!.email);
    expect(sent).not.toContain(c.user!.id);
    expect(sent).not.toContain(c.user!.displayName);
    expect(sent).toContain('barbell-bench-press');
    expect(sent).toContain('allowedExercises');

    // cache hit
    const again = await c.post('/api/coach/review', {});
    expect(again.status).toBe(200);
    expect(again.body.cached).toBe(true);
    expect(again.body.summary).toBe(review.summary);
    expect(gem.calls).toHaveLength(1);
    const latest = await c.get('/api/coach/review');
    expect(latest.status).toBe(200);
    expect(latest.body).toMatchObject({ summary: review.summary, cached: true });

    // force bypasses the cache
    const forced = await c.post('/api/coach/review', { force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.cached).toBe(false);
    expect(gem.calls).toHaveLength(2);

    // new data → new input hash → cache miss
    const w = workout('2026-11-10T17:00:00.000Z', [['barbell-bench-press', [[102.5, 8]]]], { routineId: routine.id });
    await c.put(`/api/workouts/${w.id}`, w);
    expect((await c.post('/api/coach/review', {})).body.cached).toBe(false);
    expect(gem.calls).toHaveLength(3);

    const status = (await c.get('/api/coach/status')).body as CoachStatus;
    expect(status).toEqual({ enabled: true, remainingToday: 97 });
  });

  it('Gemini 429 → our 429 rate_limited with retryAfterSec (and no daily charge)', async () => {
    const gem = mockGemini(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }],
            },
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        ),
    );
    const app = await coachApp({ fetch: gem.fetch, daily: 5 });
    const { c } = await lifterWithHistory(app);
    const res = await c.post('/api/coach/review', {});
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'rate_limited', retryAfterSec: 17 });
    expect(res.headers['retry-after']).toBe('17');
    expect((await c.get('/api/coach/status')).body.remainingToday).toBe(5);
    const ask = await c.post('/api/coach/ask', { question: 'Should I deload?' });
    expect(ask.status).toBe(429);
  });

  it('invalid model output → 502 ai_unavailable, refunded', async () => {
    const gem = mockGemini(() => geminiOk({ nope: true }));
    const app = await coachApp({ fetch: gem.fetch, daily: 3 });
    const { c } = await lifterWithHistory(app);
    const res = await c.post('/api/coach/review', {});
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('ai_unavailable');
    expect((await c.get('/api/coach/status')).body.remainingToday).toBe(3);
  });

  it('falls back to the next model on 404', async () => {
    const gem = mockGemini((call) =>
      call.url.includes('/models/gemini-gone:') ? new Response('{"error":{"code":404}}', { status: 404 }) : geminiOk({ answer: 'Ok.' }),
    );
    const app = await coachApp({ fetch: gem.fetch, model: 'gemini-gone' });
    const c = await signedIn(app);
    const res = await c.post('/api/coach/ask', { question: 'How long should I rest between sets?' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answer: 'Ok.', model: 'gemini-flash-latest' });
    expect(gem.calls.map((x) => x.url.split('/models/')[1])).toEqual([
      'gemini-gone:generateContent',
      'gemini-flash-latest:generateContent',
    ]);
  });
});

describe('POST /api/coach/ask', () => {
  it('answers with brief context, caps length, validates input', async () => {
    const long = Array.from({ length: 300 }, () => 'word').join(' ');
    const gem = mockGemini(() => geminiOk({ answer: long }));
    const app = await coachApp({ fetch: gem.fetch });
    const { c } = await lifterWithHistory(app);
    const res = await c.post('/api/coach/ask', { question: 'Is 3x8 enough for bench?' });
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('gemini-test-model');
    expect((res.body.answer as string).split(/\s+/).length).toBeLessThanOrEqual(120);

    const call = gem.calls[0]!;
    const system = call.body.systemInstruction.parts[0]!.text;
    expect(system).toMatch(/120 words/);
    expect(system).toMatch(/diagnos/i);
    expect(system).toMatch(/only help with\s+training/i);
    const prompt = call.body.contents[0]!.parts[0]!.text;
    expect(prompt).toContain('Is 3x8 enough for bench?');
    expect(prompt).toContain('Push Day');
    expect(prompt).not.toContain(c.user!.email);
    expect(prompt).not.toContain(c.user!.id);

    expect((await c.post('/api/coach/ask', { question: 'x'.repeat(501) })).status).toBe(400);
    expect((await c.post('/api/coach/ask', { question: '   ' })).status).toBe(400);
  });

  it('global bucket empties after GEMINI_RPM calls', async () => {
    const gem = mockGemini(() => geminiOk({ answer: 'Yes.' }));
    const app = await coachApp({ fetch: gem.fetch, rpm: 3 });
    const a = await signedIn(app);
    const b = await signedIn(app);
    expect((await a.post('/api/coach/ask', { question: 'q1?' })).status).toBe(200);
    expect((await b.post('/api/coach/ask', { question: 'q2?' })).status).toBe(200);
    expect((await a.post('/api/coach/ask', { question: 'q3?' })).status).toBe(200);
    const denied = await b.post('/api/coach/ask', { question: 'q4?' });
    expect(denied.status).toBe(429);
    expect(denied.body).toMatchObject({ error: 'rate_limited', retryAfterSec: 20 });
    expect(gem.calls).toHaveLength(3);
    // the rejected call wasn't charged to b's daily allowance
    expect((await b.get('/api/coach/status')).body.remainingToday).toBe(99);
  });

  it('per-user daily cap', async () => {
    const gem = mockGemini(() => geminiOk({ answer: 'Sure.' }));
    const app = await coachApp({ fetch: gem.fetch, daily: 2 });
    const c = await signedIn(app);
    expect((await c.get('/api/coach/status')).body).toEqual({ enabled: true, remainingToday: 2 });
    expect((await c.post('/api/coach/ask', { question: 'a?' })).status).toBe(200);
    expect((await c.post('/api/coach/ask', { question: 'b?' })).status).toBe(200);
    const capped = await c.post('/api/coach/ask', { question: 'c?' });
    expect(capped.status).toBe(429);
    expect(capped.body).toMatchObject({ error: 'rate_limited', retryAfterSec: 12 * 3600 });
    expect((await c.get('/api/coach/status')).body.remainingToday).toBe(0);
    expect(gem.calls).toHaveLength(2);
    // another user is unaffected
    const other = await signedIn(app);
    expect((await other.post('/api/coach/ask', { question: 'd?' })).status).toBe(200);
    void Client;
  });
});
