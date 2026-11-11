import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { ExportBundle, Workout } from '../../shared/types';
import { currentUser, type AppContext } from '../context';
import type { Queryable } from '../db/types';
import { parse } from '../errors';
import { listBodyweight } from '../repo/bodyweight';
import { listCustomExercises, upsertCustomExercise } from '../repo/exercises';
import { listRoutines, upsertRoutine } from '../repo/routines';
import { insertMany } from '../repo/sql';
import { findUserById, updateUserSettings } from '../repo/users';
import { loadWorkouts } from '../repo/workouts';
import { toUser } from '../repo/mappers';
import { importSchema, type ImportBundle } from '../validation';
import { normalizeWorkout } from './workouts';

export function exportRouter(ctx: AppContext): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const [row, customExercises, routines, workouts, bodyweight] = await Promise.all([
      findUserById(ctx.db, userId),
      listCustomExercises(ctx.db, userId),
      listRoutines(ctx.db, userId),
      loadWorkouts(ctx.db, userId),
      listBodyweight(ctx.db, userId),
    ]);
    const u = toUser(row!);
    const now = ctx.now();
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: now.toISOString(),
      user: {
        displayName: u.displayName,
        unit: u.unit,
        goal: u.goal,
        experience: u.experience,
        daysPerWeek: u.daysPerWeek,
        defaultRestSec: u.defaultRestSec,
        timezone: u.timezone,
        barWeightKg: u.barWeightKg,
      },
      customExercises,
      routines,
      workouts: workouts.reverse(), // oldest → newest reads naturally in a backup file
      bodyweight,
    };
    res.attachment(`lift-more-export-${now.toISOString().slice(0, 10)}.json`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(bundle);
  });
  return r;
}

