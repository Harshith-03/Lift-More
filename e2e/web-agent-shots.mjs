// Visual check for the web app with a fully mocked /api (no server needed).
//   npx vite --port 5174 --strictPort      (in another terminal)
//   node e2e/web-agent-shots.mjs [baseUrl]
// Screenshots → e2e/screenshots/web-agent/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const OUT = 'e2e/screenshots/web-agent';
mkdirSync(OUT, { recursive: true });

const DAY = 86_400_000;
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const uid = (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })();

const user = {
  id: 'u-1', email: 'alex@example.com', displayName: 'Alex Rivera', unit: 'kg', goal: 'hypertrophy',
  experience: 'intermediate', daysPerWeek: 4, defaultRestSec: 120, timezone: 'UTC', barWeightKg: 20,
  onboarded: true, createdAt: iso(now - 120 * DAY),
};

const item = (exerciseId, sets, repMin, repMax, restSec) => ({ exerciseId, sets, repMin, repMax, restSec });
const routines = [
  { id: 'r-push', name: 'Push', notes: '', position: 0, createdAt: iso(now - 90 * DAY), updatedAt: iso(now - 3 * DAY), items: [
    item('barbell-bench-press', 3, 6, 10, 150), item('overhead-press', 3, 6, 10, 150), item('incline-dumbbell-press', 3, 8, 12, 120),
    item('dumbbell-lateral-raise', 3, 12, 15, 60), item('triceps-pushdown', 3, 10, 15, 60)] },
  { id: 'r-pull', name: 'Pull', notes: '', position: 1, createdAt: iso(now - 90 * DAY), updatedAt: iso(now - 3 * DAY), items: [
    item('pull-up', 3, 6, 10, 150), item('barbell-row', 3, 6, 10, 150), item('lat-pulldown', 3, 8, 12, 120), item('face-pull', 3, 12, 15, 60), item('dumbbell-curl', 3, 10, 12, 60)] },
  { id: 'r-legs', name: 'Legs', notes: '', position: 2, createdAt: iso(now - 90 * DAY), updatedAt: iso(now - 3 * DAY), items: [
    item('barbell-back-squat', 3, 5, 8, 180), item('romanian-deadlift', 3, 8, 10, 150), item('leg-press', 3, 10, 12, 120), item('lying-leg-curl', 3, 10, 12, 90), item('standing-calf-raise', 3, 10, 15, 60), item('side-plank', 2, 30, 60, 60)] },
];

