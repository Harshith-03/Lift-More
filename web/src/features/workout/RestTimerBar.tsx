import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { useNow } from '../../lib/hooks';
import { fmtClock } from '../../lib/format';
import { restDoneAlert } from '../../lib/alerts';
import type { DraftAction, RestTimer } from './draftReducer';

/** Persistent bottom bar while resting: countdown, ±15 s, skip. Beeps + vibrates at 0. */
export function RestTimerBar({ rest, dispatch }: { rest: RestTimer | null; dispatch: (a: DraftAction) => void }) {
  const now = useNow(250, !!rest);
  const firedFor = useRef<number | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  const remainingMs = rest ? rest.endsAt - now : 0;

  useEffect(() => {
    if (!rest || remainingMs > 0 || firedFor.current === rest.endsAt) return;
    const endsAt = rest.endsAt;
    firedFor.current = endsAt;
    // Only alert if we're close to the actual end (not when reopening the app long after).
    const fresh = remainingMs > -5000;
    if (fresh) restDoneAlert();
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => dispatch({ type: 'restClear', ifEndsAt: endsAt }), fresh ? 1500 : 0);
  }, [rest, remainingMs, dispatch]);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  if (!rest) return null;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const progress = Math.min(1, Math.max(0, remainingMs / (rest.totalSec * 1000)));
  const done = remaining === 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="timer" aria-live="off">
      <div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-line bg-surface-2/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="h-1 bg-surface-3">
          <div
            className="h-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2 p-2 pl-4">
          <Timer className={done ? 'size-5 text-accent-ink' : 'size-5 text-muted'} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{done ? 'Rest done' : 'Rest'}</p>
            <p className="text-2xl leading-none font-extrabold tabular-nums" aria-label={`${remaining} seconds of rest left`}>
              {done ? 'Go!' : fmtClock(remaining)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'restAdjust', now: Date.now(), deltaSec: -15 })}
            className="flex h-12 min-w-14 items-center justify-center rounded-2xl bg-surface-3 px-3 text-sm font-bold active:brightness-110"
            aria-label="Subtract 15 seconds"
          >
            −15
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'restAdjust', now: Date.now(), deltaSec: 15 })}
            className="flex h-12 min-w-14 items-center justify-center rounded-2xl bg-surface-3 px-3 text-sm font-bold active:brightness-110"
            aria-label="Add 15 seconds"
          >
            +15
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'restClear' })}
            className="flex h-12 min-w-16 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent active:brightness-95"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
