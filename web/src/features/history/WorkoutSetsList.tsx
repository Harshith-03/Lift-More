import clsx from 'clsx';
import type { Unit, Workout, WorkoutSet } from '../../../../shared/types';
import { useExerciseLookup } from '../../lib/queries';
import { fmtWeight } from '../../lib/format';
import { kindLabel } from '../workout/SetRow';

export function groupByExercise(w: Workout): Array<{ order: number; exerciseId: string; sets: WorkoutSet[] }> {
  const map = new Map<number, WorkoutSet[]>();
  for (const s of w.sets) {
    const list = map.get(s.exerciseOrder) ?? [];
    list.push(s);
    map.set(s.exerciseOrder, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, sets]) => ({ order, exerciseId: sets[0]!.exerciseId, sets: sets.sort((a, b) => a.setOrder - b.setOrder) }));
}

function describeSet(s: WorkoutSet, tracking: string, unit: Unit): string {
  if (tracking === 'duration') return `${s.durationSec ?? '—'}s${s.weightKg ? ` · +${fmtWeight(s.weightKg, unit)}` : ''}`;
  if (tracking === 'bodyweight_reps') return `${s.weightKg ? `+${fmtWeight(s.weightKg, unit)}` : 'BW'} × ${s.reps ?? '—'}`;
  return `${s.weightKg != null ? fmtWeight(s.weightKg, unit) : '—'} × ${s.reps ?? '—'}`;
}

/** Read-only list of a workout's exercises and sets. */
export function WorkoutSetsList({ workout, unit }: { workout: Workout; unit: Unit }) {
  const lookup = useExerciseLookup();
  const groups = groupByExercise(workout);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const ex = lookup.get(g.exerciseId);
        const tracking = ex?.trackingType ?? 'weight_reps';
        const note = g.sets.find((s) => s.notes)?.notes;
        let working = 0;
        return (
          <section key={g.order} className="rounded-[var(--radius-card)] border border-line/60 bg-surface p-4">
            <h3 className="font-bold">{lookup.name(g.exerciseId)}</h3>
            {note && <p className="mt-0.5 text-sm text-muted italic">{note}</p>}
            <ol className="mt-2 flex flex-col gap-1">
              {g.sets.map((s) => {
                if (s.kind !== 'warmup') working++;
                return (
                  <li key={s.id} className={clsx('flex items-center gap-3 text-[15px]', !s.completed && 'opacity-45')}>
                    <span
                      className={clsx(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                        s.kind === 'warmup' ? 'bg-warn-soft text-warn' : s.kind === 'drop' ? 'bg-info-soft text-info' : s.kind === 'failure' ? 'bg-danger-soft text-danger' : 'bg-surface-2',
                      )}
                    >
                      {kindLabel(s.kind, working)}
                    </span>
                    <span className="flex-1 font-semibold">{describeSet(s, tracking, unit)}</span>
                    {s.rpe != null && <span className="text-sm text-muted">RPE {s.rpe}</span>}
                    {!s.completed && <span className="text-xs text-faint">not done</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