const sugg = (exerciseId, action, weightKg, reps, sets, repMin, repMax, reason, extra = {}) => ({
  exerciseId, action, sets, weightKg, repsPerSet: Array(sets).fill(reps), repMin, repMax, reason,
  lastPerformance: null, e1rmKg: weightKg ? Math.round(weightKg * (1 + reps / 30)) : null, stalled: false, ...extra,
});
const plan = {
  weekStart: ymd(now - ((new Date(now).getUTCDay() + 6) % 7) * DAY), generatedAt: iso(now), nextRoutineId: 'r-push', deloadRecommended: true,
  routines: [
    { routineId: 'r-push', routineName: 'Push', exercises: [
      sugg('barbell-bench-press', 'increase_weight', 82.5, 6, 3, 6, 10, 'Hit 3×10 at 80 kg — add 2.5 kg, aim for 3×6'),
      sugg('overhead-press', 'increase_reps', 50, 8, 3, 6, 10, 'Got 8, 7, 7 at 50 kg — add a rep to the weakest sets'),
      sugg('incline-dumbbell-press', 'hold', 26, 8, 3, 8, 12, 'Fell short of 8 reps once — repeat 26 kg and own it'),
      sugg('dumbbell-lateral-raise', 'increase_reps', 10, 13, 3, 12, 15, '3×12 at 10 kg — go for 13s'),
      sugg('triceps-pushdown', 'start', null, 10, 3, 10, 15, 'New lift: pick a weight that leaves ~2 reps in reserve'),
    ] },
    { routineId: 'r-pull', routineName: 'Pull', exercises: [
      sugg('pull-up', 'increase_reps', null, 9, 3, 6, 10, 'Bodyweight 8, 8, 7 — chase 9s'),
      sugg('barbell-row', 'deload', 63, 8, 3, 6, 10, 'Stalled 3 sessions at 70 kg — drop to 63 kg and rebuild', { stalled: true }),
      sugg('lat-pulldown', 'increase_weight', 62.5, 8, 3, 8, 12, 'Hit 3×12 at 60 kg — add 2.5 kg'),
      sugg('face-pull', 'increase_reps', 20, 14, 3, 12, 15, '3×13 at 20 kg — add a rep'),
      sugg('dumbbell-curl', 'increase_reps', 14, 11, 3, 10, 12, '10, 10, 9 at 14 kg — add a rep'),
    ] },
    { routineId: 'r-legs', routineName: 'Legs', exercises: [
      sugg('barbell-back-squat', 'increase_weight', 110, 5, 3, 5, 8, 'Hit 3×8 at 105 kg — add 5 kg, aim for 3×5'),
      sugg('romanian-deadlift', 'increase_reps', 90, 9, 3, 8, 10, 'Within range at 90 kg — add a rep'),
      sugg('leg-press', 'increase_weight', 190, 10, 3, 10, 12, 'Hit 3×12 at 180 kg — add 10 kg'),
      sugg('lying-leg-curl', 'increase_reps', 45, 11, 3, 10, 12, '10, 10, 10 at 45 kg — chase 11s'),
      sugg('standing-calf-raise', 'increase_reps', 80, 13, 3, 10, 15, 'Add a rep per set'),
      sugg('side-plank', 'increase_duration', null, 50, 2, 30, 60, 'Held 45 s — add 5 s'),
    ] },
  ],
  volume: [
    ['chest', 9, 10, 20], ['lats', 11, 10, 20], ['upper_back', 12, 10, 20], ['traps', 3, 4, 10], ['shoulders', 13.5, 10, 20], ['rear_delts', 4.5, 6, 12],
    ['biceps', 7.5, 8, 16], ['triceps', 10.5, 8, 16], ['abs', 2, 6, 12], ['glutes', 8, 8, 16], ['quads', 12, 10, 20], ['hamstrings', 9.5, 8, 16], ['calves', 6, 8, 14],
  ].map(([muscle, sets, min, max]) => ({ muscle, sets, target: { min, max } })),
  recommendations: [
    { type: 'add', exerciseId: 'cable-crunch', routineId: 'r-legs', reason: 'Abs at 2 sets/week — below the 6-set minimum.', source: 'rules' },
    { type: 'swap', exerciseId: 'barbell-row', replacementId: 'chest-supported-dumbbell-row', routineId: 'r-pull', reason: 'Barbell row has stalled for 3 sessions — try a variation.', source: 'rules' },
  ],
};

// workouts: last ~10 weeks, 3–4 per week
const workoutsFull = [];
for (let w = 0; w < 26; w++) {
  const r = routines[w % 3];
  const start = now - (w * 2.6 + 1.1) * DAY;
  let order = 0;
  const sets = [];
  for (const it of r.items) {
    const base = { 'barbell-bench-press': 80, 'overhead-press': 50, 'barbell-back-squat': 105, 'barbell-row': 70, 'romanian-deadlift': 90 }[it.exerciseId] ?? 30;
    const prog = Math.max(0, 1 - w * 0.012);
    for (let s = 0; s < it.sets; s++) {
      const isDur = it.exerciseId === 'side-plank';
      const bw = it.exerciseId === 'pull-up';
      sets.push({ id: uid(), exerciseId: it.exerciseId, exerciseOrder: order, setOrder: s, kind: 'working',
        weightKg: isDur || bw ? null : Math.round(base * prog / 2.5) * 2.5, reps: isDur ? null : it.repMax - (s === 2 ? 1 : 0) - (w % 2),
        durationSec: isDur ? 45 : null, rpe: s === 2 ? 8.5 : null, completed: true, notes: null });
    }
    order++;
  }
  workoutsFull.push({ id: `w-${w}`, routineId: r.id, name: r.name, startedAt: iso(start), endedAt: iso(start + 62 * 60_000), notes: w === 0 ? 'Felt strong. Left shoulder a bit tight on OHP.' : '', bodyweightKg: 81.4, sets });
}
const summaries = workoutsFull.map((w) => ({
  id: w.id, routineId: w.routineId, name: w.name, startedAt: w.startedAt, endedAt: w.endedAt, durationSec: 62 * 60,
  exerciseIds: [...new Set(w.sets.map((s) => s.exerciseId))], setCount: w.sets.length,
  volumeKg: w.sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0),
}));

