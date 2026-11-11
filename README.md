# Lift More

A mobile-first gym tracker (installable PWA) that makes logging fast and tells you exactly what to lift next week.

- **Log** routines → exercises → sets (weight, reps or seconds, RPE, warm-up / drop / failure), with last session's numbers inline, a rest timer, plate calculator and warm-up generator. Works offline in the gym; finished workouts sync when you're back online.
- **Progress automatically**: a rule-based engine (double progression, RPE adjustments, stall detection, deloads) prefills next session's weight × reps with a one-line reason.
- **Track** history, e1RM and PR charts, weekly volume, sets per muscle vs target, bodyweight, streaks.
- **AI coach** (optional, Gemini): a weekly review with wins, concerns, weight tweaks and one-tap exercise swaps, plus short Q&A.

## Stack

| Folder | What |
|---|---|
| `shared/` | Typed API contract (`types.ts`) + pure engine: 102-exercise library, 6 starter programs, progression, stats, PRs, plate math |
| `server/` | Express 5 API, cookie sessions, Postgres (Neon) or embedded PGlite, Gemini client with global RPM bucket + per-user daily cap + caching |
| `web/` | React 19 + Vite 8 + Tailwind 4 PWA |
| `docs/SPEC.md` | Product + API spec (source of truth) |

## Run locally

```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY (optional) and DATABASE_URL (optional)
npm run dev               # API on :3001, app on http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
```

Without `DATABASE_URL` the server uses an embedded Postgres (PGlite) in `./.data/`. Without `GEMINI_API_KEY` everything works except the AI coach card.

```bash
npm test                  # ~290 unit/API tests (engine, server over in-memory PGlite, web logic)
npm run typecheck
npm run build && npm start   # production build: one Node process serves the app + /api
node e2e/live-smoke.mjs http://localhost:3001   # optional live browser smoke test (creates + deletes a throwaway account)
```

## Deploy (Render + Neon)

1. Create a Neon Postgres project and copy its **pooled** connection string.
2. On Render: **New → Blueprint**, pick this repo. `render.yaml` defines one free web service (Virginia, next to Neon's `aws-us-east-1`).
3. Fill the prompted env vars: `DATABASE_URL` (Neon pooled string), `GEMINI_API_KEY`, and after the first deploy `APP_ORIGIN=https://<your-service>.onrender.com`.
4. Open the URL on your phone → Share / menu → **Add to Home Screen**.

Migrations run automatically at boot. Free Render services sleep after ~15 min idle; the first request after that takes ~30–60 s.

## Configuration

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | – | Postgres URL. Required in production (or set `ALLOW_PGLITE=1` for a throwaway instance) |
| `GEMINI_API_KEY` | – | Enables the AI coach |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Falls back to `gemini-3.1-flash-lite` → `gemini-flash-lite-latest` → `gemini-flash-latest` when overloaded/unavailable |
| `GEMINI_RPM` | `15` | Global requests/minute across all users |
| `GEMINI_USER_DAILY_LIMIT` | `30` | AI calls per user per day |
| `REGISTER_RATE_LIMIT` | `20` | Sign-ups per IP per hour |
| `APP_ORIGIN` | request host | Public origin for the CSRF Origin check |
| `PORT` | `3001` | |
