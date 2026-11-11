import { CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button, IconButton } from '../../components/ui';
import { useConfirm } from '../../components/feedback';
import { useOnline } from '../../lib/hooks';
import { fmtDay, fmtTime, plural } from '../../lib/format';
import { outboxStore, syncNow, useOutbox } from './outboxStore';

/** Badge for the header: "2 pending sync". */
export function PendingSyncBadge({ userId, onClick }: { userId: string; onClick: () => void }) {
  const entries = useOutbox(userId);
  if (entries.length === 0) return null;
  const stuck = entries.some((e) => e.stuck);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${stuck ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info'}`}
      aria-label={`${plural(entries.length, 'workout')} waiting to sync`}
    >
      <CloudUpload className="size-4" aria-hidden />
      {entries.length} pending sync
    </button>
  );
}

export function SyncSheet({ open, onClose, userId, timezone }: { open: boolean; onClose: () => void; userId: string; timezone: string }) {
  const entries = useOutbox(userId);
  const online = useOnline();
  const confirm = useConfirm();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Waiting to sync"
      description={online ? 'These workouts are saved on this device and retry automatically.' : 'You’re offline. These sync automatically once you’re back online.'}
      footer={
        <Button variant="primary" block disabled={!online || entries.length === 0} icon={<RefreshCw className="size-5" aria-hidden />} onClick={() => void syncNow({ force: true })}>
          Sync now
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className="py-6 text-center text-muted">All workouts are synced.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.workout.name}</p>
                <p className="text-sm text-muted">
                  {fmtDay(e.workout.startedAt, timezone)} · {fmtTime(e.workout.startedAt, timezone)}
                  {e.attempts > 0 && ` · ${plural(e.attempts, 'attempt')}`}
                </p>
                {e.stuck && e.lastError && <p className="mt-1 text-sm text-danger">Server rejected it: {e.lastError}</p>}
              </div>
              {e.stuck && (
                <IconButton label="Retry" onClick={() => outboxStore.retry(e.id)}>
                  <RefreshCw className="size-5" aria-hidden />
                </IconButton>
              )}
              <IconButton
                label="Discard"
                tone="danger"
                onClick={async () => {
                  const ok = await confirm({ title: 'Discard this workout?', message: 'It hasn’t synced, so it will be lost for good.', confirmLabel: 'Discard', tone: 'danger' });
                  if (ok) outboxStore.discard(e.id);
                }}
              >
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
