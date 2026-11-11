import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { invalidateTrainingData, qk } from '../../lib/queryClient';
import { useUser, useWorkout } from '../../lib/queries';
import { fmtDuration, fmtLongDate, fmtTime, fmtVolume, fmtWeight } from '../../lib/format';
import { Button, IconButton, Skeleton } from '../../components/ui';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { useConfirm, useToast } from '../../components/feedback';
import { SubHeader } from '../../components/PageHeader';
import { workoutStats } from '../workout/WorkoutSummaryPage';
import { useStartWorkout } from '../workout/useStartWorkout';
import { WorkoutSetsList } from './WorkoutSetsList';

export function WorkoutDetailPage() {
  const { id } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const start = useStartWorkout();
  const { data: workout, isPending, error, refetch } = useWorkout(id);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!workout) return;
    const ok = await confirm({
      title: 'Delete this workout?',
      message: `“${workout.name}” and all its sets will be permanently deleted. Stats and PRs are recalculated.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteWorkout(workout.id);
      qc.removeQueries({ queryKey: qk.workout(workout.id) });
      await invalidateTrainingData();
      toast.success('Workout deleted');
      navigate('/history', { replace: true });
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the workout'));
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <SubHeader
        title={workout?.name ?? 'Workout'}
        subtitle={workout ? `${fmtLongDate(workout.startedAt, user.timezone)} · ${fmtTime(workout.startedAt, user.timezone)}` : undefined}
        back="/history"
        actions={
          workout && (
            <>
              <IconButton label="Edit workout" onClick={() => navigate(`/history/${workout.id}/edit`)}>
                <Pencil className="size-5" aria-hidden />
              </IconButton>
              <IconButton label="Delete workout" tone="danger" onClick={() => void remove()} disabled={deleting}>
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </>
          )
        }
      />
      <div className="px-4 pt-4">
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 rounded-[var(--radius-card)]" />
            <Skeleton className="h-36 rounded-[var(--radius-card)]" />
            <Skeleton className="h-36 rounded-[var(--radius-card)]" />
          </div>
        ) : !workout ? (
          <ErrorPanel error={error ?? new Error('Workout not found')} onRetry={() => void refetch()} />
        ) : (
          <>
            {(() => {
              const s = workoutStats(workout);
              return (
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { k: 'Duration', v: fmtDuration(s.durationSec) },
                    { k: 'Sets', v: String(s.sets) },
                    { k: 'Volume', v: fmtVolume(s.volumeKg, user.unit) },
                  ].map((x) => (
                    <div key={x.k} className="rounded-2xl border border-line/60 bg-surface p-3">
                      <dt className="text-xs text-muted">{x.k}</dt>
                      <dd className="mt-1 leading-tight font-extrabold">{x.v}</dd>
                    </div>
                  ))}
                </dl>
              );
            })()}
            {(workout.notes || workout.bodyweightKg) && (
              <div className="mt-3 rounded-[var(--radius-card)] border border-line/60 bg-surface p-4 text-sm">
                {workout.notes && <p className="whitespace-pre-wrap">{workout.notes}</p>}
                {workout.bodyweightKg != null && <p className={workout.notes ? 'mt-2 text-muted' : 'text-muted'}>Bodyweight: {fmtWeight(workout.bodyweightKg, user.unit)}</p>}
              </div>
            )}
            <div className="mt-4">
              <WorkoutSetsList workout={workout} unit={user.unit} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="secondary" icon={<Pencil className="size-5" aria-hidden />} onClick={() => navigate(`/history/${workout.id}/edit`)}>
                Edit
              </Button>
              <Button variant="secondary" icon={<Repeat className="size-5" aria-hidden />} onClick={() => void start({ repeat: workout })}>
                Repeat
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
