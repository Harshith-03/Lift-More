# Lift More — Build Spec (source of truth for all agents)

## 1. Product

A mobile-first web app (installable PWA) that makes logging gym sessions fast and tells you exactly what to lift next week.

| Area | Must have |
|---|---|
| **Accounts** | Email + password sign-up/login, cloud-stored data (Postgres), logout, delete account, JSON export/import |
| **Onboarding** | Unit (kg/lb), goal (strength / hypertrophy / general), experience, days per week, pick a starter template or start blank |
| **Routines** | Create/edit/reorder/delete; items = exercise + sets + rep range + rest; starter templates (PPL, Upper/Lower, Full Body 3x, 5x5 strength, etc.) |
| **Live workout logger** (the core screen) | Start from a routine (prefilled with next-week suggestions) or empty; per set: weight, reps (or seconds), RPE, kind (warm-up/working/drop/failure), ✓ complete; "previous" column showing last session's numbers; rest timer auto-starts on ✓ (vibrate + sound at 0, ±15 s); add/remove/reorder exercises; swap exercise; exercise + workout notes; plate calculator; warm-up generator; draft survives reload/app kill; finish → summary with duration, volume, PRs hit |
| **History** | Workout list (grouped by week), detail, edit, delete |
| **Progress** | Per-exercise chart (e1RM + top set), PR list, weekly volume chart, sets per muscle group vs target, bodyweight log + chart, streak |
| **Plan (next week)** | Rule-based: per routine, each exercise's next weight × reps with a reason; muscle-volume gaps; rule-based exercise add/swap suggestions; deload flag |
| **AI coach (Gemini)** | Weekly review (summary, wins, concerns, weight adjustments, exercise swaps/additions with reasons, a tip); one-tap "apply" for swaps/additions to a routine; short free-form "ask the coach" Q&A. Optional — app is fully usable with no key |
| **Offline resilience** | Gym basements have no signal: app shell cached by the service worker, last-fetched data readable offline, active workout lives in localStorage, finished workouts queue in an outbox and sync when back online |

Non-goals (v1): social features, password-reset email, native apps, wearables.

## 2. Architecture

```
web/  (React 19 + Vite 8 + Tailwind 4 PWA)  ──fetch /api (same origin, cookie auth)──►  server/ (Express 5)
        │ imports                                                                            │ imports
        └────────────────────────────── shared/ (types + pure engine) ◄──────────────────────┘
                                                                                             │
                                                    Postgres (Neon in prod, PGlite embedded locally/tests)
                                                    Gemini REST API (server-side only; key never reaches the browser)
```

- **One deployable**: in production `node dist/server/index.js` serves the built SPA from `dist/web` and the API under `/api`. Same origin → no CORS.
- **Dev**: `npm run dev` → server on :3001 (tsx watch) + Vite on :5173 proxying `/api`.
- **DB**: `DATABASE_URL` set → `pg` Pool. Not set → PGlite at `./.data/pglite` (tests: in-memory PGlite). Both expose the same SQL dialect; the server wraps them behind one `query(text, params)` adapter.
- **Progression + stats live in `shared/engine`** and run on the server for `/api/plan` and `/api/stats`, and in the browser for in-workout hints (plate math, warm-ups, ad-hoc suggestions).
- **Gemini** is only called from the server, rate-limited globally (token bucket, `GEMINI_RPM`, default 15) + per user/day (`GEMINI_USER_DAILY_LIMIT`, default 30), and weekly reviews are cached in the DB keyed by (user, weekStart, hash of plan input).

## 3. Environment

