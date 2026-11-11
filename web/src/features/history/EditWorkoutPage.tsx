import { useReducer, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Workout } from '../../../../shared/types';
import { useRoutines, useUser, useWorkout } from '../../lib/queries';
import { errorMessage } from '../../lib/api';
import { Skeleton } from '../../components/ui';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { useConfirm, useToast } from '../../components/feedback';
import { buildWorkoutPayload, draftFromWorkout, draftReducer, type DraftAction, type WorkoutDraft } from '../workout/draftReducer';
import { saveWorkout } from '../workout/finish';
import { WorkoutLogger } from '../workout/WorkoutLogger';

function Editor({ workout }: { workout: Workout }) {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: routines } = useRoutines();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, rawDispatch] = useReducer(
    draftReducer,
    workout,
    (w): WorkoutDraft =>
      draftFromWorkout(w, {
        userId: user.id,
        mode: 'edit',
        restFor: (exId) => routines?.flatMap((r) => r.items).find((i) => i.exerciseId === exId)?.restSec ?? user.defaultRestSec,
      }),
  );
  const dispatch = (a: DraftAction) => {
    setDirty(true);
    rawDispatch(a);
  };

  const save = async () => {
    const payload = buildWorkoutPayload(draft);
    if (payload.sets.length === 0) {
      toast.error('A workout needs at least one set. Delete it from the detail screen instead.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveWorkout(payload, user.id);
      toast.success(res.queued ? 'Saved on this device — it’ll sync when you’re online' : 'Workout updated');
      navigate(`/history/${workout.id}`, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save changes'));
    } finally {
      setSaving(false);
    }
  };

  const exit = async () => {
    if (dirty) {
      const ok = await confirm({ title: 'Discard changes?', message: 'Your edits to this workout won’t be saved.', confirmLabel: 'Discard', tone: 'danger', cancelLabel: 'Keep editing' });
      if (!ok) return;
    }
    navigate(-1);
  };

  return <WorkoutLogger draft={draft} dispatch={dispatch} user={user} onFinish={() => void save()} onExit={() => void exit()} saving={saving} />;
}

export function EditWorkoutPage() {
  const { id } = useParams();
  const { data: workout, isPending, error, refetch } = useWorkout(id);
  if (workout) return <Editor key={workout.id} workout={workout} />;
  if (isPending)
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top)+5rem)]" aria-busy="true">
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
      </div>
    );
  return (
    <div className="mx-auto max-w-lg px-4 pt-safe">
      <ErrorPanel error={error ?? new Error('Workout not found')} onRetry={() => void refetch()} />
    </div>
  );
}
