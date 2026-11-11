import { useDeferredValue, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Plus, Search } from 'lucide-react';
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type Mechanic,
  type MuscleGroup,
  type TrackingType,
} from '../../../../shared/types';
import { searchExercises } from '../../../../shared/engine';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup } from '../../lib/queries';
import { equipmentLabel, muscleLabel } from '../../lib/format';
import { Sheet } from '../../components/Sheet';
import { Badge, Button, Chip, Segmented, SelectField, TextField } from '../../components/ui';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useToast } from '../../components/feedback';

export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (ids: string[]) => void;
  title?: string;
  /** Allow picking several at once (adding to a workout/routine). */
  multi?: boolean;
  /** Already present — shown with an "added" marker. */
  presentIds?: string[];
  confirmLabel?: (n: number) => string;
}

function ResultList({
  query,
  muscle,
  equipment,
  custom,
  selected,
  presentIds,
  onToggle,
  onCreate,
}: {
  query: string;
  muscle: MuscleGroup | null;
  equipment: Equipment | null;
  custom: Exercise[];
  selected: string[];
  presentIds: string[];
  onToggle: (ex: Exercise) => void;
  onCreate: () => void;
}) {
  const results = useMemo(
    () => searchExercises(query, { muscle: muscle ?? undefined, equipment: equipment ?? undefined, custom }),
    [query, muscle, equipment, custom],
  );
  if (results.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="font-semibold">No exercises match</p>
        <p className="mt-1 text-sm text-muted">Try another name or filter — or add your own.</p>
        <Button variant="secondary" className="mt-4" icon={<Plus className="size-5" aria-hidden />} onClick={onCreate}>
          Create {query.trim() ? `“${query.trim()}”` : 'custom exercise'}
        </Button>
      </div>
    );
  }
  return (
    <ul className="-mx-2 divide-y divide-line/50">
      {results.map((ex) => {
        const isSel = selected.includes(ex.id);
        const present = presentIds.includes(ex.id);
        return (
          <li key={ex.id}>
            <button
              type="button"
              aria-pressed={isSel}
              onClick={() => onToggle(ex)}
              className={clsx('flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2', isSel && 'bg-accent-soft')}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{ex.name}</span>
                  {ex.isCustom && <Badge>Custom</Badge>}
                  {present && <Badge tone="info">Added</Badge>}
                </span>
                <span className="block truncate text-sm text-muted">
                  {muscleLabel(ex.primaryMuscle)} · {equipmentLabel(ex.equipment)}
                </span>
              </span>
              <span
                aria-hidden
                className={clsx(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                  isSel ? 'border-accent bg-accent text-on-accent' : 'border-line text-transparent',
                )}
              >
                <Check className="size-4" strokeWidth={3} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CustomExerciseForm({ initialName, onCreated, onCancel }: { initialName: string; onCreated: (ex: Exercise) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [primaryMuscle, setPrimary] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [mechanic, setMechanic] = useState<Mechanic>('compound');
  const [trackingType, setTracking] = useState<TrackingType>('weight_reps');
  const [cue, setCue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError('Give it a name.');
      return;
    }
    setBusy(true);
    try {
      const ex = await api.createCustomExercise({
        name: name.trim(),
        primaryMuscle,
        secondaryMuscles: [],
        equipment,
        mechanic,
        trackingType,
        ...(cue.trim() ? { cue: cue.trim() } : {}),
      });
      qc.setQueryData<Exercise[]>(qk.customExercises, (old) => [...(old ?? []), ex]);
      void qc.invalidateQueries({ queryKey: qk.customExercises });
      onCreated(ex);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not create the exercise'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <TextField label="Name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} error={error} maxLength={80} data-autofocus />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Main muscle" value={primaryMuscle} onChange={(e) => setPrimary(e.target.value as MuscleGroup)}>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {muscleLabel(m)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENT.map((m) => (
            <option key={m} value={m}>
              {equipmentLabel(m)}
            </option>
          ))}
        </SelectField>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">Type</p>
        <Segmented<Mechanic>
          label="Mechanic"
          value={mechanic}
          onChange={setMechanic}
          options={[
            { value: 'compound', label: 'Compound' },
            { value: 'isolation', label: 'Isolation' },
          ]}
        />
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">Track</p>
        <Segmented<TrackingType>
          label="Tracking"
          value={trackingType}
          onChange={setTracking}
          options={[
            { value: 'weight_reps', label: 'Weight × reps' },
            { value: 'bodyweight_reps', label: 'Reps' },
            { value: 'duration', label: 'Time' },
          ]}
        />
      </div>
      <TextField label="Technique cue (optional)" value={cue} onChange={(e) => setCue(e.target.value)} maxLength={140} />
      <div className="flex gap-3 pt-1">
        <Button variant="secondary" block onClick={onCancel}>
          Back
        </Button>
        <Button variant="primary" block loading={busy} onClick={() => void submit()}>
          Create exercise
        </Button>
      </div>
    </div>
  );
}

export function ExercisePickerSheet({ open, onClose, onPick, title, multi = false, presentIds = [], confirmLabel }: ExercisePickerProps) {
  return open ? (
    <PickerBody open={open} onClose={onClose} onPick={onPick} title={title} multi={multi} presentIds={presentIds} confirmLabel={confirmLabel} />
  ) : null;
}

function PickerBody({ open, onClose, onPick, title, multi, presentIds = [], confirmLabel }: ExercisePickerProps) {
  const { custom } = useExerciseLookup();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const toggle = (ex: Exercise) => {
    if (!multi) {
      onPick([ex.id]);
      return;
    }
    setSelected((s) => (s.includes(ex.id) ? s.filter((x) => x !== ex.id) : [...s, ex.id]));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="tall"
      title={creating ? 'New custom exercise' : (title ?? 'Add exercise')}
      footer={
        multi && !creating && selected.length > 0 ? (
          <Button variant="primary" size="lg" block onClick={() => onPick(selected)}>
            {confirmLabel ? confirmLabel(selected.length) : `Add ${selected.length} exercise${selected.length === 1 ? '' : 's'}`}
          </Button>
        ) : undefined
      }
    >
      {creating ? (
        <CustomExerciseForm
          initialName={query}
          onCancel={() => setCreating(false)}
          onCreated={(ex) => {
            setCreating(false);
            if (multi) setSelected((s) => [...s, ex.id]);
            else onPick([ex.id]);
          }}
        />
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint" aria-hidden />
              <label htmlFor="exercise-search" className="sr-only">
                Search exercises
              </label>
              <input
                id="exercise-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exercises"
                autoComplete="off"
                enterKeyHint="search"
                className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 pr-4 pl-12 text-[16px] outline-none placeholder:text-faint focus:border-accent-ink"
              />
            </div>
            <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filter by muscle">
              <Chip selected={muscle === null} onClick={() => setMuscle(null)}>
                All muscles
              </Chip>
              {MUSCLE_GROUPS.map((m) => (
                <Chip key={m} selected={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
                  {muscleLabel(m)}
                </Chip>
              ))}
            </div>
            <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filter by equipment">
              <Chip selected={equipment === null} onClick={() => setEquipment(null)}>
                Any equipment
              </Chip>
              {EQUIPMENT.map((e) => (
                <Chip key={e} selected={equipment === e} onClick={() => setEquipment(equipment === e ? null : e)}>
                  {equipmentLabel(e)}
                </Chip>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-1 mb-1 flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left font-semibold text-accent-ink active:bg-surface-2"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft">
              <Plus className="size-5" aria-hidden />
            </span>
            Create custom exercise
          </button>
          <ErrorBoundary compact>
            <ResultList
              query={deferredQuery}
              muscle={muscle}
              equipment={equipment}
              custom={custom}
              selected={selected}
              presentIds={presentIds}
              onToggle={toggle}
              onCreate={() => setCreating(true)}
            />
          </ErrorBoundary>
        </>
      )}
    </Sheet>
  );
}
