import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BodyweightEntry, Exercise, ExportBundle, Routine, User, Workout } from '../shared/types';
import type { Db } from './db';
import { makeApp, makeDb, set, signedIn, workout } from './test/helpers';

let db: Db;
let app: Express;
beforeAll(async () => {
  db = await makeDb();
  app = (await makeApp({ db })).app;
});
afterAll(async () => {
  await db.close();
});

/** Strip ids/timestamps that legitimately change when data moves to another account. */
function shape(b: ExportBundle) {
  const exName = new Map(b.customExercises.map((e) => [e.id, e.name]));
  const routineName = new Map(b.routines.map((r) => [r.id, r.name]));
  const ex = (id: string) => (exName.has(id) ? `custom:${exName.get(id)}` : id);
  return {
    user: b.user,
    customExercises: b.customExercises.map(({ id: _id, ...rest }) => rest),
    routines: b.routines.map((r) => ({
      name: r.name,
      notes: r.notes,
      position: r.position,
      items: r.items.map((i) => ({ ...i, exerciseId: ex(i.exerciseId) })),
    })),
    workouts: b.workouts.map((w) => ({
      routine: w.routineId ? routineName.get(w.routineId) : null,
      name: w.name,
      startedAt: w.startedAt,
      endedAt: w.endedAt,
      notes: w.notes,
      bodyweightKg: w.bodyweightKg,
      sets: w.sets.map(({ id: _id, ...s }) => ({ ...s, exerciseId: ex(s.exerciseId) })),
    })),
    bodyweight: b.bodyweight.map(({ id: _id, ...rest }) => rest),
  };
}