const pr = (exerciseId, type, value, weightKg, reps, daysAgo) => ({ exerciseId, type, value, weightKg, reps, date: iso(now - daysAgo * DAY), workoutId: 'w-0' });
const stats = {
  streakWeeks: 9, workoutsThisWeek: 2, targetThisWeek: 4, totalWorkouts: 37,
  weeklyVolume: Array.from({ length: 12 }, (_, i) => ({ weekStart: ymd(now - (11 - i) * 7 * DAY), volumeKg: 14000 + i * 650 + (i % 3) * 900 - (i === 11 ? 9000 : 0), sets: 60 + i * 2 - (i === 11 ? 35 : 0), workouts: i === 11 ? 2 : 4 })),
  muscleVolumeThisWeek: plan.volume.map((v) => ({ ...v, sets: Math.round(v.sets * 0.45 * 2) / 2 })),
  recentPRs: [pr('barbell-bench-press', 'e1rm', 106.7, 80, 10, 1), pr('barbell-back-squat', 'weight', 105, 105, 8, 3), pr('lat-pulldown', 'reps', 12, 60, 12, 5)],
};

const history = (id) => ({
  exerciseId: id,
  sessions: workoutsFull.filter((w) => w.sets.some((s) => s.exerciseId === id)).map((w) => {
    const sets = w.sets.filter((s) => s.exerciseId === id);
    const top = sets[0];
    return { workoutId: w.id, date: w.startedAt, sets, topSet: { weightKg: top.weightKg, reps: top.reps, durationSec: top.durationSec },
      e1rmKg: top.weightKg ? Math.round(top.weightKg * (1 + top.reps / 30) * 10) / 10 : null, volumeKg: sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0) };
  }),
  prs: [pr(id, 'e1rm', 106.7, 80, 10, 1), pr(id, 'weight', 82.5, 82.5, 6, 12), pr(id, 'reps', 11, 75, 11, 30), pr(id, 'volume', 2400, null, null, 1)],
});

const bodyweight = Array.from({ length: 16 }, (_, i) => ({ id: `bw-${i}`, date: ymd(now - (30 - i * 2) * DAY), weightKg: 82.6 - i * 0.09 + (i % 3) * 0.2 }));

const review = {
  weekStart: plan.weekStart, createdAt: iso(now - 3600_000), model: 'gemini-flash-latest', cached: true,
  summary: 'Solid week: two sessions in and bench is moving well. Pulling volume is good, but abs and rear delts are under-trained and your barbell row has stalled.',
  wins: ['Bench press e1RM up 4% in three weeks', 'Nine-week training streak'],
  concerns: ['Barbell row stuck at 70 kg for 3 sessions', 'Only 2 hard sets for abs this week'],
  adjustments: [{ exerciseId: 'overhead-press', weightKg: 50, reps: 8, reason: 'Keep the load, chase reps while the shoulder settles.' }],
  exerciseChanges: [{ type: 'add', exerciseId: 'reverse-pec-deck', routineId: 'r-pull', reason: 'Rear delts are below target — 3 easy sets fix it.', source: 'ai' }],
  tip: 'Film one top set of squats this week to check depth.',
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
}

