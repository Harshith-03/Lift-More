import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, Dumbbell, Plus, Trash2, WifiOff, X } from 'lucide-react';
import type { Exercise, ExerciseSession, ExerciseSuggestion, User } from '../../../../shared/types';
import { kgToUnit, suggestNext } from '../../../../shared/engine';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup } from '../../lib/queries';
import { useNow, useOnline } from '../../lib/hooks';
import { fmtClock, fmtDay, fmtTime, inputToKg, roundTo } from '../../lib/format';
import { uuid } from '../../lib/storage';
import { unlockAudio } from '../../lib/alerts';
import { Button, TextAreaField, TextField } from '../../components/ui';
import { NumericInput } from '../../components/NumericInput';
import { useConfirm } from '../../components/feedback';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ExercisePickerSheet } from '../exercises/ExercisePickerSheet';
import { defaultItemFor, newExerciseBlock } from './draftFactory';
import { countSets, type DraftAction, type WorkoutDraft } from './draftReducer';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseMenuSheet, NotesSheet, PlateSheet, RestSheet, SwapSheet, WarmupSheet, type ExerciseSheetKind } from './ExerciseSheets';
import { usePreviousSessions } from './previous';
import { RestTimerBar } from './RestTimerBar';

type SheetState = { kind: ExerciseSheetKind | 'swapPicker'; key: string } | { kind: 'picker' } | null;

function adHocSuggestion(exercise: Exercise | undefined, item: { sets: number; repMin: number; repMax: number }, last: ExerciseSession | null, user: User): ExerciseSuggestion | null {
  if (!exercise || !last) return null;
  try {
    return suggestNext({ exercise, item, history: [last], profile: user });
  } catch {
    return null; // optional enhancement: fall back to copying last session
  }
}

export interface WorkoutLoggerProps {
  draft: WorkoutDraft;
  dispatch: (a: DraftAction) => void;
  user: User;
  onFinish: () => void;
  onExit: () => void;
  onDiscard?: () => void;
  saving?: boolean;
}