describe('export / import', () => {
  it('round-trips into a fresh account, remapping ids that belong to the original owner', async () => {
    const A = await signedIn(app);
    await A.patch('/api/me', { unit: 'lb', goal: 'strength', daysPerWeek: 4, barWeightKg: 20.41, onboarded: true });
    const ex = (
      await A.post('/api/exercises/custom', {
        name: 'Belt Squat',
        primaryMuscle: 'quads',
        secondaryMuscles: ['glutes'],
        equipment: 'machine',
        mechanic: 'compound',
        trackingType: 'weight_reps',
        cue: 'Sit down between the feet.',
      })
    ).body as Exercise;
    const routine = (
      await A.post('/api/routines', {
        name: 'Legs',
        notes: 'heavy',
        items: [
          { exerciseId: ex.id, sets: 3, repMin: 8, repMax: 12, restSec: 120 },
          { exerciseId: 'barbell-back-squat', sets: 3, repMin: 5, repMax: 8, restSec: 180 },
        ],
      })
    ).body as Routine;
    const w1 = workout('2026-11-02T10:00:00.000Z', [[ex.id, [[90, 10], [90, 9]]], ['barbell-back-squat', [[120, 5]]]], {
      routineId: routine.id,
      notes: 'good day',
      bodyweightKg: 82,
    });
    w1.sets.push(set({ exerciseId: 'barbell-back-squat', exerciseOrder: 1, setOrder: 1, kind: 'warmup', weightKg: 60, reps: 5, rpe: 6 }));
    const w2 = workout('2026-11-05T10:00:00.000Z', [['barbell-bench-press', [[80, 8]]]]);
    await A.put(`/api/workouts/${w1.id}`, w1);
    await A.put(`/api/workouts/${w2.id}`, w2);
    await A.put('/api/bodyweight/2026-11-02', { weightKg: 82 });
    await A.put('/api/bodyweight/2026-11-05', { weightKg: 81.5 });

    const exp = await A.get('/api/export');
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toMatch(/^attachment; filename="?lift-more-export-\d{4}-\d{2}-\d{2}\.json"?$/);
    const bundle = exp.body as ExportBundle;
    expect(bundle.version).toBe(1);
    expect(bundle.user).toEqual({
      displayName: 'Test Lifter',
      unit: 'lb',
      goal: 'strength',
      experience: 'beginner',
      daysPerWeek: 4,
      defaultRestSec: 120,
      timezone: 'UTC',
      barWeightKg: 20.41,
    });
    expect(bundle.workouts.map((w) => w.id)).toEqual([w1.id, w2.id]);
    expect(bundle).not.toHaveProperty('user.email');
    expect(JSON.stringify(bundle)).not.toContain(A.user!.email);

    const B = await signedIn(app);
    const imp = await B.post('/api/import', bundle);
    expect(imp.status).toBe(200);
    expect(imp.body).toEqual({ routines: 1, workouts: 2, customExercises: 1, bodyweight: 2 });

    const bBundle = (await B.get('/api/export')).body as ExportBundle;
    expect(shape(bBundle)).toEqual({ ...shape(bundle), user: { ...bundle.user, displayName: 'Test Lifter' } });
    // A's rows were never touched or re-owned; B got fresh ids where A's were taken.
    expect(bBundle.customExercises[0]!.id).not.toBe(ex.id);
    expect(bBundle.routines[0]!.id).not.toBe(routine.id);
    expect(bBundle.workouts.map((w) => w.id)).not.toContain(w1.id);
    const aAfter = (await A.get('/api/export')).body as ExportBundle;
    expect(shape(aAfter)).toEqual(shape(bundle));
    expect(aAfter.workouts[0]!.id).toBe(w1.id);

    // fresh account adopted the exported preferences and is onboarded
    const bUser = (await B.get('/api/auth/me')).body as User;
    expect(bUser).toMatchObject({ unit: 'lb', goal: 'strength', daysPerWeek: 4, onboarded: true });
  });

  it('re-importing into the same account is idempotent (upsert by id)', async () => {
    const A = await signedIn(app);
    const w = workout('2026-11-02T10:00:00.000Z', [['barbell-bench-press', [[80, 8], [80, 8]]]]);
    await A.put(`/api/workouts/${w.id}`, w);
    await A.post('/api/routines', { name: 'R', notes: '', items: [] });
    await A.put('/api/bodyweight/2026-11-02', { weightKg: 70 });
    const bundle = (await A.get('/api/export')).body as ExportBundle;

    for (let i = 0; i < 2; i++) expect((await A.post('/api/import', bundle)).status).toBe(200);
    const after = (await A.get('/api/export')).body as ExportBundle;
    expect(after.workouts.map((x) => x.id)).toEqual([w.id]);
    expect(after.workouts[0]!.sets.map((s) => s.id)).toEqual(bundle.workouts[0]!.sets.map((s) => s.id));
    expect(after.routines).toHaveLength(1);
    expect(after.routines[0]!.id).toBe(bundle.routines[0]!.id);
    expect((await A.get('/api/bodyweight')).body as BodyweightEntry[]).toEqual(bundle.bodyweight);
    expect(((await A.get(`/api/workouts/${w.id}`)).body as Workout).sets).toHaveLength(2);
  });

  it('rejects malformed bundles', async () => {
    const A = await signedIn(app);
    expect((await A.post('/api/import', { version: 2 })).status).toBe(400);
    const bad = await A.post('/api/import', {
      version: 1,
      workouts: [{ ...workout('2026-11-02T10:00:00.000Z', [['x', [[2000, 5]]]]) }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation');
  });

  it('accepts bundles above 1 MB on /api/import (15 MB limit)', async () => {
    const A = await signedIn(app);
    const workouts = Array.from({ length: 100 }, (_, i) =>
      workout(new Date(Date.UTC(2025, 0, 1 + i, 10)).toISOString(), [
        ['barbell-bench-press', Array.from({ length: 50 }, () => [80, 8] as [number, number])],
      ], { notes: 'n'.repeat(1500) }),
    );
    const bundle = { version: 1, exportedAt: new Date().toISOString(), customExercises: [], routines: [], workouts, bodyweight: [] };
    expect(JSON.stringify(bundle).length).toBeGreaterThan(1_100_000);
    const res = await A.post('/api/import', bundle);
    expect(res.status).toBe(200);
    expect(res.body.workouts).toBe(100);
    expect((await A.get('/api/workouts?limit=100')).body).toHaveLength(100);
  });
});
