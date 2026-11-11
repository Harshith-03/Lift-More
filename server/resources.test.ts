import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  BodyweightEntry,
  Exercise,
  ExerciseHistory,
  ExerciseSession,
  PersonalRecord,
  Routine,
  StatsSummary,
  WeeklyPlan,
  Workout,
  WorkoutSummary,
} from '../shared/types';
import type { Db } from './db';
import { makeApp, makeDb, set, signedIn, workout } from './test/helpers';

let db: Db;
let app: Express;
const NOW = new Date('2026-11-11T12:00:00.000Z'); // a Wednesday

beforeAll(async () => {
  db = await makeDb();
  app = (await makeApp({ db, now: () => NOW })).app;
});
afterAll(async () => {
  await db.close();
});

const customInput = {
  name: 'Landmine Press',
  primaryMuscle: 'shoulders',
  secondaryMuscles: ['chest', 'triceps', 'chest'],
  equipment: 'barbell',
  mechanic: 'compound',
  trackingType: 'weight_reps',
  cue: 'Press up and slightly forward.',
};

const routineInput = (name: string, exerciseId = 'barbell-bench-press') => ({
  name,
  notes: `${name} notes`,
  items: [{ exerciseId, sets: 3, repMin: 8, repMax: 12, restSec: 120, notes: 'go' }],
});

describe('custom exercises', () => {
  it('CRUD', async () => {
    const c = await signedIn(app);
    const created = await c.post('/api/exercises/custom', customInput);
    expect(created.status).toBe(201);
    const ex = created.body as Exercise;
    expect(ex.id).toMatch(/^custom-[0-9a-f-]{36}$/);
    expect(ex).toMatchObject({ ...customInput, secondaryMuscles: ['chest', 'triceps'], isCustom: true });

    const patched = await c.patch(`/api/exercises/custom/${ex.id}`, { name: 'Landmine Press (1-arm)', cue: null });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Landmine Press (1-arm)');
    expect(patched.body.cue).toBeUndefined();
    expect(patched.body.primaryMuscle).toBe('shoulders');

    expect((await c.patch(`/api/exercises/custom/${ex.id}`, { primaryMuscle: 'wings' })).status).toBe(400);
    expect((await c.get('/api/exercises/custom')).body).toHaveLength(1);
    expect((await c.del(`/api/exercises/custom/${ex.id}`)).status).toBe(204);
    expect((await c.get('/api/exercises/custom')).body).toEqual([]);
    expect((await c.del(`/api/exercises/custom/${ex.id}`)).status).toBe(404);
  });

  it('validates names', async () => {
    const c = await signedIn(app);
    expect((await c.post('/api/exercises/custom', { ...customInput, name: 'x'.repeat(81) })).status).toBe(400);
    expect((await c.post('/api/exercises/custom', { ...customInput, name: '   ' })).status).toBe(400);
  });
});

