import { useLocation, useNavigate } from 'react-router';
import { CloudUpload, Trophy } from 'lucide-react';
import type { Workout } from '../../../../shared/types';
import { useExerciseLookup, useUser } from '../../lib/queries';
import { describePR, fmtDay, fmtDuration, fmtVolume, plural } from '../../lib/format';
import { Button, EmptyState } from '../../components/ui';
import { setsVolumeKg } from './draftReducer';
import { lastSummary, type WorkoutResult } from './finish';
import { WorkoutSetsList } from '../history/WorkoutSetsList';

export function workoutStats(w: Workout) {
  const done = w.sets.filter((s) => s.completed && s.kind !== 'warmup');
  const durationSec = w.endedAt ? (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 1000 : null;
  const exercises = new Set(w.sets.map((s) => s.exerciseOrder)).size;
  return { sets: done.length, durationSec, exercises, volumeKg: setsVolumeKg(w.sets) };
}

export function WorkoutSummaryPage() {
  const user = useUser();
  const lookup = useExerciseLookup();
  const navigate = useNavigate();
  const location = useLocation();
  const result = (location.state as WorkoutResult | null) ?? lastSummary();

  if (!result) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-4">
        <EmptyState title="No recent workout" action={<Button variant="primary" onClick={() => navigate('/')}>Go home</Button>} />
      </div>
    );
  }

  const { workout, prs, queued } = result;
  const stats = workoutStats(workout);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-safe pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center pt-10 text-center">
        <div className="flex size-20 animate-pop items-center justify-center rounded-[28px] bg-accent text-on-accent shadow-[0_0_60px_-10px_var(--color-accent)]">
          <Trophy className="size-10" strokeWidth={2.2} aria-hidden />
        </div>
        <p className="mt-5 text-sm font-semibold tracking-wider text-accent-ink uppercase">Workout complete</p>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight">{workout.name}</h1>
        <p className="mt-1 text-muted">{fmtDay(workout.startedAt, user.timezone)}</p>
      </div>

      <dl className="mt-8 grid grid-cols-3 gap-2 text-center">
        {[
          { k: 'Duration', v: fmtDuration(stats.durationSec) },
          { k: 'Sets', v: String(stats.sets) },
          { k: 'Volume', v: fmtVolume(stats.volumeKg, user.unit) },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-line/60 bg-surface p-3">
            <dt className="text-xs text-muted">{x.k}</dt>
            <dd className="mt-1 text-lg leading-tight font-extrabold">{x.v}</dd>
          </div>
        ))}
      </dl>

      {queued && (
        <p className="mt-4 flex items-start gap-3 rounded-2xl bg-info-soft px-4 py-3 text-sm text-info">
          <CloudUpload className="mt-0.5 size-5 shrink-0" aria-hidden />
          Saved on this device. It’ll sync automatically when you’re back online — PRs show up then.
        </p>
      )}

      {prs.length > 0 && (
        <section
          className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-accent-ink/40 bg-[radial-gradient(120%_120%_at_0%_0%,var(--color-accent-soft),transparent_60%)] p-4"
          aria-label="Personal records"
        >
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Trophy className="size-5 text-accent-ink" aria-hidden />
            {prs.length === 1 ? 'New personal record!' : `${prs.length} new personal records!`}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {prs.map((pr, i) => {
              const d = describePR(pr, user.unit);
              return (
                <li key={i} className="flex animate-pop items-center justify-between gap-3 rounded-2xl bg-surface/80 px-3 py-2.5" style={{ animationDelay: `${120 + i * 80}ms`, animationFillMode: 'both' }}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{lookup.name(pr.exerciseId)}</p>
                    <p className="text-xs text-muted">{d.label}</p>
                  </div>
                  <span className="shrink-0 font-extrabold text-accent-ink">{d.value}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 className="mt-8 mb-2 text-[13px] font-semibold tracking-wider text-muted uppercase">{plural(stats.exercises, 'exercise')}</h2>
      <WorkoutSetsList workout={workout} unit={user.unit} />

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button variant="primary" size="lg" block onClick={() => navigate('/', { replace: true })}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