async function mockApi(page, opts = {}) {
  const me = opts.me === undefined ? user : opts.me;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    if (p === '/api/auth/me') return me ? json(route, me) : json(route, { error: 'unauthorized', message: 'Not logged in' }, 401);
    if (p === '/api/exercises/custom') return json(route, []);
    if (p === '/api/routines') return json(route, routines);
    if (p === '/api/plan') return json(route, plan);
    if (p === '/api/stats') return json(route, stats);
    if (p === '/api/workouts' && m === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const before = url.searchParams.get('before');
      return json(route, summaries.filter((s) => !before || s.startedAt < before).slice(0, limit));
    }
    const wm = p.match(/^\/api\/workouts\/(.+)$/);
    if (wm && m === 'GET') return json(route, workoutsFull.find((w) => w.id === wm[1]) ?? workoutsFull[0]);
    if (wm && m === 'PUT') {
      const w = JSON.parse(req.postData() ?? '{}');
      return json(route, { workout: w, prs: [pr('barbell-bench-press', 'e1rm', 109.1, 82.5, 7, 0), pr('overhead-press', 'reps', 9, 50, 9, 0)] });
    }
    if (p === '/api/history/last') {
      const ids = (url.searchParams.get('exerciseIds') ?? '').split(',').filter(Boolean);
      const out = {};
      for (const id of ids) {
        const w = workoutsFull.find((x) => x.sets.some((s) => s.exerciseId === id));
        out[id] = w ? { workoutId: w.id, date: w.startedAt, sets: w.sets.filter((s) => s.exerciseId === id) } : null;
      }
      return json(route, out);
    }
    const hm = p.match(/^\/api\/history\/exercise\/(.+)$/);
    if (hm) return json(route, history(decodeURIComponent(hm[1])));
    if (p === '/api/bodyweight') return json(route, bodyweight);
    if (p.startsWith('/api/bodyweight/')) return json(route, { id: 'bw-new', date: p.split('/').pop(), weightKg: 81.2 });
    if (p === '/api/coach/status') return json(route, { enabled: true, remainingToday: 27 });
    if (p === '/api/coach/review') return m === 'GET' ? json(route, review) : json(route, review);
    if (p === '/api/coach/ask') return json(route, { answer: 'Swap to a neutral-grip dumbbell press for two weeks and keep RPE ≤ 8.', model: 'gemini' });
    if (p.startsWith('/api/routines/')) return json(route, routines[0]);
    if (p === '/api/me' && m === 'PATCH') return json(route, { ...me, ...JSON.parse(req.postData() ?? '{}') });
    return json(route, { error: 'not_found', message: `No mock for ${m} ${p}` }, 404);
  });
}