describe('routines', () => {
  it('create / list / update / reorder / delete', async () => {
    const c = await signedIn(app);
    const a = (await c.post('/api/routines', routineInput('A'))).body as Routine;
    const b = (await c.post('/api/routines', routineInput('B'))).body as Routine;
    const cc = (await c.post('/api/routines', routineInput('C'))).body as Routine;
    expect([a.position, b.position, cc.position]).toEqual([0, 1, 2]);
    expect(a).toMatchObject({ name: 'A', notes: 'A notes', items: routineInput('A').items });
    expect(Date.parse(a.createdAt)).not.toBeNaN();

    const upd = await c.put(`/api/routines/${b.id}`, {
      name: 'B2',
      notes: '',
      items: [{ exerciseId: 'barbell-back-squat', sets: 5, repMin: 5, repMax: 5, restSec: 180 }],
    });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ id: b.id, name: 'B2', position: 1 });
    expect(upd.body.items).toEqual([{ exerciseId: 'barbell-back-squat', sets: 5, repMin: 5, repMax: 5, restSec: 180 }]);

    const re = await c.post('/api/routines/reorder', { ids: [cc.id, a.id] });
    expect(re.status).toBe(200);
    expect((re.body as Routine[]).map((r) => [r.name, r.position])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B2', 2],
    ]);

    expect((await c.del(`/api/routines/${cc.id}`)).status).toBe(204);
    const list = (await c.get('/api/routines')).body as Routine[];
    expect(list.map((r) => [r.name, r.position])).toEqual([
      ['A', 0],
      ['B2', 1],
    ]);
    expect((await c.del(`/api/routines/${cc.id}`)).status).toBe(404);
  });

  it('honours an explicit position and validates items', async () => {
    const c = await signedIn(app);
    const r = await c.post('/api/routines', { ...routineInput('P'), position: 7 });
    expect(r.body.position).toBe(7);
    const bad = await c.post('/api/routines', {
      name: 'Bad',
      notes: '',
      items: [{ exerciseId: 'x', sets: 11, repMin: 12, repMax: 8, restSec: 60 }],
    });
    expect(bad.status).toBe(400);
    expect((await c.post('/api/routines', { name: 'x'.repeat(81), notes: '', items: [] })).status).toBe(400);
    expect((await c.put(`/api/routines/not-a-uuid`, routineInput('Q'))).status).toBe(404);
  });

  it('from-template appends (or replaces) the template routines', async () => {
    const c = await signedIn(app);
    await c.post('/api/routines', routineInput('Mine'));
    const res = await c.post('/api/routines/from-template', { templateId: 'ppl' });
    expect(res.status).toBe(201);
    const created = res.body as Routine[];
    expect(created.length).toBeGreaterThanOrEqual(3);
    expect(created.map((r) => r.position)).toEqual(created.map((_, i) => i + 1));
    expect(created.every((r) => r.items.length > 0)).toBe(true);
    expect((await c.get('/api/routines')).body).toHaveLength(created.length + 1);

    const replaced = await c.post('/api/routines/from-template', { templateId: 'full-body-3x', replaceExisting: true });
    expect(replaced.status).toBe(201);
    const all = (await c.get('/api/routines')).body as Routine[];
    expect(all).toHaveLength(replaced.body.length);
    expect(all[0]!.position).toBe(0);
    expect(all.some((r) => r.name === 'Mine')).toBe(false);

    expect((await c.post('/api/routines/from-template', { templateId: 'nope' })).status).toBe(404);
  });
});