export function WorkoutLogger({ draft, dispatch, user, onFinish, onExit, onDiscard, saving }: WorkoutLoggerProps) {
  const live = draft.mode === 'live';
  const qc = useQueryClient();
  const lookup = useExerciseLookup();
  const confirm = useConfirm();
  const online = useOnline();
  const now = useNow(1000, live);
  const [sheet, setSheet] = useState<SheetState>(null);
  const close = useCallback(() => setSheet(null), []);

  const exerciseIds = useMemo(() => draft.exercises.map((e) => e.exerciseId), [draft.exercises]);
  const previous = usePreviousSessions(exerciseIds, draft.id);
  const counts = countSets(draft);
  const elapsed = (now - new Date(draft.startedAt).getTime()) / 1000;

  const activeBlock = sheet && 'key' in sheet ? draft.exercises.find((e) => e.key === sheet.key) : undefined;
  const activeIndex = activeBlock ? draft.exercises.indexOf(activeBlock) : -1;
  const activeExercise = activeBlock ? lookup.get(activeBlock.exerciseId) : undefined;

  const onMenu = useCallback((key: string) => setSheet({ kind: 'menu', key }), []);
  const onEditNotes = useCallback((key: string) => setSheet({ kind: 'notes', key }), []);
  const onSetCompleted = useCallback(() => unlockAudio(), []);

  const addExercises = (ids: string[]) => {
    setSheet(null);
    for (const id of ids) {
      const exercise = lookup.get(id);
      const item = defaultItemFor(exercise, user.goal, user.defaultRestSec);
      const cached = qc.getQueryData<ExerciseSession | null>(qk.historyLast(id));
      const block = newExerciseBlock({
        exerciseId: id,
        exercise,
        item,
        last: cached ?? null,
        suggestion: adHocSuggestion(exercise, item, cached ?? null, user),
        newId: uuid,
      });
      dispatch({ type: 'addExercise', exercise: block });
      if (cached === undefined && navigator.onLine) {
        // fill it in once last session's numbers arrive (ignored if the user already typed)
        void qc
          .fetchQuery({ queryKey: qk.historyLast(id), queryFn: () => api.lastSessions([id]).then((r) => r[id] ?? null), staleTime: 60_000 })
          .then((last) => {
            if (!last) return;
            const filled = newExerciseBlock({ exerciseId: id, exercise, item, last, suggestion: adHocSuggestion(exercise, item, last, user), newId: uuid });
            dispatch({ type: 'prefillExercise', key: block.key, sets: filled.sets, hint: filled.hint });
          })
          .catch(() => undefined);
      }
    }
    window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  };

  const removeExercise = async (key: string) => {
    const block = draft.exercises.find((e) => e.key === key);
    if (!block) return;
    setSheet(null);
    if (block.sets.some((s) => s.completed)) {
      const ok = await confirm({
        title: `Remove ${lookup.name(block.exerciseId)}?`,
        message: 'Its logged sets will be removed from this workout.',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
    }
    dispatch({ type: 'removeExercise', key });
  };

  return (
    <div className={clsx('min-h-dvh', live && draft.rest ? 'pb-36' : 'pb-10')}>
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-lg items-center gap-2 px-2">
          <button
            type="button"
            onClick={onExit}
            aria-label={live ? 'Minimise workout' : 'Cancel editing'}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2"
          >
            {live ? <ChevronDown className="size-6" aria-hidden /> : <X className="size-6" aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] leading-tight font-bold">{draft.name || 'Workout'}</h1>
            <p className="flex items-center gap-2 text-sm text-muted tabular-nums">
              {live ? (
                <span className="font-semibold text-accent-ink" aria-label="Elapsed time">
                  {fmtClock(elapsed)}
                </span>
              ) : (
                <span>
                  {fmtDay(draft.startedAt, user.timezone)} · {fmtTime(draft.startedAt, user.timezone)}
                </span>
              )}
              <span>
                · {counts.completed}/{counts.total} sets
              </span>
              {!online && <WifiOff className="size-3.5 text-warn" aria-label="Offline" />}
            </p>
          </div>
          <Button variant="primary" size="sm" className="min-w-20 rounded-2xl" onClick={onFinish} loading={saving}>
            {live ? 'Finish' : 'Save'}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-3 pt-3">
        {draft.exercises.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
            <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <Dumbbell className="size-7" aria-hidden />
            </div>
            <p className="text-lg font-bold">Empty workout</p>
            <p className="mt-1 text-sm text-muted">Add exercises as you go — your last numbers show up automatically.</p>
            <Button variant="primary" size="lg" className="mt-5" icon={<Plus className="size-5" aria-hidden />} onClick={() => setSheet({ kind: 'picker' })}>
              Add exercise
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {draft.exercises.map((block) => (
              <ErrorBoundary key={block.key} compact>
                <ExerciseCard
                  block={block}
                  exercise={lookup.get(block.exerciseId)}
                  name={lookup.name(block.exerciseId)}
                  unit={user.unit}
                  previous={previous.get(block.exerciseId)}
                  defaultRestSec={user.defaultRestSec}
                  live={live}
                  dispatch={dispatch}
                  onMenu={onMenu}
                  onEditNotes={onEditNotes}
                  onSetCompleted={onSetCompleted}
                />
              </ErrorBoundary>
            ))}
            <button
              type="button"
              onClick={() => setSheet({ kind: 'picker' })}
              className="flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line font-semibold text-accent-ink active:bg-surface"
            >
              <Plus className="size-5" strokeWidth={2.5} aria-hidden /> Add exercise
            </button>
          </div>
        )}

        {/* Workout details */}
        <section className="mt-6 flex flex-col gap-4 rounded-[var(--radius-card)] border border-line/60 bg-surface p-4" aria-label="Workout details">
          <TextField label="Workout name" value={draft.name} onChange={(e) => dispatch({ type: 'setMeta', patch: { name: e.target.value } })} maxLength={80} />
          <TextAreaField
            label="Workout notes"
            value={draft.notes}
            onChange={(e) => dispatch({ type: 'setMeta', patch: { notes: e.target.value } })}
            placeholder="How did it feel? Sleep, energy, pain…"
            maxLength={1000}
            rows={3}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bw-input" className="text-sm font-medium text-muted">
              Bodyweight today ({user.unit}, optional)
            </label>
            <NumericInput
              id="bw-input"
              decimal
              value={draft.bodyweightKg == null ? null : roundTo(kgToUnit(draft.bodyweightKg, user.unit), 1)}
              onValueChange={(v) => dispatch({ type: 'setMeta', patch: { bodyweightKg: inputToKg(v, user.unit) } })}
              placeholder="—"
              maxDecimals={1}
              className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-[16px] font-semibold outline-none focus:border-accent-ink"
            />
          </div>
        </section>

        {onDiscard && (
          <Button variant="ghost" block className="mt-4 text-danger" icon={<Trash2 className="size-5" aria-hidden />} onClick={onDiscard}>
            Discard workout
          </Button>
        )}
      </main>

      {live && <RestTimerBar rest={draft.rest} dispatch={dispatch} />}

      {/* Sheets */}
      <ExercisePickerSheet
        open={sheet?.kind === 'picker'}
        onClose={close}
        multi
        presentIds={exerciseIds}
        onPick={addExercises}
      />
      {activeBlock && sheet && (
        <>
          <ExerciseMenuSheet
            open={sheet.kind === 'menu'}
            onClose={close}
            name={lookup.name(activeBlock.exerciseId)}
            exercise={activeExercise}
            index={activeIndex}
            count={draft.exercises.length}
            restSec={activeBlock.restSec || user.defaultRestSec}
            onSelect={(kind) => setSheet({ kind, key: activeBlock.key })}
            onMove={(delta) => dispatch({ type: 'moveExercise', key: activeBlock.key, delta })}
            onRemove={() => void removeExercise(activeBlock.key)}
          />
          <SwapSheet
            open={sheet.kind === 'swap'}
            onClose={close}
            exerciseId={activeBlock.exerciseId}
            name={lookup.name(activeBlock.exerciseId)}
            custom={lookup.custom}
            onPick={(id) => {
              dispatch({ type: 'swapExercise', key: activeBlock.key, exerciseId: id });
              close();
            }}
            onBrowse={() => setSheet({ kind: 'swapPicker', key: activeBlock.key })}
          />
          <ExercisePickerSheet
            open={sheet.kind === 'swapPicker'}
            onClose={close}
            title="Swap with…"
            onPick={([id]) => {
              if (id) dispatch({ type: 'swapExercise', key: activeBlock.key, exerciseId: id });
              close();
            }}
          />
          {sheet.kind === 'warmup' && (
            <WarmupSheet
              open
              onClose={close}
              block={activeBlock}
              exercise={activeExercise}
              unit={user.unit}
              barKg={user.barWeightKg}
              onAdd={(sets) => {
                dispatch({ type: 'addWarmups', key: activeBlock.key, sets });
                close();
              }}
            />
          )}
          {sheet.kind === 'plates' && <PlateSheet open onClose={close} block={activeBlock} unit={user.unit} barKg={user.barWeightKg} />}
          {sheet.kind === 'notes' && (
            <NotesSheet open onClose={close} initial={activeBlock.notes} onSave={(notes) => dispatch({ type: 'setExerciseNotes', key: activeBlock.key, notes })} />
          )}
          <RestSheet
            open={sheet.kind === 'rest'}
            onClose={close}
            value={activeBlock.restSec || user.defaultRestSec}
            onPick={(sec) => {
              dispatch({ type: 'setExerciseRest', key: activeBlock.key, restSec: sec });
              close();
            }}
          />
        </>
      )}
    </div>
  );
}