See `.env.example`. Server loads `.env` via `dotenv/config`. Required in prod: `DATABASE_URL`, `NODE_ENV=production`. Optional: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_RPM`, `GEMINI_USER_DAILY_LIMIT`, `PORT`, `APP_ORIGIN`.

## 4. Database schema (Postgres — must also run on PGlite)

Migrations are TypeScript string constants in `server/db/migrations.ts` (NOT .sql files — the server is bundled by esbuild), applied in order at boot and tracked in `schema_migrations`.

```sql
users(id uuid pk, email text unique not null /* stored lowercased */, password_hash text not null,
      display_name text not null, unit text not null default 'kg', goal text not null default 'hypertrophy',
      experience text not null default 'beginner', days_per_week int not null default 3,
      default_rest_sec int not null default 120, timezone text not null default 'UTC',
      bar_weight_kg double precision not null default 20, onboarded boolean not null default false,
      created_at timestamptz not null default now())
sessions(token_hash text pk /* sha256 hex of the cookie token */, user_id uuid fk→users on delete cascade,
         created_at timestamptz default now(), expires_at timestamptz not null)
custom_exercises(id text pk /* 'custom-<uuid>' */, user_id uuid fk cascade, name text, primary_muscle text,
                 secondary_muscles jsonb default '[]', equipment text, mechanic text, tracking_type text,
                 cue text, created_at timestamptz default now())
routines(id uuid pk, user_id uuid fk cascade, name text, notes text default '', position int,
         items jsonb not null default '[]' /* RoutineItem[] */, created_at, updated_at)
workouts(id uuid pk /* client-generated */, user_id uuid fk cascade, routine_id uuid null /* no fk: routine may be deleted */,
         name text, started_at timestamptz, ended_at timestamptz null, notes text default '',
         bodyweight_kg double precision null, created_at, updated_at)
workout_sets(id uuid pk, workout_id uuid fk→workouts cascade, user_id uuid fk cascade, exercise_id text,
             exercise_order int, set_order int, kind text, weight_kg double precision null, reps int null,
             duration_sec int null, rpe double precision null, completed boolean, notes text null)
bodyweight(id uuid pk, user_id uuid fk cascade, date date, weight_kg double precision, unique(user_id, date))
coach_reviews(id uuid pk, user_id uuid fk cascade, week_start date, input_hash text, payload jsonb, model text,
              created_at timestamptz default now(), unique(user_id, week_start, input_hash))