describe('workouts', () => {
  it('PUT is an idempotent upsert that replaces sets', async () => {
    const c = await signedIn(app);
    const w = workout('2026-11-09T17:00:00.000Z', [
      ['barbell-bench-press', [[80, 10], [80, 9], [80, 8]]],
      ['barbell-row', [[60, 10]]],
    ]);
    const first = await c.put(`/api/workouts/${w.id}`, w);
    expect(first.status).toBe(200);
    expect(first.body.workout).toMatchObject({ id: w.id, name: 'Session', startedAt: w.startedAt, endedAt: w.endedAt });
    expect(first.body.workout.sets).toHaveLength(4);
    expect(Array.isArray(first.body.prs)).toBe(true);

    const again = await c.put(`/api/workouts/${w.id}`, w);
    expect(again.status).toBe(200);
    expect(again.body.workout.sets).toEqual(first.body.workout.sets);

    const edited: Workout = { ...w, name: 'Edited', notes: 'felt good', sets: [set({ exerciseId: 'barbell-squat-x', weightKg: 100, reps: 5 })] };
    const third = await c.put(`/api/workouts/${w.id}`, edited);
    expect(third.status).toBe(200);
    const fetched = (await c.get(`/api/workouts/${w.id}`)).body as Workout;
    expect(fetched.name).toBe('Edited');
    expect(fetched.notes).toBe('felt good');
    expect(fetched.sets).toHaveLength(1);
    expect(fetched.sets[0]).toEqual({ ...edited.sets[0], notes: null });
    expect(typeof fetched.updatedAt).toBe('string');

    const rows = await db.query('SELECT id FROM workouts WHERE id = $1', [w.id]);
    expect(rows).toHaveLength(1);
    expect(await db.query('SELECT id FROM workout_sets WHERE workout_id = $1', [w.id])).toHaveLength(1);
  });

  it('returns sets in order with exact types', async () => {
    const c = await signedIn(app);
    const w = workout('2026-11-03T08:00:00.000Z', []);
    w.sets = [
      set({ exerciseId: 'plank', exerciseOrder: 1, setOrder: 0, weightKg: null, reps: null, durationSec: 60, rpe: 8.5, kind: 'working' }),
      set({ exerciseId: 'barbell-bench-press', exerciseOrder: 0, setOrder: 1, weightKg: 60.5, reps: 8, rpe: 7, notes: 'tough' }),
      set({ exerciseId: 'barbell-bench-press', exerciseOrder: 0, setOrder: 0, weightKg: 40, reps: 5, kind: 'warmup', completed: false }),
    ];
    w.bodyweightKg = 82.3;
    await c.put(`/api/workouts/${w.id}`, w);
    const got = (await c.get(`/api/workouts/${w.id}`)).body as Workout;
    expect(got.bodyweightKg).toBe(82.3);
    expect(got.sets.map((s) => [s.exerciseOrder, s.setOrder])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(got.sets[1]).toMatchObject({ weightKg: 60.5, reps: 8, rpe: 7, notes: 'tough', completed: true });
    expect(got.sets[2]).toMatchObject({ weightKg: null, reps: null, durationSec: 60, rpe: 8.5 });
  });

  it('validates bounds and id match', async () => {
    const c = await signedIn(app);
    const w = workout('2026-11-03T08:00:00.000Z', [['barbell-bench-press', [[80, 10]]]]);
    const mismatch = await c.put(`/api/workouts/${randomUUID()}`, w);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toBe('validation');

    const bad = (patch: Partial<Workout['sets'][number]>) => ({ ...w, sets: [{ ...w.sets[0]!, ...patch }] });
    expect((await c.put(`/api/workouts/${w.id}`, bad({ weightKg: 1001 }))).status).toBe(400);
    expect((await c.put(`/api/workouts/${w.id}`, bad({ reps: 201 }))).status).toBe(400);
    expect((await c.put(`/api/workouts/${w.id}`, bad({ rpe: 4.5 }))).status).toBe(400);
    expect((await c.put(`/api/workouts/${w.id}`, bad({ rpe: 10.5 }))).status).toBe(400);
    expect((await c.put(`/api/workouts/${w.id}`, bad({ kind: 'mega' as never }))).status).toBe(400);
    expect((await c.put(`/api/workouts/${w.id}`, { ...w, name: 'n'.repeat(81) })).status).toBe(400);
    expect((await c.put(`/api/workouts/${w.id}`, { ...w, notes: 'n'.repeat(2001) })).status).toBe(400);

    const tooManyPerExercise = { ...w, sets: Array.from({ length: 61 }, (_, i) => set({ exerciseId: 'a', setOrder: Math.min(i, 59) })) };
    expect((await c.put(`/api/workouts/${w.id}`, tooManyPerExercise)).status).toBe(400);
    const tooMany = {
      ...w,
      sets: Array.from({ length: 401 }, (_, i) => set({ exerciseId: `e${i % 10}`, exerciseOrder: i % 10, setOrder: Math.floor(i / 10) })),
    };
    expect((await c.put(`/api/workouts/${w.id}`, tooMany)).status).toBe(400);
    expect((await c.get(`/api/workouts/${w.id}`)).status).toBe(404);

    const ok60 = { ...w, sets: Array.from({ length: 60 }, (_, i) => set({ exerciseId: 'a', setOrder: i })) };
    expect((await c.put(`/api/workouts/${w.id}`, ok60)).status).toBe(200);
  });

  it('lists summaries newest first with cursor pagination', async () => {
    const c = await signedIn(app);
    const ids: string[] = [];
    for (let d = 1; d <= 5; d++) {
      const w = workout(`2026-10-0${d}T10:00:00.000Z`, [
        ['barbell-bench-press', [[100, 5], [100, 5]]],
        ['barbell-row', [[50, 10]]],
      ]);
      w.sets.push(set({ exerciseId: 'barbell-bench-press', setOrder: 2, kind: 'warmup', weightKg: 40, reps: 5 }));
      w.sets.push(set({ exerciseId: 'barbell-row', exerciseOrder: 1, setOrder: 1, completed: false, weightKg: 50, reps: 10 }));
      await c.put(`/api/workouts/${w.id}`, w);
      ids.push(w.id);
    }
    const page1 = (await c.get('/api/workouts?limit=2')).body as WorkoutSummary[];
    expect(page1.map((s) => s.id)).toEqual([ids[4], ids[3]]);
    expect(page1[0]).toEqual({
      id: ids[4],
      routineId: null,
      name: 'Session',
      startedAt: '2026-10-05T10:00:00.000Z',
      endedAt: '2026-10-05T11:00:00.000Z',
      durationSec: 3600,
      exerciseIds: ['barbell-bench-press', 'barbell-row'],
      setCount: 3,
      volumeKg: 1500,
    });
    const page2 = (await c.get(`/api/workouts?limit=2&before=${encodeURIComponent(page1[1]!.startedAt)}`)).body as WorkoutSummary[];
    expect(page2.map((s) => s.id)).toEqual([ids[2], ids[1]]);
    const page3 = (await c.get(`/api/workouts?limit=2&before=${encodeURIComponent(page2[1]!.startedAt)}`)).body as WorkoutSummary[];
    expect(page3.map((s) => s.id)).toEqual([ids[0]]);
    expect((await c.get('/api/workouts')).body).toHaveLength(5);
    expect((await c.get('/api/workouts?limit=0')).status).toBe(400);
    expect((await c.get('/api/workouts?before=yesterday')).status).toBe(400);
  });

  it('DELETE removes the workout and its sets', async () => {
    const c = await signedIn(app);
    const w = workout('2026-11-03T08:00:00.000Z', [['barbell-bench-press', [[80, 10]]]]);
    await c.put(`/api/workouts/${w.id}`, w);
    expect((await c.del(`/api/workouts/${w.id}`)).status).toBe(204);
    expect((await c.get(`/api/workouts/${w.id}`)).status).toBe(404);
    expect(await db.query('SELECT 1 FROM workout_sets WHERE workout_id = $1', [w.id])).toHaveLength(0);
    expect((await c.get('/api/workouts/not-a-uuid')).status).toBe(404);
  });

  it('reports PRs against earlier workouts only', async () => {
    const c = await signedIn(app);
    const w1 = workout('2026-11-02T10:00:00.000Z', [['barbell-bench-press', [[80, 8], [80, 8]]]]);
    await c.put(`/api/workouts/${w1.id}`, w1);
    const w2 = workout('2026-11-09T10:00:00.000Z', [['barbell-bench-press', [[90, 8], [90, 8]]]]);
    const res = await c.put(`/api/workouts/${w2.id}`, w2);
    const prs = res.body.prs as PersonalRecord[];
    expect(prs.length).toBeGreaterThan(0);
    expect(prs.every((p) => p.exerciseId === 'barbell-bench-press' && p.workoutId === w2.id)).toBe(true);
    expect(prs.some((p) => p.type === 'weight' && p.value === 90)).toBe(true);

    // Re-saving the older, lighter workout sets no PR (90 kg came later, 80 kg had nothing before it to beat … but
    // never counts the later workout as "prior").
    const older = await c.put(`/api/workouts/${w1.id}`, w1);
    expect((older.body.prs as PersonalRecord[]).every((p) => p.workoutId === w1.id)).toBe(true);
    const lighter = workout('2026-11-10T10:00:00.000Z', [['barbell-bench-press', [[70, 5]]]]);
    const none = await c.put(`/api/workouts/${lighter.id}`, lighter);
    expect(none.body.prs).toEqual([]);
  });
});

describe('history', () => {
  it('history/last returns the most recent completed working sets per exercise', async () => {
    const c = await signedIn(app);
    const old = workout('2026-11-01T10:00:00.000Z', [['barbell-bench-press', [[70, 10]]], ['barbell-row', [[50, 12]]]]);
    const recent = workout('2026-11-08T10:00:00.000Z', [['barbell-bench-press', [[75, 9], [75, 8]]]]);
    recent.sets.push(set({ exerciseId: 'barbell-bench-press', setOrder: 2, kind: 'warmup', weightKg: 40, reps: 8 }));
    recent.sets.push(set({ exerciseId: 'barbell-bench-press', setOrder: 3, completed: false, weightKg: 75, reps: 0 }));
    await c.put(`/api/workouts/${old.id}`, old);
    await c.put(`/api/workouts/${recent.id}`, recent);

    const res = await c.get('/api/history/last?exerciseIds=barbell-bench-press,barbell-row,never-done');
    expect(res.status).toBe(200);
    const body = res.body as Record<string, ExerciseSession | null>;
    expect(Object.keys(body).sort()).toEqual(['barbell-bench-press', 'barbell-row', 'never-done']);
    expect(body['never-done']).toBeNull();
    expect(body['barbell-bench-press']!.workoutId).toBe(recent.id);
    expect(body['barbell-bench-press']!.date).toBe('2026-11-08T10:00:00.000Z');
    expect(body['barbell-bench-press']!.sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [75, 9],
      [75, 8],
    ]);
    expect(body['barbell-row']!.workoutId).toBe(old.id);
    expect((await c.get('/api/history/last')).body).toEqual({});
  });

  it('history/exercise returns sessions most recent first, limited, with PRs', async () => {
    const c = await signedIn(app);
    for (let d = 1; d <= 4; d++) {
      const w = workout(`2026-10-1${d}T10:00:00.000Z`, [['barbell-bench-press', [[60 + d * 2.5, 8]]], ['barbell-row', [[50, 10]]]]);
      await c.put(`/api/workouts/${w.id}`, w);
    }
    const res = await c.get('/api/history/exercise/barbell-bench-press?limit=3');
    expect(res.status).toBe(200);
    const h = res.body as ExerciseHistory;
    expect(h.exerciseId).toBe('barbell-bench-press');
    expect(h.sessions).toHaveLength(3);
    expect(h.sessions[0]!.date).toBe('2026-10-14T10:00:00.000Z');
    expect(h.sessions[0]!.sets.every((s) => s.exerciseId === 'barbell-bench-press')).toBe(true);
    expect(h.prs.length).toBeGreaterThan(0);
    const empty = (await c.get('/api/history/exercise/never-done')).body as ExerciseHistory;
    expect(empty.sessions).toEqual([]);
  });
});

