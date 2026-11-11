import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, BatteryLow, ClipboardList, Pause, Play, Plus, Sparkles, Timer } from 'lucide-react';
import type { ExerciseSuggestion, ProgressionAction, RoutinePlan } from '../../../../shared/types';
import { useExerciseLookup, usePlan, useRoutines, useUser } from '../../lib/queries';
import { fmtCalendarDate, fmtWeight } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, EmptyState, SectionTitle, Skeleton } from '../../components/ui';
import { ErrorBoundary, ErrorPanel } from '../../components/ErrorBoundary';
import { useStartWorkout } from '../workout/useStartWorkout';
import { MuscleVolumeBars } from './MuscleVolumeBars';
import { RecommendationItem } from './RecommendationItem';
import { CoachCard } from './CoachCard';

const ACTION: Record<ProgressionAction, { label: string; icon: typeof Plus; tone: 'accent' | 'info' | 'neutral' | 'warn' }> = {
  increase_weight: { label: 'Weight', icon: ArrowUpRight, tone: 'accent' },
  increase_reps: { label: 'Reps', icon: Plus, tone: 'info' },
  increase_duration: { label: 'Time', icon: Timer, tone: 'info' },
  hold: { label: 'Hold', icon: Pause, tone: 'neutral' },
  deload: { label: 'Deload', icon: ArrowDownRight, tone: 'warn' },
  start: { label: 'Start', icon: Sparkles, tone: 'neutral' },
};

export function ActionBadge({ action }: { action: ProgressionAction }) {
  const a = ACTION[action];
  const Icon = a.icon;
  return (
    <Badge tone={a.tone} className="shrink-0">
      <Icon className="size-3.5" strokeWidth={2.6} aria-hidden />
      {a.label}
    </Badge>
  );
}

function targetText(s: ExerciseSuggestion, unit: 'kg' | 'lb', tracking: string): string {
  const reps = s.repsPerSet.length && s.repsPerSet.every((r) => r === s.repsPerSet[0]) ? `${s.sets} × ${s.repsPerSet[0]}` : s.repsPerSet.join(' · ');
  const suffix = tracking === 'duration' ? 's' : '';
  if (s.weightKg == null) return tracking === 'weight_reps' && s.action === 'start' ? `${reps}${suffix} · find your weight` : `${reps}${suffix}`;
  return `${fmtWeight(s.weightKg, unit)} · ${reps}${suffix}`;
}

function RoutineSection({ rp, isNext }: { rp: RoutinePlan; isNext: boolean }) {
  const user = useUser();
  const lookup = useExerciseLookup();
  const { data: routines } = useRoutines();
  const start = useStartWorkout();
  const routine = routines?.find((r) => r.id === rp.routineId);
  return (
    <Card className={clsx('overflow-hidden', isNext && 'border-accent-ink/40')}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <span className="truncate">{rp.routineName}</span>
            {isNext && <Badge tone="accent">Up next</Badge>}
          </h3>
        </div>
        {routine && (
          <Button variant={isNext ? 'primary' : 'secondary'} size="sm" icon={<Play className="size-4 fill-current" aria-hidden />} onClick={() => void start({ routine })}>
            Start
          </Button>
        )}
      </div>
      {rp.exercises.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">No exercises in this routine yet.</p>
      ) : (
        <ul className="divide-y divide-line/50">
          {rp.exercises.map((s) => {
            const tracking = lookup.get(s.exerciseId)?.trackingType ?? 'weight_reps';
            return (
              <li key={s.exerciseId} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold">{lookup.name(s.exerciseId)}</p>
                  <ActionBadge action={s.action} />
                </div>
                <p className="mt-0.5 text-[15px] font-bold text-ink">{targetText(s, user.unit, tracking)}</p>
                <p className="mt-0.5 text-sm text-muted">{s.reason}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PlanBody() {
  const { data: plan, isPending, error, refetch } = usePlan();
  const navigate = useNavigate();

  if (isPending)
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
      </div>
    );
  if (!plan) return <ErrorPanel error={error} onRetry={() => void refetch()} />;

  const ordered = [...plan.routines].sort((a, b) => (a.routineId === plan.nextRoutineId ? -1 : b.routineId === plan.nextRoutineId ? 1 : 0));

  return (
    <>
      {plan.deloadRecommended && (
        <div role="status" className="mb-4 flex gap-3 rounded-[var(--radius-card)] border border-warn/40 bg-warn-soft p-4">
          <BatteryLow className="mt-0.5 size-6 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-bold text-warn">Deload week recommended</p>
            <p className="mt-0.5 text-sm text-ink/85">
              Several lifts have stalled or you’ve trained hard for many weeks. Drop to ~90% of your weights and fewer sets this week — you’ll come back stronger.
            </p>
          </div>
        </div>
      )}

      {ordered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-7" aria-hidden />}
          title="No routines to plan"
          body="Add routines and the plan fills itself in from your logs."
          action={<Button variant="primary" onClick={() => navigate('/profile#routines')}>Add routines</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((rp) => (
            <RoutineSection key={rp.routineId} rp={rp} isNext={rp.routineId === plan.nextRoutineId} />
          ))}
        </div>
      )}

      <SectionTitle>Muscle volume · last 7 days</SectionTitle>
      <Card className="p-4">
        <MuscleVolumeBars volume={plan.volume} />
      </Card>

      {plan.recommendations.length > 0 && (
        <>
          <SectionTitle>Suggested changes</SectionTitle>
          <Card className="p-3">
            <ul className="flex flex-col gap-2">
              {plan.recommendations.map((c, i) => (
                <RecommendationItem key={`${c.type}-${c.exerciseId}-${c.replacementId ?? ''}-${i}`} change={c} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

export default function PlanPage() {
  const { data: plan } = usePlan();
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#coach') {
      const t = window.setTimeout(() => document.getElementById('coach')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      return () => window.clearTimeout(t);
    }
  }, [location.hash]);

  return (
    <div>
      <PageHeader title="Plan" subtitle={plan ? `Week of ${fmtCalendarDate(plan.weekStart)}` : 'Next week'} />
      <ErrorBoundary>
        <PlanBody />
      </ErrorBoundary>
      <SectionTitle>Coach</SectionTitle>
      <ErrorBoundary compact>
        <CoachCard />
      </ErrorBoundary>
    </div>
  );
}