ai_usage(user_id uuid fk cascade, day date, count int, primary key(user_id, day))
```
Indexes: `workouts(user_id, started_at desc)`, `workout_sets(workout_id)`, `workout_sets(user_id, exercise_id)`.

## 5. HTTP API (all JSON; types in `shared/types.ts`)

Auth: opaque random token (32 bytes, base64url) in cookie `lm_session` — `HttpOnly; SameSite=Lax; Path=/; Secure in production; Max-Age 30 days`. DB stores only its SHA-256. Sliding renewal when < 15 days left.
CSRF: mutating requests (POST/PUT/PATCH/DELETE) must have `Content-Type: application/json` (DELETE may have no body) and, in production, an `Origin` header matching `APP_ORIGIN` (when set) or the request host.
Errors: always `ApiError` JSON `{ error, message, retryAfterSec?, details? }`. Validation via zod → 400 `validation` with `details`.

| Method + path | Body | Response |
|---|---|---|
| `GET /api/health` | – | `{ ok: true, db: 'postgres'|'pglite', ai: boolean }` |
| `POST /api/auth/register` | `RegisterRequest` | 201 `User` (+ cookie). 409 `conflict` if email taken |
| `POST /api/auth/login` | `LoginRequest` | `User` (+ cookie). 401 on bad creds. Rate-limited 10 / 15 min / IP |
| `POST /api/auth/logout` | – | 204 |
| `GET /api/auth/me` | – | `User` or 401 |
| `PATCH /api/me` | `UserSettingsPatch` | `User` |
| `DELETE /api/me` | `{ password }` | 204 (cascades everything) |
| `GET /api/exercises/custom` | – | `Exercise[]` |
| `POST /api/exercises/custom` | `CustomExerciseInput` | 201 `Exercise` |
| `PATCH /api/exercises/custom/:id` | `Partial<CustomExerciseInput>` | `Exercise` |
| `DELETE /api/exercises/custom/:id` | – | 204 |
| `GET /api/routines` | – | `Routine[]` ordered by position |
| `POST /api/routines` | `RoutineInput` | 201 `Routine` (position defaults to end) |
| `POST /api/routines/from-template` | `{ templateId, replaceExisting?: boolean }` | 201 `Routine[]` |
| `PUT /api/routines/:id` | `RoutineInput` | `Routine` |
| `POST /api/routines/reorder` | `{ ids: string[] }` | `Routine[]` |
| `DELETE /api/routines/:id` | – | 204 |
| `GET /api/workouts?limit=20&before=<ISO>` | – | `WorkoutSummary[]` newest first |
| `GET /api/workouts/:id` | – | `Workout` |
| `PUT /api/workouts/:id` | `Workout` (id must match) | `{ workout: Workout, prs: PersonalRecord[] }` — idempotent upsert, replaces all sets; PRs computed vs. all earlier workouts |
| `DELETE /api/workouts/:id` | – | 204 |
| `GET /api/history/exercise/:exerciseId?limit=30` | – | `ExerciseHistory` |
| `GET /api/history/last?exerciseIds=a,b,c` | – | `Record<exerciseId, ExerciseSession \| null>` (most recent session each) |
| `GET /api/stats` | – | `StatsSummary` |
| `GET /api/plan` | – | `WeeklyPlan` for the current week (rules only, no AI) |
| `GET /api/bodyweight` | – | `BodyweightEntry[]` oldest→newest |
| `PUT /api/bodyweight/:date` | `{ weightKg }` | `BodyweightEntry` (upsert) |
| `DELETE /api/bodyweight/:date` | – | 204 |
| `GET /api/coach/status` | – | `CoachStatus` |
| `GET /api/coach/review` | – | latest `CoachReview` for current week or 404 |
| `POST /api/coach/review` | `{ force?: boolean }` | `CoachReview` (cache hit unless force). 503 `ai_unavailable` if no key; 429 `rate_limited` w/ `retryAfterSec` |
| `POST /api/coach/ask` | `CoachAskRequest` (≤ 500 chars) | `CoachAskResponse` |
| `GET /api/export` | – | `ExportBundle` (attachment) |
| `POST /api/import` | `ExportBundle` | `{ routines, workouts, customExercises, bodyweight }` counts. Upserts by id; never touches another user's rows |

Ownership: every query is scoped by `user_id` from the session. Accessing another user's row → 404.

## 6. Progression rules (engine guidance)

Work in the **user's unit** when choosing increments, then store kg. Default increments: lower-body barbell compound 5 kg / 10 lb; upper-body compound 2.5 kg / 5 lb; dumbbell 2 kg / 5 lb (per dumbbell); machine/cable 2.5 kg / 5 lb; isolation 1–2.5 kg / 2.5–5 lb. Beginners on compounds may progress every session.

Double progression on the most recent session's **completed working sets**:
1. No history → `start`: weight null (or a conservative estimate from e1RM of a related lift — optional), reps = repMin, reason tells user to find a weight that leaves ~2 reps in reserve.
2. All working sets ≥ repMax (and RPE ≤ 9 when recorded) → `increase_weight` by one increment (two if all RPE ≤ 7), reps reset to repMin. Beginner + compound + all sets ≥ repMin with RPE ≤ 8 → may `increase_weight` too (linear progression).
3. Within range → `increase_reps`: same weight, +1 rep on the weakest sets (cap repMax).
4. Below repMin on most sets: first time → `hold`; 2 consecutive sessions below repMin, or `stalled` (no e1RM gain across last 3 sessions) → `deload` to ~90% and rebuild.
5. bodyweight_reps: progress reps to repMax then suggest +2.5 kg/5 lb added weight. duration: +5–10 s per session up to repMax seconds, then suggest harder variation via reason.
Reasons are short and concrete: "Hit 3×12 at 60 kg — add 2.5 kg, aim for 3×8".

Weekly volume targets (hard sets/muscle/week): hypertrophy ≈ 10–20 (beginner 8–14), strength ≈ 6–12 for the main movers, general ≈ 6–12. Rule-based recommendations: muscles under min → `add` a fitting exercise (use equipment the user already uses); stalled ≥ 3 sessions → `swap` with an alternative; deloadRecommended when ≥ 3 lifts stalled or ≥ 6 consecutive hard weeks.

## 7. AI coach (server)

Prompt context = profile + `WeeklyPlan` + `StatsSummary` + condensed last-4-weeks history (exercise id/name, date, top sets) + the **list of allowed exercise ids/names**. Ask for JSON matching `CoachReview` minus server-filled fields via Gemini `generationConfig.responseMimeType = "application/json"` + `responseSchema`. Validate with zod; drop changes that reference unknown exercise ids or routine ids; clamp adjustments to ±15% of the rule-based weight. Never include email or user id in prompts. Timeout 25 s. On 429 from Gemini → our 429 `rate_limited`.

REST: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key: <key>`, body `{ contents:[{role:'user',parts:[{text}]}], systemInstruction:{parts:[{text}]}, generationConfig:{ temperature:0.4, responseMimeType:'application/json', responseSchema } }`. Model fallback order: `GEMINI_MODEL` (default `gemini-3.5-flash`), `gemini-3.1-flash-lite`, `gemini-flash-lite-latest`, `gemini-flash-latest`. A 404 marks a model dead for the process lifetime; 429/5xx/timeouts move to the next model for that call only. Per-attempt timeout 20 s, 50 s total. Gemini 3 models are sent `thinkingConfig.thinkingLevel = "minimal"` (dropped automatically if a model rejects it). The 2.5 models are no longer available to new API keys (verified Nov 2026).

