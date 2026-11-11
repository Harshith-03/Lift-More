import { memo, useCallback } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Check, Ellipsis, Minus, Pause, Plus, Sparkles, StickyNote, Timer, TrendingUp } from 'lucide-react';
import type { Exercise, ExerciseSession, ProgressionAction, Unit } from '../../../../shared/types';
import { equipmentLabel, fmtRest, muscleLabel } from '../../lib/format';
import { uuid } from '../../lib/storage';
import { matchPrevious } from './previous';
import { SET_GRID, SetRow } from './SetRow';
import type { DraftAction, DraftExercise, DraftSet, SetPatch } from './draftReducer';

const HINT_ICON: Record<ProgressionAction, typeof TrendingUp> = {
  increase_weight: ArrowUpRight,
  increase_reps: Plus,
  increase_duration: Plus,
  hold: Pause,
  deload: ArrowDownRight,
  start: Sparkles,
};

export interface ExerciseCardProps {
  block: DraftExercise;
  exercise: Exercise | undefined;
  name: string;
  unit: Unit;
  previous: ExerciseSession | null | undefined;
  defaultRestSec: number;
  live: boolean;
  dispatch: (a: DraftAction) => void;
  onMenu: (key: string) => void;
  onEditNotes: (key: string) => void;
  onSetCompleted: () => void;
}

export const ExerciseCard = memo(function ExerciseCard({
  block,
  exercise,
  name,
  unit,
  previous,
  defaultRestSec,
  live,
  dispatch,
  onMenu,
  onEditNotes,
  onSetCompleted,
}: ExerciseCardProps) {
  const tracking = exercise?.trackingType ?? 'weight_reps';
  const prev = matchPrevious(previous, block.sets);
  const doneCount = block.sets.filter((s) => s.completed).length;
  const allDone = block.sets.length > 0 && doneCount === block.sets.length;
  const key = block.key;

  const onChange = useCallback((setId: string, patch: SetPatch) => dispatch({ type: 'updateSet', key, setId, patch }), [dispatch, key]);
  const onCycleKind = useCallback((setId: string) => dispatch({ type: 'cycleKind', key, setId }), [dispatch, key]);
  const onToggle = useCallback(
    (set: DraftSet, fill: SetPatch | null) => {
      if (fill) dispatch({ type: 'updateSet', key, setId: set.id, patch: fill });
      dispatch({ type: 'toggleComplete', key, setId: set.id, now: Date.now(), defaultRestSec });
      if (!set.completed) onSetCompleted();
    },
    [dispatch, key, defaultRestSec, onSetCompleted],
  );

  const targetFor = (s: DraftSet) => (s.kind === 'warmup' ? null : block.repMin);
  const HintIcon = block.hint ? HINT_ICON[block.hint.action] : null;
  let working = 0;

  return (
    <article
      className={clsx('rounded-[var(--radius-card)] border bg-surface p-2 transition-colors min-[380px]:p-2.5', allDone ? 'border-accent-ink/40' : 'border-line/60')}
      aria-label={name}
    >
      <header className="flex items-start gap-2 pl-1.5">
        <div className="min-w-0 flex-1 pt-1.5">
          <h3 className="flex items-center gap-2 text-[17px] leading-snug font-bold">
            <span className="truncate">{name}</span>
            {allDone && <Check className="size-4 shrink-0 text-accent-ink" strokeWidth={3} aria-label="All sets done" />}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
            {exercise && (
              <span>
                {muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.equipment)}
              </span>
            )}
            {block.repMin != null && block.repMax != null && (
              <span>
                · {block.repMin === block.repMax ? block.repMin : `${block.repMin}–${block.repMax}`} {tracking === 'duration' ? 's' : 'reps'}
              </span>
            )}
            {live && (
              <span className="inline-flex items-center gap-0.5">
                · <Timer className="size-3.5" aria-hidden /> {fmtRest(block.restSec || defaultRestSec)}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onMenu(key)}
          aria-label={`${name} options`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2"
        >
          <Ellipsis className="size-6" aria-hidden />
        </button>
      </header>

      {block.hint && HintIcon && (
        <p className="mx-1.5 mt-1.5 flex items-start gap-1.5 rounded-xl bg-surface-2/70 px-2.5 py-2 text-[13px] leading-snug text-muted">
          <HintIcon className={clsx('mt-px size-4 shrink-0', block.hint.action === 'deload' ? 'text-warn' : 'text-accent-ink')} aria-hidden />
          <span>{block.hint.reason}</span>
        </p>
      )}

      {block.notes && (
        <button
          type="button"
          onClick={() => onEditNotes(key)}
          className="mx-1.5 mt-1.5 flex w-[calc(100%-0.75rem)] items-start gap-1.5 rounded-xl px-1 py-1 text-left text-[13px] text-ink/80 italic active:bg-surface-2"
        >
          <StickyNote className="mt-px size-4 shrink-0 text-faint not-italic" aria-hidden />
          <span className="line-clamp-3">{block.notes}</span>
        </button>
      )}

      <div className={clsx(SET_GRID, 'mt-2 px-0.5 text-center text-[11px] font-semibold tracking-wide text-faint uppercase')} aria-hidden>
        <span>Set</span>
        <span>Previous</span>
        <span>{tracking === 'weight_reps' ? unit : `+${unit}`}</span>
        <span>{tracking === 'duration' ? 'Sec' : 'Reps'}</span>
        <span>RPE</span>
        <span className="flex justify-center">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </div>

      <div className="mt-0.5 flex flex-col gap-0.5">
        {block.sets.map((s, i) => {
          if (s.kind !== 'warmup') working++;
          return (
            <SetRow
              key={s.id}
              set={s}
              index={i}
              workingIndex={working}
              tracking={tracking}
              unit={unit}
              previous={prev[i] ?? null}
              targetReps={targetFor(s)}
              exerciseName={name}
              onChange={onChange}
              onCycleKind={onCycleKind}
              onToggle={onToggle}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => dispatch({ type: 'addSet', key, id: uuid() })}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-sm font-semibold active:bg-surface-3"
        >
          <Plus className="size-4" strokeWidth={2.5} aria-hidden /> Add set
        </button>
        <button
          type="button"
          disabled={block.sets.length === 0}
          onClick={() => {
            const last = block.sets[block.sets.length - 1];
            if (last) dispatch({ type: 'removeSet', key, setId: last.id });
          }}
          aria-label={`Remove last set of ${name}`}
          className="flex min-h-11 w-14 items-center justify-center rounded-xl bg-surface-2 text-muted active:bg-surface-3 disabled:opacity-40"
        >
          <Minus className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </article>
  );
});
