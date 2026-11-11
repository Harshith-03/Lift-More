import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Calculator, Flame, Repeat, StickyNote, Timer, Trash2 } from 'lucide-react';
import type { Exercise, Unit } from '../../../../shared/types';
import { alternativesFor, generateWarmups, kgToUnit, platesPerSide } from '../../../../shared/engine';
import { Sheet } from '../../components/Sheet';
import { Button, Chip, ListButton, TextAreaField } from '../../components/ui';
import { NumericInput } from '../../components/NumericInput';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { equipmentLabel, fmtRest, fmtWeight, inputToKg, muscleLabel, roundTo, weightNumber } from '../../lib/format';
import { uuid } from '../../lib/storage';
import type { DraftExercise, DraftSet } from './draftReducer';

export type ExerciseSheetKind = 'menu' | 'swap' | 'warmup' | 'plates' | 'notes' | 'rest';

const BARBELL_LIKE = new Set(['barbell', 'smith', 'ez_bar']);

/** First working weight that's entered (used as default for warm-ups / plate math). */
export function workingWeightOf(block: DraftExercise): number | null {
  const s = block.sets.find((x) => x.kind !== 'warmup' && !x.completed && x.weightKg) ?? block.sets.find((x) => x.kind !== 'warmup' && x.weightKg);
  return s?.weightKg ?? null;
}

// ───────────── menu ─────────────

export function ExerciseMenuSheet({
  open,
  onClose,
  name,
  exercise,
  index,
  count,
  restSec,
  onSelect,
  onMove,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  exercise: Exercise | undefined;
  index: number;
  count: number;
  restSec: number;
  onSelect: (k: ExerciseSheetKind) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const weighted = !exercise || exercise.trackingType === 'weight_reps';
  const barbell = !exercise || BARBELL_LIKE.has(exercise.equipment);
  return (
    <Sheet open={open} onClose={onClose} title={name} description={exercise ? `${muscleLabel(exercise.primaryMuscle)} · ${equipmentLabel(exercise.equipment)}${exercise.cue ? ` — ${exercise.cue}` : ''}` : undefined}>
      <div className="-mx-2 flex flex-col">
        <ListButton icon={<Repeat className="size-5" />} label="Swap exercise" description="Pick an alternative for the same muscle" onClick={() => onSelect('swap')} />
        {weighted && (
          <ListButton icon={<Flame className="size-5" />} label="Warm-up sets" description="Generate a ramp to your working weight" onClick={() => onSelect('warmup')} />
        )}
        {weighted && barbell && (
          <ListButton icon={<Calculator className="size-5" />} label="Plate calculator" description="What to load on each side" onClick={() => onSelect('plates')} />
        )}
        <ListButton icon={<StickyNote className="size-5" />} label="Notes" description="Seat height, grip, cues…" onClick={() => onSelect('notes')} />
        <ListButton icon={<Timer className="size-5" />} label="Rest timer" description={fmtRest(restSec)} onClick={() => onSelect('rest')} />
        <div className="grid grid-cols-2 gap-2 px-2 py-2">
          <Button variant="secondary" icon={<ArrowUp className="size-5" aria-hidden />} disabled={index === 0} onClick={() => onMove(-1)}>
            Move up
          </Button>
          <Button variant="secondary" icon={<ArrowDown className="size-5" aria-hidden />} disabled={index >= count - 1} onClick={() => onMove(1)}>
            Move down
          </Button>
        </div>
        <ListButton tone="danger" icon={<Trash2 className="size-5" />} label="Remove exercise" onClick={onRemove} />
      </div>
    </Sheet>
  );
}

// ───────────── swap ─────────────

function Alternatives({ exerciseId, custom, onPick }: { exerciseId: string; custom: Exercise[]; onPick: (id: string) => void }) {
  const alts = useMemo(() => alternativesFor(exerciseId, custom, 8), [exerciseId, custom]);
  if (alts.length === 0) return <p className="py-6 text-center text-sm text-muted">No close alternatives — browse the full library below.</p>;
  return (
    <ul className="-mx-2">
      {alts.map((ex, i) => (
        <li key={ex.id}>
          <ListButton
            label={ex.name}
            description={`${muscleLabel(ex.primaryMuscle)} · ${equipmentLabel(ex.equipment)}${i === 0 ? ' · best match' : ''}`}
            onClick={() => onPick(ex.id)}
          />
        </li>
      ))}
    </ul>
  );
}

export function SwapSheet({
  open,
  onClose,
  exerciseId,
  name,
  custom,
  onPick,
  onBrowse,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  name: string;
  custom: Exercise[];
  onPick: (id: string) => void;
  onBrowse: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Swap exercise"
      description={`Alternatives for ${name}. Your sets and reps are kept.`}
      footer={
        <Button variant="secondary" block onClick={onBrowse}>
          Browse all exercises
        </Button>
      }
    >
      <ErrorBoundary compact>
        <Alternatives exerciseId={exerciseId} custom={custom} onPick={onPick} />
      </ErrorBoundary>
    </Sheet>
  );
}

// ───────────── warm-ups ─────────────

function WarmupList({ weightKg, exercise, unit, barKg }: { weightKg: number; exercise: Exercise; unit: Unit; barKg: number }) {
  const ramp = useMemo(() => generateWarmups(weightKg, exercise, unit, barKg), [weightKg, exercise, unit, barKg]);
  if (ramp.length === 0) return <p className="py-4 text-center text-sm text-muted">No warm-up needed at this weight — go straight to your working sets.</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {ramp.map((w, i) => (
        <li key={i} className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-2 px-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-warn-soft text-xs font-bold text-warn">W{i + 1}</span>
          <span className="flex-1 font-semibold">{fmtWeight(w.weightKg, unit)}</span>
          <span className="text-muted">× {w.reps}</span>
        </li>
      ))}
    </ol>
  );
}

