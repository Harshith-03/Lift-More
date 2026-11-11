import type { Db } from './types';

/**
 * Schema migrations as string constants (the server is bundled by esbuild — no .sql files).
 * Each migration is a list of single statements so it runs identically on `pg` and PGlite.
 * Append new migrations; never edit an applied one.
 */
export interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_init',
    statements: [
      `CREATE TABLE users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        display_name text NOT NULL,
        unit text NOT NULL DEFAULT 'kg',
        goal text NOT NULL DEFAULT 'hypertrophy',
        experience text NOT NULL DEFAULT 'beginner',
        days_per_week int NOT NULL DEFAULT 3,
        default_rest_sec int NOT NULL DEFAULT 120,
        timezone text NOT NULL DEFAULT 'UTC',
        bar_weight_kg double precision NOT NULL DEFAULT 20,
        onboarded boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE sessions (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )`,
      `CREATE INDEX sessions_user_idx ON sessions(user_id)`,
      `CREATE TABLE custom_exercises (
        id text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        primary_muscle text NOT NULL,
        secondary_muscles jsonb NOT NULL DEFAULT '[]',
        equipment text NOT NULL,
        mechanic text NOT NULL,
        tracking_type text NOT NULL,
        cue text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX custom_exercises_user_idx ON custom_exercises(user_id)`,
      `CREATE TABLE routines (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        notes text NOT NULL DEFAULT '',
        position int NOT NULL DEFAULT 0,
        items jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX routines_user_idx ON routines(user_id, position)`,
      `CREATE TABLE workouts (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        routine_id uuid,
        name text NOT NULL,
        started_at timestamptz NOT NULL,
        ended_at timestamptz,
        notes text NOT NULL DEFAULT '',
        bodyweight_kg double precision,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX workouts_user_started_idx ON workouts(user_id, started_at DESC)`,
      `CREATE TABLE workout_sets (
        id uuid PRIMARY KEY,
        workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_id text NOT NULL,
        exercise_order int NOT NULL,
        set_order int NOT NULL,
        kind text NOT NULL,
        weight_kg double precision,
        reps int,
        duration_sec int,
        rpe double precision,
        completed boolean NOT NULL DEFAULT false,
        notes text
      )`,
      `CREATE INDEX workout_sets_workout_idx ON workout_sets(workout_id)`,
      `CREATE INDEX workout_sets_user_exercise_idx ON workout_sets(user_id, exercise_id)`,
      `CREATE TABLE bodyweight (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date date NOT NULL,
        weight_kg double precision NOT NULL,
        UNIQUE (user_id, date)
      )`,
      `CREATE TABLE coach_reviews (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start date NOT NULL,
        input_hash text NOT NULL,
        payload jsonb NOT NULL,
        model text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, week_start, input_hash)
      )`,
      `CREATE TABLE ai_usage (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day date NOT NULL,
        count int NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      )`,
    ],
  },
];

/** Applies pending migrations in order, in one transaction, under an advisory lock (safe with >1 instance). */
export async function runMigrations(db: Db, migrations: Migration[] = MIGRATIONS): Promise<string[]> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  );
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(4207011)');
    const rows = await tx.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));
    const ran: string[] = [];
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      for (const stmt of m.statements) await tx.query(stmt);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
      ran.push(m.id);
    }
    return ran;
  });
}