/** ids from `candidates` that already exist in `table` for a *different* user. */
async function foreignIds(q: Queryable, table: string, idType: 'uuid' | 'text', userId: string, candidates: string[]) {
  if (candidates.length === 0) return new Set<string>();
  const rows = await q.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ANY($1::${idType}[]) AND user_id <> $2`,
    [candidates, userId],
  );
  return new Set(rows.map((r) => r.id));
}

export async function importBundle(ctx: AppContext, userId: string, bundle: ImportBundle) {
  return ctx.db.transaction(async (tx) => {
    // 1. Custom exercises. Ids owned by someone else (e.g. importing a friend's export) get fresh ids.
    const exMap = new Map<string, string>();
    const exForeign = await foreignIds(tx, 'custom_exercises', 'text', userId, bundle.customExercises.map((e) => e.id));
    let customCount = 0;
    for (const e of bundle.customExercises) {
      const id = e.id.startsWith('custom-') && !exForeign.has(e.id) ? e.id : `custom-${randomUUID()}`;
      exMap.set(e.id, id);
      const saved = await upsertCustomExercise(tx, userId, {
        id,
        name: e.name,
        primaryMuscle: e.primaryMuscle,
        secondaryMuscles: e.secondaryMuscles,
        equipment: e.equipment,
        mechanic: e.mechanic,
        trackingType: e.trackingType,
        cue: e.cue,
      });
      if (saved) customCount++;
    }
    const exId = (id: string) => exMap.get(id) ?? id;

    // 2. Routines
    const routineMap = new Map<string, string>();
    const routines = dedupeById(bundle.routines.map((r) => ({ ...r, id: r.id.toLowerCase() })));
    const rtForeign = await foreignIds(tx, 'routines', 'uuid', userId, routines.map((r) => r.id));
    let routineCount = 0;
    for (const r of routines) {
      const id = rtForeign.has(r.id) ? randomUUID() : r.id;
      routineMap.set(r.id, id);
      const saved = await upsertRoutine(tx, userId, {
        id,
        name: r.name,
        notes: r.notes,
        position: r.position,
        items: r.items.map((i) => ({ ...i, exerciseId: exId(i.exerciseId) })),
      });
      if (saved) routineCount++;
    }

    // 3. Workouts + sets, in bulk.
    const workouts: Workout[] = dedupeById(bundle.workouts.map(normalizeWorkout));
    const wkForeign = await foreignIds(tx, 'workouts', 'uuid', userId, workouts.map((w) => w.id));
    for (const w of workouts) {
      if (wkForeign.has(w.id)) w.id = randomUUID();
      if (w.routineId && routineMap.has(w.routineId)) w.routineId = routineMap.get(w.routineId)!;
      for (const s of w.sets) s.exerciseId = exId(s.exerciseId);
    }
    if (workouts.length) {
      await insertMany(
        tx,
        'workouts',
        ['id', 'user_id', 'routine_id', 'name', 'started_at', 'ended_at', 'notes', 'bodyweight_kg'],
        workouts.map((w) => [w.id, userId, w.routineId, w.name, w.startedAt, w.endedAt, w.notes, w.bodyweightKg]),
        {
          suffix: `ON CONFLICT (id) DO UPDATE SET
            routine_id = EXCLUDED.routine_id, name = EXCLUDED.name, started_at = EXCLUDED.started_at,
            ended_at = EXCLUDED.ended_at, notes = EXCLUDED.notes, bodyweight_kg = EXCLUDED.bodyweight_kg, updated_at = now()
            WHERE workouts.user_id = EXCLUDED.user_id`,
        },
      );
      await tx.query('DELETE FROM workout_sets WHERE workout_id = ANY($1::uuid[]) AND user_id = $2', [
        workouts.map((w) => w.id),
        userId,
      ]);
      const allSets = workouts.flatMap((w) => w.sets.map((s) => ({ s, workoutId: w.id })));
      const taken = new Set<string>();
      const ids = allSets.map((x) => x.s.id);
      for (let i = 0; i < ids.length; i += 5000) {
        const rows = await tx.query<{ id: string }>('SELECT id FROM workout_sets WHERE id = ANY($1::uuid[])', [
          ids.slice(i, i + 5000),
        ]);
        rows.forEach((r) => taken.add(r.id));
      }
      await insertMany(
        tx,
        'workout_sets',
        [
          'id',
          'workout_id',
          'user_id',
          'exercise_id',
          'exercise_order',
          'set_order',
          'kind',
          'weight_kg',
          'reps',
          'duration_sec',
          'rpe',
          'completed',
          'notes',
        ],
        allSets.map(({ s, workoutId }) => {
          const id = taken.has(s.id) ? randomUUID() : s.id;
          taken.add(id); // duplicates inside the bundle get fresh ids too
          return [
            id,
            workoutId,
            userId,
            s.exerciseId,
            s.exerciseOrder,
            s.setOrder,
            s.kind,
            s.weightKg,
            s.reps,
            s.durationSec,
            s.rpe,
            s.completed,
            s.notes ?? null,
          ];
        }),
      );
    }

    // 4. Bodyweight: keyed by (user, date); bundle ids reused only when free.
    const byDate = new Map<string, { id?: string; date: string; weightKg: number }>();
    for (const b of bundle.bodyweight) byDate.set(b.date, b);
    const entries = [...byDate.values()];
    const givenIds = entries.map((b) => b.id?.toLowerCase()).filter((x): x is string => Boolean(x));
    const existing = givenIds.length
      ? await tx.query<{ id: string; user_id: string; date: string }>(
          'SELECT id, user_id, date FROM bodyweight WHERE id = ANY($1::uuid[])',
          [givenIds],
        )
      : [];
    const existingById = new Map(existing.map((e) => [e.id, e]));
    await insertMany(
      tx,
      'bodyweight',
      ['id', 'user_id', 'date', 'weight_kg'],
      entries.map((b) => {
        const id = b.id?.toLowerCase();
        const hit = id ? existingById.get(id) : undefined;
        const usable = id && (!hit || (hit.user_id === userId && String(hit.date).slice(0, 10) === b.date));
        return [usable ? id : randomUUID(), userId, b.date, b.weightKg];
      }),
      { suffix: 'ON CONFLICT (user_id, date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg' },
    );

    // 5. A fresh (not yet onboarded) account adopts the exported preferences.
    const me = await findUserById(tx, userId);
    if (me && !me.onboarded && bundle.user) {
      const { displayName: _ignored, ...prefs } = bundle.user;
      void _ignored;
      await updateUserSettings(tx, userId, { ...prefs, onboarded: true });
    }

    return {
      routines: routineCount,
      workouts: workouts.length,
      customExercises: customCount,
      bodyweight: entries.length,
    };
  });
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const m = new Map<string, T>();
  for (const i of items) m.set(i.id, i);
  return [...m.values()];
}

export function importRouter(ctx: AppContext): Router {
  const r = Router();
  r.post('/', async (req, res) => {
    const user = currentUser(req);
    const bundle = parse(importSchema, req.body);
    res.json(await importBundle(ctx, user.id, bundle));
  });
  return r;
}