export function WarmupSheet({
  open,
  onClose,
  block,
  exercise,
  unit,
  barKg,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  block: DraftExercise;
  exercise: Exercise | undefined;
  unit: Unit;
  barKg: number;
  onAdd: (sets: DraftSet[]) => void;
}) {
  const initial = workingWeightOf(block);
  const [value, setValue] = useState<number | null>(initial == null ? null : roundTo(kgToUnit(initial, unit), 2));
  const weightKg = inputToKg(value, unit);

  const add = () => {
    if (!exercise || weightKg == null) return;
    const ramp = generateWarmups(weightKg, exercise, unit, barKg);
    onAdd(
      ramp.map((w) => ({ id: uuid(), kind: 'warmup', weightKg: w.weightKg, reps: w.reps, durationSec: null, rpe: null, completed: false })),
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Warm-up sets"
      description="A quick ramp up to your first working set."
      footer={
        <Button variant="primary" size="lg" block disabled={!exercise || weightKg == null} onClick={add}>
          Add warm-ups to this exercise
        </Button>
      }
    >
      <label className="mb-1.5 block text-sm font-medium text-muted" htmlFor="warmup-weight">
        Working weight ({unit})
      </label>
      <NumericInput
        id="warmup-weight"
        decimal
        value={value}
        onValueChange={setValue}
        placeholder={unit}
        className="mb-4 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-2xl font-bold outline-none focus:border-accent-ink"
      />
      {exercise && weightKg != null && weightKg > 0 ? (
        <ErrorBoundary compact>
          <WarmupList weightKg={weightKg} exercise={exercise} unit={unit} barKg={barKg} />
        </ErrorBoundary>
      ) : (
        <p className="py-4 text-center text-sm text-muted">Enter your working weight to see the ramp.</p>
      )}
    </Sheet>
  );
}

// ───────────── plate calculator ─────────────

const PLATE_COLORS: Record<string, string> = {
  // kg (IWF-ish colours) / lb share by size
  '25': '#e5484d',
  '20': '#3e63dd',
  '15': '#f5d90a',
  '10': '#30a46c',
  '5': '#f1f1f1',
  '2.5': '#e5484d',
  '1.25': '#9ba1a6',
  '45': '#3e63dd',
  '35': '#f5d90a',
};

function PlateVisual({ totalKg, unit, barKg }: { totalKg: number; unit: Unit; barKg: number }) {
  const r = useMemo(() => platesPerSide(totalKg, unit, barKg), [totalKg, unit, barKg]);
  const max = unit === 'kg' ? 25 : 45;
  return (
    <div>
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-surface-2 px-2" aria-hidden>
        <div className="h-3 w-10 rounded-l bg-faint" />
        <div className="h-8 w-2 bg-muted" />
        {r.plates.map((p, i) => {
          const h = 36 + (p / max) * 84;
          return (
            <div
              key={i}
              className="mx-px rounded-sm border border-black/30"
              style={{ height: `${h}px`, width: p >= max * 0.5 ? 16 : 11, background: PLATE_COLORS[String(p)] ?? '#9ba1a6' }}
            />
          );
        })}
        <div className="h-3 w-6 rounded-r bg-faint" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-muted">Each side</dt>
          <dd className="mt-0.5 text-base font-bold">{r.plates.length ? r.plates.map((p) => roundTo(p, 2)).join(' + ') : 'Empty bar'}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-muted">Bar</dt>
          <dd className="mt-0.5 text-base font-bold">
            {roundTo(r.barInUnit, 2)} {unit}
          </dd>
        </div>
      </dl>
      {r.remainderInUnit > 0.001 && (
        <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
          Can’t load exactly — {roundTo(r.remainderInUnit, 2)} {unit} per side left over with standard plates.
        </p>
      )}
    </div>
  );
}

export function PlateSheet({ open, onClose, block, unit, barKg }: { open: boolean; onClose: () => void; block: DraftExercise; unit: Unit; barKg: number }) {
  const initial = workingWeightOf(block);
  const [value, setValue] = useState<number | null>(initial == null ? null : roundTo(kgToUnit(initial, unit), 2));
  const totalKg = inputToKg(value, unit);
  return (
    <Sheet open={open} onClose={onClose} title="Plate calculator" description={`Bar: ${weightNumber(barKg, unit)} ${unit} (change it in Profile).`}>
      <label className="mb-1.5 block text-sm font-medium text-muted" htmlFor="plate-total">
        Total weight ({unit})
      </label>
      <NumericInput
        id="plate-total"
        decimal
        value={value}
        onValueChange={setValue}
        placeholder={unit}
        className="mb-4 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-2xl font-bold outline-none focus:border-accent-ink"
      />
      {totalKg != null && totalKg > 0 ? (
        <ErrorBoundary compact>
          <PlateVisual totalKg={totalKg} unit={unit} barKg={barKg} />
        </ErrorBoundary>
      ) : (
        <p className="py-4 text-center text-sm text-muted">Enter a weight to see the plates.</p>
      )}
    </Sheet>
  );
}

// ───────────── notes / rest ─────────────

export function NotesSheet({ open, onClose, initial, onSave, title = 'Exercise notes' }: { open: boolean; onClose: () => void; initial: string; onSave: (v: string) => void; title?: string }) {
  const [text, setText] = useState(initial);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            onSave(text.trim());
            onClose();
          }}
        >
          Save notes
        </Button>
      }
    >
      <TextAreaField label="Notes" hideLabel value={text} onChange={(e) => setText(e.target.value)} placeholder="Seat at 4, close grip, slow eccentric…" maxLength={500} data-autofocus rows={4} />
    </Sheet>
  );
}

const REST_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

export function RestSheet({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: number; onPick: (sec: number) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Rest timer" description="Starts automatically when you tick a set.">
      <div className="grid grid-cols-3 gap-2 pb-2">
        {REST_OPTIONS.map((s) => (
          <Chip key={s} selected={s === value} onClick={() => onPick(s)} className="justify-center">
            {fmtRest(s)}
          </Chip>
        ))}
      </div>
    </Sheet>
  );
}
