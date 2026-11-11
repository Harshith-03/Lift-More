import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { Routine, RoutineInput, RoutineItem } from '../../../../shared/types';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup, useRoutines, useUser } from '../../lib/queries';
import { equipmentLabel, fmtRest, muscleLabel } from '../../lib/format';
import { Button, EmptyState, IconButton, SelectField, Skeleton, Stepper, TextAreaField, TextField } from '../../components/ui';
import { NumericInput } from '../../components/NumericInput';
import { useConfirm, useToast } from '../../components/feedback';
import { SubHeader } from '../../components/PageHeader';
import { ExercisePickerSheet } from '../exercises/ExercisePickerSheet';
import { defaultItemFor } from '../workout/draftFactory';

const REST_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240, 300];

function ItemEditor({
  item,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  item: RoutineItem;
  index: number;
  count: number;
  onChange: (patch: Partial<RoutineItem>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const lookup = useExerciseLookup();
  const ex = lookup.get(item.exerciseId);
  const name = lookup.name(item.exerciseId);
  const isDuration = ex?.trackingType === 'duration';
  const rangeBad = item.repMin > item.repMax;
  return (
    <li className="rounded-[var(--radius-card)] border border-line/60 bg-surface p-3">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pt-1 pl-1">
          <p className="truncate font-bold">{name}</p>
          {ex && (
            <p className="text-sm text-muted">
              {muscleLabel(ex.primaryMuscle)} · {equipmentLabel(ex.equipment)}
            </p>
          )}
        </div>
        <IconButton label={`Move ${name} up`} tone="muted" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="size-5" aria-hidden />
        </IconButton>
        <IconButton label={`Move ${name} down`} tone="muted" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown className="size-5" aria-hidden />
        </IconButton>
        <IconButton label={`Remove ${name}`} tone="danger" onClick={onRemove}>
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">Working sets</p>
          <Stepper label={`${name} sets`} value={item.sets} min={1} max={10} onChange={(sets) => onChange({ sets })} />
        </div>
        <SelectField label="Rest" value={item.restSec} onChange={(e) => onChange({ restSec: Number(e.target.value) })}>
          {[...new Set([...REST_CHOICES, item.restSec])]
            .sort((a, b) => a - b)
            .map((s) => (
              <option key={s} value={s}>
                {fmtRest(s)}
              </option>
            ))}
        </SelectField>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-sm font-medium text-muted">{isDuration ? 'Target seconds' : 'Rep range'}</p>
        <div className="flex items-center gap-2">
          <NumericInput
            aria-label={`${name} minimum ${isDuration ? 'seconds' : 'reps'}`}
            value={item.repMin}
            onValueChange={(v) => onChange({ repMin: v == null ? 1 : Math.max(1, Math.round(v)) })}
            className="h-12 w-full min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 text-center text-lg font-bold outline-none focus:border-accent-ink aria-[invalid=true]:border-danger"
            aria-invalid={rangeBad || undefined}
          />
          <span className="text-muted">to</span>
          <NumericInput
            aria-label={`${name} maximum ${isDuration ? 'seconds' : 'reps'}`}
            value={item.repMax}
            onValueChange={(v) => onChange({ repMax: v == null ? 1 : Math.max(1, Math.round(v)) })}
            className="h-12 w-full min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 text-center text-lg font-bold outline-none focus:border-accent-ink aria-[invalid=true]:border-danger"
            aria-invalid={rangeBad || undefined}
          />
        </div>
        {rangeBad && <p className="mt-1 text-sm text-danger">Minimum can’t be above maximum.</p>}
      </div>

      <TextField
        className="mt-3"
        label="Notes (optional)"
        value={item.notes ?? ''}
        maxLength={200}
        placeholder="Grip, tempo, machine settings…"
        onChange={(e) => onChange({ notes: e.target.value })}
      />
    </li>
  );
}

function Editor({ routine }: { routine: Routine | null }) {
  const user = useUser();
  const lookup = useExerciseLookup();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [name, setName] = useState(routine?.name ?? '');
  const [notes, setNotes] = useState(routine?.notes ?? '');
  const [items, setItems] = useState<RoutineItem[]>(routine?.items ?? []);
  const [picker, setPicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const touch = () => setDirty(true);
  const updateItem = (i: number, patch: Partial<RoutineItem>) => {
    touch();
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  };
  const moveItem = (i: number, delta: -1 | 1) => {
    touch();
    setItems((list) => {
      const j = i + delta;
      if (j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  const back = () => navigate('/profile#routines', { replace: true });

  const save = async () => {
    if (!name.trim()) {
      setNameError('Give the routine a name.');
      return;
    }
    if (items.some((i) => i.repMin > i.repMax)) {
      toast.error('Fix the rep ranges marked in red.');
      return;
    }
    const body: RoutineInput = {
      name: name.trim(),
      notes: notes.trim(),
      items: items.map((i) => ({ ...i, notes: i.notes?.trim() || undefined })),
      ...(routine ? { position: routine.position } : {}),
    };
    setSaving(true);
    try {
      const saved = routine ? await api.updateRoutine(routine.id, body) : await api.createRoutine(body);
      qc.setQueryData<Routine[]>(qk.routines, (old) =>
        old ? (routine ? old.map((r) => (r.id === saved.id ? saved : r)) : [...old, saved]) : old,
      );
      void qc.invalidateQueries({ queryKey: qk.routines });
      void qc.invalidateQueries({ queryKey: qk.plan });
      toast.success(routine ? 'Routine saved' : 'Routine created');
      back();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the routine'));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!routine) return;
    if (!(await confirm({ title: `Delete “${routine.name}”?`, message: 'Past workouts stay in your history.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteRoutine(routine.id);
      qc.setQueryData<Routine[]>(qk.routines, (old) => old?.filter((r) => r.id !== routine.id));
      void qc.invalidateQueries({ queryKey: qk.plan });
      toast.success('Routine deleted');
      back();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the routine'));
    }
  };

  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Discard changes?', confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'danger' }))) return;
    back();
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <SubHeader
        title={routine ? 'Edit routine' : 'New routine'}
        onBack={() => void cancel()}
        actions={
          <Button variant="primary" size="sm" className="mr-1 rounded-2xl" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 pt-4">
        <TextField
          label="Name"
          value={name}
          maxLength={60}
          placeholder="e.g. Push day"
          error={nameError}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
            touch();
          }}
        />
        <TextAreaField label="Notes (optional)" value={notes} rows={2} maxLength={500} onChange={(e) => { setNotes(e.target.value); touch(); }} />

        <div>
          <h2 className="mb-2 text-[13px] font-semibold tracking-wider text-muted uppercase">Exercises</h2>
          {items.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line">
              <EmptyState title="No exercises yet" body="Add the lifts for this day. Suggestions use your rep ranges." />
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {items.map((it, i) => (
                <ItemEditor
                  key={`${it.exerciseId}-${i}`}
                  item={it}
                  index={i}
                  count={items.length}
                  onChange={(p) => updateItem(i, p)}
                  onMove={(d) => moveItem(i, d)}
                  onRemove={() => {
                    touch();
                    setItems((list) => list.filter((_, j) => j !== i));
                  }}
                />
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line font-semibold text-accent-ink active:bg-surface"
          >
            <Plus className="size-5" strokeWidth={2.5} aria-hidden /> Add exercises
          </button>
        </div>

        {routine && (
          <Button variant="ghost" className="mt-2 text-danger" icon={<Trash2 className="size-5" aria-hidden />} onClick={() => void remove()}>
            Delete routine
          </Button>
        )}
      </div>

      <ExercisePickerSheet
        open={picker}
        onClose={() => setPicker(false)}
        multi
        presentIds={items.map((i) => i.exerciseId)}
        confirmLabel={(n) => `Add ${n} to routine`}
        onPick={(ids) => {
          setPicker(false);
          touch();
          setItems((list) => [...list, ...ids.map((id) => ({ exerciseId: id, ...defaultItemFor(lookup.get(id), user.goal, user.defaultRestSec) }))]);
        }}
      />
    </div>
  );
}

export function RoutineEditorPage() {
  const { id } = useParams();
  const { data: routines, isPending } = useRoutines();
  if (!id) return <Editor routine={null} />;
  if (isPending)
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top)+5rem)]">
        <Skeleton className="h-12" />
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      </div>
    );
  const routine = routines?.find((r) => r.id === id);
  if (!routine)
    return (
      <div className="mx-auto max-w-lg">
        <SubHeader title="Routine" back="/profile#routines" />
        <EmptyState title="Routine not found" body="It may have been deleted on another device." />
      </div>
    );
  return <Editor key={routine.id} routine={routine} />;
}
