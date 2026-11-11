// Live end-to-end smoke test against a REAL running server (real DB, real Gemini if configured).
//   npm run build && PORT=3201 NODE_ENV=production node dist/server/index.js   (in another terminal)
//   node e2e/live-smoke.mjs [baseUrl]
// Creates a throwaway account, exercises the main flows, then deletes the account (cascades all data).
// Screenshots → e2e/screenshots/live/
import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3201';
const OUT = 'e2e/screenshots/live';
mkdirSync(OUT, { recursive: true });

const email = `e2e-${Date.now()}@example.com`;
const password = 'e2e-password-123';
const problems = [];
const log = (...a) => console.log('•', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
  timezoneId: 'America/New_York',
});
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // Failed requests are tracked precisely by the response handler below.
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) problems.push(`console: ${m.text()}`);
});
// Expected non-2xx: logged-out /me probe, "no coach review yet".
const EXPECTED = [
  [401, 'GET', '/api/auth/me'],
  [404, 'GET', '/api/coach/review'],
];
page.on('response', (r) => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith('/api/') || r.status() < 400) return;
  const m = r.request().method();
  if (EXPECTED.some(([s, mm, p]) => s === r.status() && mm === m && p === u.pathname)) return;
  problems.push(`HTTP ${r.status()} ${m} ${u.pathname}`);
});
const shot = (name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const nav = (name) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
const api = (method, path, data) =>
  page.request.fetch(`${BASE}${path}`, {
    method,
    data,
    headers: { Origin: new URL(BASE).origin, 'Content-Type': 'application/json' },
  });

let accountCreated = false;
try {
  // 1. Register
  await page.goto(BASE);
  await page.getByRole('radio', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.getByText('How do you weigh plates?').waitFor({ timeout: 20_000 });
  accountCreated = true;
  log('registered', email);

  // 2. Onboarding (defaults: kg, recommended template)
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(250);
  }
  await shot('01-onboarding-program', true);
  await page.getByRole('button', { name: 'Create my routines' }).click();
  await page.getByText('Up next').waitFor({ timeout: 20_000 });
  log('onboarded');

  // 3. Seed one workout from a week ago via the API so the plan has history to progress from.
  const routines = await (await api('GET', '/api/routines')).json();
  const first = routines[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const seeded = {
    id: randomUUID(),
    routineId: first.id,
    name: first.name,
    startedAt: weekAgo.toISOString(),
    endedAt: new Date(weekAgo.getTime() + 55 * 60_000).toISOString(),
    notes: '',
    bodyweightKg: null,
    sets: first.items.flatMap((it, exerciseOrder) =>
      Array.from({ length: it.sets }, (_, setOrder) => ({
        id: randomUUID(),
        exerciseId: it.exerciseId,
        exerciseOrder,
        setOrder,
        kind: 'working',
        weightKg: 40,
        reps: it.repMax,
        durationSec: null,
        rpe: 8,
        completed: true,
        notes: null,
      })),
    ),
  };
  const put = await api('PUT', `/api/workouts/${seeded.id}`, seeded);
  if (put.status() !== 200) problems.push(`seed workout PUT → ${put.status()} ${await put.text()}`);
  const plan = await (await api('GET', '/api/plan')).json();
  const s0 = plan.routines?.[0]?.exercises?.[0];
  log(`plan: ${first.name} / ${s0?.exerciseId}: ${s0?.action} → ${s0?.weightKg} kg × ${s0?.repsPerSet?.join(',')} (“${s0?.reason}”)`);
  await page.reload();
  await page.getByText('Up next').waitFor();
  await page.waitForTimeout(800);
  await shot('02-home', true);

  // 4. Log a workout through the UI: complete every prefilled set of the first exercise, finish.
  await page.getByRole('button', { name: /^Start / }).first().click();
  const firstDone = page.getByRole('button', { name: /^Complete .* set 1$/ }).first();
  await firstDone.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot('03-workout');
  const label = (await firstDone.getAttribute('aria-label')).replace(/^Complete /, '').replace(/ set 1$/, '');
  for (let n = 1; n <= 3; n++) {
    const btn = page.getByRole('button', { name: `Complete ${label} set ${n}`, exact: true });
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(200);
  }
  await shot('04-rest-timer');
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.waitForTimeout(500);
  const discard = page.getByRole('button', { name: /Discard unticked/ });
  if (await discard.count()) await discard.click();
  await page.getByText('Workout complete').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot('05-summary', true);
  const [latest] = await (await api('GET', '/api/workouts?limit=1')).json();
  const saved = await (await api('GET', `/api/workouts/${latest.id}`)).json();
  const top = saved.sets.find((s) => s.completed);
  log(`workout saved: ${latest.setCount} sets, volume ${latest.volumeKg} kg, first set ${top?.weightKg} kg × ${top?.reps}`);
  if (!(latest.volumeKg > 0)) problems.push('UI-logged workout saved with no weight (volume 0)');
  if (s0?.weightKg != null && top?.weightKg !== s0.weightKg) problems.push(`logger did not prefill the plan weight: ${top?.weightKg} ≠ ${s0.weightKg}`);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(600);

  // 5. Plan + live AI coach
  await nav('Plan');
  await page.getByText('Muscle volume').waitFor();
  await page.waitForTimeout(600);
  await shot('06-plan', true);
  const status = await (await api('GET', '/api/coach/status')).json();
  log('coach status', JSON.stringify(status));
  if (status.enabled) {
    await page.getByRole('button', { name: 'Get AI review' }).click();
    const t0 = Date.now();
    await page.getByLabel('Generating review').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(800);
    log(`AI review rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await page.locator('#coach').scrollIntoViewIfNeeded().catch(() => {});
    await shot('07-coach-review', true);
    const review = await api('GET', '/api/coach/review');
    if (review.status() === 200) {
      const r = await review.json();
      log(`review model=${r.model} wins=${r.wins.length} concerns=${r.concerns.length} adjustments=${r.adjustments.length} changes=${r.exerciseChanges.length}`);
      log(`summary: ${r.summary}`);
    } else problems.push(`GET /api/coach/review → ${review.status()} ${await review.text()}`);
    await page.getByPlaceholder(/My shoulder hurts/).fill('How long should I rest between heavy squat sets?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.waitForTimeout(12_000);
    await shot('08-coach-ask', true);
  }

  // 6. Progress + history
  await nav('Progress');
  await page.getByText('Weekly volume').waitFor();
  await page.waitForTimeout(1500);
  await shot('09-progress', true);
  await nav('History');
  await page.waitForTimeout(1000);
  await shot('10-history', true);

  // 7. Delete the account through the UI (cleans Neon)
  await nav('Profile');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Delete account/ }).first().click();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Delete my account forever' }).click();
  await page.getByRole('radio', { name: 'Create account' }).waitFor({ timeout: 20_000 });
  accountCreated = false;
  const me = await api('GET', '/api/auth/me');
  log('after delete /api/auth/me →', me.status());
} catch (err) {
  problems.push(`FLOW FAILED: ${err.message.split('\n')[0]}`);
  await shot('zz-failure', true).catch(() => {});
} finally {
  if (accountCreated) {
    // Fallback cleanup so no test data is left behind.
    const r = await api('DELETE', '/api/me', { password }).catch(() => null);
    log('fallback cleanup DELETE /api/me →', r?.status());
  }
  await browser.close();
}
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'OK: no problems');
process.exit(problems.length ? 1 : 0);