describe('stats + plan', () => {
  it('computes stats and a weekly plan via the engine', async () => {
    const c = await signedIn(app);
    await c.patch('/api/me', { onboarded: true, daysPerWeek: 3 });
    const routine = (await c.post('/api/routines', routineInput('Push'))).body as Routine;
    const w = workout('2026-11-09T10:00:00.000Z', [['barbell-bench-press', [[100, 12], [100, 12], [100, 12]]]], {
      routineId: routine.id,
    });
    await c.put(`/api/workouts/${w.id}`, w);

    const stats = (await c.get('/api/stats')).body as StatsSummary;
    expect(stats.totalWorkouts).toBe(1);
    expect(stats.workoutsThisWeek).toBe(1);
    expect(stats.targetThisWeek).toBe(3);
    expect(stats.weeklyVolume).toHaveLength(12);

    const plan = (await c.get('/api/plan')).body as WeeklyPlan;
    expect(plan.weekStart).toBe('2026-11-09');
    expect(plan.routines).toHaveLength(1);
    const bench = plan.routines[0]!.exercises.find((e) => e.exerciseId === 'barbell-bench-press')!;
    expect(bench.action).toBe('increase_weight');
    expect(bench.weightKg).toBeGreaterThan(100);
  });
});

describe('bodyweight', () => {
  it('upserts by date, lists oldest→newest, deletes', async () => {
    const c = await signedIn(app);
    const a = await c.put('/api/bodyweight/2026-11-05', { weightKg: 80.4 });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ date: '2026-11-05', weightKg: 80.4 });
    const again = await c.put('/api/bodyweight/2026-11-05', { weightKg: 80.1 });
    expect(again.body.id).toBe(a.body.id);
    await c.put('/api/bodyweight/2026-11-01', { weightKg: 81 });
    const list = (await c.get('/api/bodyweight')).body as BodyweightEntry[];
    expect(list.map((e) => [e.date, e.weightKg])).toEqual([
      ['2026-11-01', 81],
      ['2026-11-05', 80.1],
    ]);
    expect((await c.put('/api/bodyweight/2026-13-40', { weightKg: 80 })).status).toBe(404);
    expect((await c.put('/api/bodyweight/2026-11-02', { weightKg: 0 })).status).toBe(400);
    expect((await c.put('/api/bodyweight/2026-11-02', { weightKg: 1001 })).status).toBe(400);
    expect((await c.del('/api/bodyweight/2026-11-01')).status).toBe(204);
    expect((await c.del('/api/bodyweight/2026-11-01')).status).toBe(404);
    expect((await c.get('/api/bodyweight')).body).toHaveLength(1);
  });
});

