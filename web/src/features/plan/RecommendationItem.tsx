import { useState } from 'react';
import { ArrowRightLeft, Check, Minus, Plus, Sparkles } from 'lucide-react';
import type { ExerciseRecommendation } from '../../../../shared/types';
import { useExerciseLookup, useRoutines } from '../../lib/queries';
import { Badge, Button, ListButton } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { isApplied, useApplyChange } from './applyChange';

const ICON = { add: Plus, swap: ArrowRightLeft, remove: Minus };

/** One add / swap / remove suggestion with a one-tap "Apply" to the target routine. */
export function RecommendationItem({ change }: { change: ExerciseRecommendation }) {
  const lookup = useExerciseLookup();
  const { data: routines } = useRoutines();
  const apply = useApplyChange();
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState(false);
  const routine = routines?.find((r) => r.id === change.routineId);
  const applied = isApplied(change, routine);
  const Icon = ICON[change.type];

  const title =
    change.type === 'add'
      ? `Add ${lookup.name(change.exerciseId)}`
      : change.type === 'swap'
        ? `${lookup.name(change.exerciseId)} → ${lookup.name(change.replacementId ?? '')}`
        : `Drop ${lookup.name(change.exerciseId)}`;

  const run = async (routineId: string) => {
    setBusy(true);
    setChoose(false);
    await apply(change, routineId);
    setBusy(false);
  };

  // which routines a routine-less change could apply to
  const candidates = (routines ?? []).filter((r) =>
    change.type === 'add' ? !r.items.some((i) => i.exerciseId === change.exerciseId) : r.items.some((i) => i.exerciseId === change.exerciseId),
  );

  return (
    <li className="flex gap-3 rounded-2xl bg-surface-2/60 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-muted">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug font-semibold">
          {title}
          {change.source === 'ai' && (
            <Badge tone="info">
              <Sparkles className="size-3" aria-hidden /> AI
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-sm text-muted">{change.reason}</p>
        {routine && <p className="mt-0.5 text-xs text-faint">in {routine.name}</p>}
      </div>
      <div className="shrink-0 self-center">
        {applied ? (
          <span className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-accent-ink">
            <Check className="size-4" strokeWidth={3} aria-hidden /> Applied
          </span>
        ) : (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!routine && candidates.length === 0}
            onClick={() => (routine ? void run(routine.id) : setChoose(true))}
          >
            Apply
          </Button>
        )}
      </div>
      <Sheet open={choose} onClose={() => setChoose(false)} title="Apply to which routine?" description={title}>
        <ul className="-mx-2">
          {candidates.map((r) => (
            <li key={r.id}>
              <ListButton label={r.name} description={`${r.items.length} exercises`} onClick={() => void run(r.id)} />
            </li>
          ))}
        </ul>
      </Sheet>
    </li>
  );
}