const errors = [];
async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${opts.tag ?? 'page'}] pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[${opts.tag ?? 'page'}] console: ${msg.text()}`); });
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem('lm.theme', t), opts.theme);
  await mockApi(page, opts);
  return { ctx, page };
}

const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const settle = (page) => page.waitForTimeout(700);

const browser = await chromium.launch();
try {
  // Auth
  { const { ctx, page } = await newPage(browser, { me: null, tag: 'auth' });
    await page.goto(BASE); await page.getByRole('button', { name: 'Log in' }).last().waitFor(); await settle(page);
    await shot(page, '01-auth');
    await page.getByRole('radio', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Create account' }).click(); await settle(page);
    await shot(page, '01b-register-errors');
    await ctx.close(); }

  // Onboarding
  { const { ctx, page } = await newPage(browser, { me: { ...user, onboarded: false }, tag: 'onboarding' });
    await page.goto(BASE); await page.getByText('How do you weigh plates?').waitFor(); await settle(page);
    await shot(page, '02-onboarding-unit');
    for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(250); }
    await settle(page); await shot(page, '02b-onboarding-template', true);
    await ctx.close(); }

  // Main app
  const { ctx, page } = await newPage(browser, { tag: 'app' });
  await page.goto(BASE); await page.getByText('Up next').waitFor(); await settle(page);
  await shot(page, '03-home', true);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History', exact: true }).click(); await page.getByText('This week').first().waitFor().catch(() => {}); await settle(page);
  await shot(page, '04-history');
  await page.locator('a[href^="/history/w-"]').first().click(); await settle(page);
  await shot(page, '05-history-detail', true);
  await page.goBack(); await settle(page);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan', exact: true }).click(); await page.getByText('Muscle volume').waitFor(); await settle(page);
  await shot(page, '06-plan', true);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Progress', exact: true }).click(); await page.getByText('Weekly volume').waitFor(); await page.waitForTimeout(1200);
  await shot(page, '07-progress', true);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile', exact: true }).click(); await page.getByText('Routines').first().waitFor(); await settle(page);
  await shot(page, '08-profile', true);

  // Active workout
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home', exact: true }).click(); await page.getByText('Up next').waitFor();
  await page.getByRole('button', { name: /^Start Push/ }).click(); await page.getByText('Barbell Bench Press').first().waitFor(); await page.waitForTimeout(1000);
  await shot(page, '09-workout');
  await page.getByRole('button', { name: /Complete Barbell Bench Press set 1/ }).click();
  await page.getByRole('button', { name: /Complete Barbell Bench Press set 2/ }).click(); await page.waitForTimeout(600);
  await shot(page, '10-workout-rest-timer');
  await page.getByRole('button', { name: 'Barbell Bench Press options' }).click(); await settle(page);
  await shot(page, '11-exercise-menu');
  await page.getByRole('button', { name: /Plate calculator/ }).click(); await settle(page);
  await shot(page, '12-plate-calculator');
  await page.getByRole('button', { name: 'Close' }).last().click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Barbell Bench Press options' }).click(); await page.getByRole('button', { name: /Warm-up sets/ }).click(); await settle(page);
  await shot(page, '13-warmups');
  await page.getByRole('button', { name: 'Add warm-ups to this exercise' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Barbell Bench Press options' }).click(); await page.getByRole('button', { name: /Swap exercise/ }).click(); await settle(page);
  await shot(page, '14-swap');
  await page.getByRole('button', { name: 'Close' }).last().click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Add exercise' }).last().click(); await page.getByPlaceholder('Search exercises').waitFor(); await settle(page);
  await shot(page, '15-exercise-library');
  await page.getByPlaceholder('Search exercises').fill('curl'); await page.waitForTimeout(400);
  await shot(page, '15b-library-search');
  await page.getByRole('button', { name: 'Close' }).last().click(); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(300);
  await shot(page, '09b-workout-scrolled');
  await page.getByRole('button', { name: 'Finish' }).click(); await settle(page);
  await shot(page, '16-finish-sheet');
  await page.getByRole('button', { name: /Discard unticked/ }).click(); await page.getByText('Workout complete').waitFor(); await page.waitForTimeout(900);
  await shot(page, '17-summary', true);
  await page.getByRole('button', { name: 'Done' }).click(); await settle(page);

  // Offline indicator
  await ctx.setOffline(true); await page.waitForTimeout(500);
  await shot(page, '18-home-offline');
  await ctx.setOffline(false);

  // Routine editor
  await page.goto(`${BASE}/routines/r-push`); await page.getByText('Edit routine').waitFor(); await settle(page);
  await shot(page, '19-routine-editor');
  await ctx.close();

  // Light theme
  { const { ctx: c2, page: p2 } = await newPage(browser, { theme: 'light', tag: 'light' });
    await p2.goto(BASE); await p2.getByText('Up next').waitFor(); await settle(p2);
    await shot(p2, '20-home-light', true);
    await p2.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Progress', exact: true }).click(); await p2.getByText('Weekly volume').waitFor(); await p2.waitForTimeout(1200);
    await shot(p2, '21-progress-light');
    await c2.close(); }

  // Narrowest supported phone width
  { const c3 = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p3 = await c3.newPage();
    p3.on('pageerror', (e) => errors.push(`[360] pageerror: ${e.message}`));
    await mockApi(p3);
    await p3.goto(BASE); await p3.getByText('Up next').waitFor();
    await p3.getByRole('button', { name: /^Start Push/ }).click(); await p3.getByText('Barbell Bench Press').first().waitFor(); await p3.waitForTimeout(900);
    await p3.getByRole('button', { name: /Complete Barbell Bench Press set 1/ }).click(); await p3.waitForTimeout(400);
    await shot(p3, '22-workout-360');
    await c3.close(); }
} finally {
  await browser.close();
}
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