## 8. UI direction (web)

- Dark by default (gym lighting), optional light. Near-black background, slightly lighter cards, one strong accent (electric lime) for primary actions/PRs, red for destructive, amber for deloads.
- Mobile-first 360–430 px; safe-area insets; bottom tab bar (Home · History · Plan · Progress · Profile); big tap targets (≥ 44 px); numeric inputs `inputMode="decimal"`/`"numeric"`; tabular numerals; no hover-only affordances.
- Active workout is a full-screen route with a sticky header (elapsed time, Finish) and a persistent mini rest-timer bar; Screen Wake Lock while active.
- Weight entry is always in the user's unit; convert with the engine helpers.

## 9. Build rules for agents

- **Do not run `npm install`** or edit `package.json`/lockfile — every dependency is already installed: express 5, cookie-parser, bcryptjs, pg, @electric-sql/pglite, zod 4, helmet, compression, dotenv, express-rate-limit, react 19, react-dom, react-router 7, @tanstack/react-query 5 (+ persist-client, sync-storage-persister), recharts 3, lucide-react, clsx, tailwindcss 4 + @tailwindcss/vite, vite 8, vite-plugin-pwa, @vite-pwa/assets-generator, tsx, esbuild, vitest 5, supertest, @testing-library/react, jsdom, @playwright/test, typescript 7. If something is truly missing, work around it and say so in your report.
- **`shared/types.ts` is frozen.** Engine export signatures in `shared/engine/index.ts` are frozen.
- **Stay inside your owned paths** (see §10). Read anything.
- Type-check: `npx tsc -p tsconfig.json --noEmit` (server + shared) and `npx tsc -p web/tsconfig.json --noEmit` (web). TypeScript 7: `types` must be listed explicitly; no `baseUrl`; no `moduleResolution: node`.
- Tests: `npx vitest run shared`, `npx vitest run server`, `npx vitest run web`.
- Imports: relative paths with no extension (moduleResolution `bundler`), e.g. `import { suggestNext } from '../shared/engine'`.

## 10. Ownership

| Agent | Owns |
|---|---|
| Engine | `shared/**` except `shared/types.ts` |
| Server | `server/**`, `render.yaml` |
| Web | `web/**`, `vite.config.ts` |
| Orchestrator | root configs, `docs/`, `README.md`, `.env.example`, `e2e/`, integration fixes |