describe('cross-user isolation', () => {
  it("B gets 404 on every one of A's rows and sees none of A's data", async () => {
    const A = await signedIn(app);
    const B = await signedIn(app);

    const ex = (await A.post('/api/exercises/custom', customInput)).body as Exercise;
    const routine = (await A.post('/api/routines', routineInput('A only', ex.id))).body as Routine;
    const w = workout('2026-11-09T10:00:00.000Z', [[ex.id, [[50, 10]]]], { routineId: routine.id });
    await A.put(`/api/workouts/${w.id}`, w);
    await A.put('/api/bodyweight/2026-11-09', { weightKg: 77 });

    // workouts
    expect((await B.get(`/api/workouts/${w.id}`)).status).toBe(404);
    const hijack = await B.put(`/api/workouts/${w.id}`, { ...w, name: 'pwned', sets: [] });
    expect(hijack.status).toBe(404);
    expect((await B.del(`/api/workouts/${w.id}`)).status).toBe(404);
    // routines
    expect((await B.put(`/api/routines/${routine.id}`, routineInput('pwned'))).status).toBe(404);
    expect((await B.del(`/api/routines/${routine.id}`)).status).toBe(404);
    expect((await B.post('/api/routines/reorder', { ids: [routine.id] })).status).toBe(404);
    // custom exercises
    expect((await B.patch(`/api/exercises/custom/${ex.id}`, { name: 'pwned' })).status).toBe(404);
    expect((await B.del(`/api/exercises/custom/${ex.id}`)).status).toBe(404);
    // bodyweight
    expect((await B.del('/api/bodyweight/2026-11-09')).status).toBe(404);

    // B's views are empty
    expect((await B.get('/api/workouts')).body).toEqual([]);
    expect((await B.get('/api/routines')).body).toEqual([]);
    expect((await B.get('/api/exercises/custom')).body).toEqual([]);
    expect((await B.get('/api/bodyweight')).body).toEqual([]);
    expect((await B.get(`/api/history/last?exerciseIds=${ex.id}`)).body).toEqual({ [ex.id]: null });
    expect(((await B.get(`/api/history/exercise/${ex.id}`)).body as ExerciseHistory).sessions).toEqual([]);
    expect(((await B.get('/api/stats')).body as StatsSummary).totalWorkouts).toBe(0);

    // A is untouched
    const aw = (await A.get(`/api/workouts/${w.id}`)).body as Workout;
    expect(aw.name).toBe('Session');
    expect(aw.sets).toHaveLength(1);
    expect(((await A.get('/api/routines')).body as Routine[])[0]!.name).toBe('A only');
    expect(((await A.get('/api/exercises/custom')).body as Exercise[])[0]!.name).toBe('Landmine Press');
    expect((await A.get('/api/bodyweight')).body).toHaveLength(1);
  });

  it("a replayed set id from another user's workout never collides", async () => {
    const A = await signedIn(app);
    const B = await signedIn(app);
    const wa = workout('2026-11-09T10:00:00.000Z', [['barbell-bench-press', [[50, 10]]]]);
    await A.put(`/api/workouts/${wa.id}`, wa);
    const wb = { ...workout('2026-11-09T11:00:00.000Z', []), sets: wa.sets.map((s) => ({ ...s })) };
    const res = await B.put(`/api/workouts/${wb.id}`, wb);
    expect(res.status).toBe(200);
    expect(res.body.workout.sets[0].id).not.toBe(wa.sets[0]!.id);
    expect(((await A.get(`/api/workouts/${wa.id}`)).body as Workout).sets[0]!.id).toBe(wa.sets[0]!.id);
  });
});
