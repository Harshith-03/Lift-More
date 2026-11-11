import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useUser } from '../../lib/queries';
import { useWakeLock } from '../../lib/hooks';
import { errorMessage } from '../../lib/api';
import { fmtDuration, fmtVolume, plural } from '../../lib/format';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { useConfirm, useToast } from '../../components/feedback';
import { buildWorkoutPayload, countSets, draftReducer, draftVolumeKg } from './draftReducer';
import { draftStore, useDraftDispatch, useLiveDraft } from './draftStore';
import { rememberSummary, saveWorkout } from './finish';
import { WorkoutLogger } from './WorkoutLogger';

export function ActiveWorkoutPage() {
  const user = useUser();
  const draft = useLiveDraft(user.id);
  const dispatch = useDraftDispatch();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [finishing, setFinishing] = useState(false);
  const [saving, setSaving] = useState(false);
  // set while we navigate away ourselves, so clearing the draft doesn't trigger the "no draft" redirect
  const leaving = useRef(false);

  useWakeLock(!!draft);

  if (!draft) return leaving.current ? null : <Navigate to="/" replace />;

  const counts = countSets(draft);
  const durationSec = (Date.now() - new Date(draft.startedAt).getTime()) / 1000;

  const finish = async (mode: 'keep' | 'completeAll' | 'dropUnticked') => {
    setSaving(true);
    try {
      const base = mode === 'completeAll' ? draftReducer(draft, { type: 'completeAllFilled' }) : draft;
      const payload = buildWorkoutPayload(base, { endedAt: new Date().toISOString(), dropIncomplete: mode === 'dropUnticked' });
      if (payload.sets.length === 0) {
        toast.error('Log at least one set before finishing — or discard the workout.');
        return;
      }
      const result = await saveWorkout(payload, user.id);
      rememberSummary(result);
      leaving.current = true;
      navigate('/workout/summary', { replace: true, state: result });
      draftStore.clear();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the workout'));
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    const ok = await confirm({
      title: 'Discard this workout?',
      message: counts.completed ? `${plural(counts.completed, 'logged set')} will be lost. This can’t be undone.` : 'Nothing will be saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep logging',
      tone: 'danger',
    });
    if (!ok) return;
    leaving.current = true;
    navigate('/', { replace: true });
    draftStore.clear();
  };

  return (
    <>
      <WorkoutLogger
        draft={draft}
        dispatch={dispatch}
        user={user}
        onFinish={() => setFinishing(true)}
        onExit={() => navigate('/')}
        onDiscard={() => void discard()}
        saving={saving}
      />
      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title="Finish workout?"
        footer={
          <div className="flex flex-col gap-2">
            {counts.unticked > 0 ? (
              <>
                <Button variant="primary" size="lg" block loading={saving} onClick={() => void finish('completeAll')}>
                  Mark {plural(counts.unticked, 'set')} done & finish
                </Button>
                <Button variant="secondary" size="lg" block disabled={saving} onClick={() => void finish('dropUnticked')}>
                  Discard unticked & finish
                </Button>
              </>
            ) : (
              <Button variant="primary" size="lg" block loading={saving} disabled={counts.completed === 0} onClick={() => void finish('keep')}>
                Finish & save
              </Button>
            )}
            <Button variant="ghost" block onClick={() => setFinishing(false)}>
              Keep logging
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-3 gap-2 pb-2 text-center">
          <div className="rounded-2xl bg-surface-2 p-3">
            <dt className="text-xs text-muted">Duration</dt>
            <dd className="mt-1 font-bold">{fmtDuration(durationSec)}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3">
            <dt className="text-xs text-muted">Sets done</dt>
            <dd className="mt-1 font-bold">{counts.completed}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3">
            <dt className="text-xs text-muted">Volume</dt>
            <dd className="mt-1 font-bold">{fmtVolume(draftVolumeKg(draft), user.unit)}</dd>
          </div>
        </dl>
        {counts.unticked > 0 ? (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {plural(counts.unticked, 'set has', 'sets have')} numbers but {counts.unticked === 1 ? 'isn’t' : 'aren’t'} ticked.
          </p>
        ) : counts.completed === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">No sets logged yet. Tick a set first, or discard the workout.</p>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <CircleCheck className="size-4 text-accent-ink" aria-hidden /> All logged sets are ticked. Empty sets are dropped.
          </p>
        )}
      </Sheet>
    </>
  );
}
