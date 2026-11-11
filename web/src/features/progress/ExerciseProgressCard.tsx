import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, LineChart as LineChartIcon, Search, Trophy } from 'lucide-react';
import type { ExerciseHistory, TrackingType, Unit } from '../../../../shared/types';
import { kgToUnit } from '../../../../shared/engine';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup, useUser } from '../../lib/queries';
import { describePR, fmtNum, fmtShortDate, fmtWeight } from '../../lib/format';
import { Card, EmptyState, ListButton, Skeleton } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { useChartColors } from './chartTheme';
import { ChartTooltipBox } from './ChartTooltip';

interface Point {
  label: string;
  e1rm: number | null;
  top: number | null;
}

function buildSeries(h: ExerciseHistory, tracking: TrackingType, unit: Unit, tz: string) {
  const sessions = [...h.sessions].reverse(); // oldest → newest
  if (tracking === 'duration') {
    return {
      mode: 'duration' as const,
      points: sessions.map((s) => ({ label: fmtShortDate(s.date, tz), e1rm: null, top: s.topSet?.durationSec ?? null })),
    };
  }
  const hasWeight = sessions.some((s) => s.topSet?.weightKg);
  if (!hasWeight) {
    return {
      mode: 'reps' as const,
      points: sessions.map((s) => ({ label: fmtShortDate(s.date, tz), e1rm: null, top: s.topSet?.reps ?? null })),
    };
  }
  return {
    mode: 'weight' as const,
    points: sessions.map<Point>((s) => ({
      label: fmtShortDate(s.date, tz),
      e1rm: s.e1rmKg != null ? Math.round(kgToUnit(s.e1rmKg, unit) * 10) / 10 : null,
      top: s.topSet?.weightKg != null ? Math.round(kgToUnit(s.topSet.weightKg, unit) * 10) / 10 : null,
    })),
  };
}

function ExerciseChart({ exerciseId }: { exerciseId: string }) {
  const user = useUser();
  const lookup = useExerciseLookup();
  const c = useChartColors();
  const tracking = lookup.get(exerciseId)?.trackingType ?? 'weight_reps';
  const { data, isPending, error, refetch } = useQuery({
    queryKey: qk.historyExercise(exerciseId),
    queryFn: ({ signal }) => api.exerciseHistory(exerciseId, 30, signal),
  });
  const series = useMemo(() => (data ? buildSeries(data, tracking, user.unit, user.timezone) : null), [data, tracking, user.unit, user.timezone]);

  if (isPending) return <Skeleton className="h-56" />;
  if (!data || !series) return <ErrorPanel compact error={error} onRetry={() => void refetch()} />;
  if (series.points.length === 0) return <p className="py-8 text-center text-sm text-muted">No completed sets for this exercise yet.</p>;

  const isWeight = series.mode === 'weight';
  const suffix = series.mode === 'duration' ? 's' : series.mode === 'reps' ? ' reps' : ` ${user.unit}`;
  const topName = series.mode === 'duration' ? 'Longest hold' : series.mode === 'reps' ? 'Top set reps' : 'Top set';
  const last = series.points[series.points.length - 1]!;
  const first = series.points[0]!;
  const headline = isWeight ? (last.e1rm ?? last.top) : last.top;
  const base = isWeight ? (first.e1rm ?? first.top) : first.top;
  const delta = headline != null && base != null ? headline - base : null;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight">{headline != null ? `${fmtNum(headline, 1)}` : '—'}</span>
        <span className="text-sm text-muted">{isWeight ? `${user.unit} est. 1RM` : suffix.trim()}</span>
        {delta != null && series.points.length > 1 && (
          <span className={`ml-auto text-sm font-semibold ${delta >= 0 ? 'text-good' : 'text-warn'}`}>
            {delta >= 0 ? '+' : ''}
            {fmtNum(delta, 1)}
            {suffix} since {first.label}
          </span>
        )}
      </div>

      {/* legend (identity is never colour-only) */}
      <div className="mt-2 flex gap-4 text-xs text-muted">
        {isWeight && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: c.series1 }} aria-hidden /> Est. 1RM
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: isWeight ? c.series2 : c.series1 }} aria-hidden /> {topName}
        </span>
      </div>

      <div className="mt-2 h-52" role="img" aria-label={`${lookup.name(exerciseId)} progress chart over ${series.points.length} sessions`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series.points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={24} />
            <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={String(label)}
                    rows={payload
                      .filter((p) => p.value != null)
                      .map((p) => ({ name: String(p.name), value: `${fmtNum(Number(p.value), 1)}${suffix}`, color: String(p.color) }))}
                  />
                ) : null
              }
            />
            {isWeight && (
              <Line type="monotone" dataKey="e1rm" name="Est. 1RM" stroke={c.series1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface, fill: c.series1 }} activeDot={{ r: 6 }} connectNulls />
            )}
            <Line
              type="monotone"
              dataKey="top"
              name={topName}
              stroke={isWeight ? c.series2 : c.series1}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: c.surface, fill: isWeight ? c.series2 : c.series1 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-2 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-muted">Show as table</summary>
        <table className="mt-1 w-full text-left">
          <thead className="text-xs text-faint">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">{topName}</th>
              {isWeight && <th className="py-1 text-right font-medium">Est. 1RM</th>}
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr key={s.workoutId} className="border-t border-line/50">
                <td className="py-1.5">{fmtShortDate(s.date, user.timezone)}</td>
                <td className="py-1.5">
                  {series.mode === 'duration'
                    ? `${s.topSet?.durationSec ?? '—'}s`
                    : `${s.topSet?.weightKg != null ? fmtWeight(s.topSet.weightKg, user.unit) : 'BW'} × ${s.topSet?.reps ?? '—'}`}
                </td>
                {isWeight && <td className="py-1.5 text-right">{s.e1rmKg != null ? fmtWeight(s.e1rmKg, user.unit) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {data.prs.length > 0 && (
        <div className="mt-3 border-t border-line/60 pt-3">
          <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Personal records</h4>
          <ul className="grid grid-cols-2 gap-2">
            {data.prs.map((pr, i) => {
              const d = describePR(pr, user.unit);
              return (
                <li key={i} className="rounded-2xl bg-surface-2/70 p-3">
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Trophy className="size-3.5 text-accent-ink" aria-hidden /> {d.label}
                  </p>
                  <p className="mt-0.5 font-bold">{d.value}</p>
                  <p className="text-xs text-faint">{fmtShortDate(pr.date, user.timezone)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ExerciseProgressCard({ exerciseIds }: { exerciseIds: string[] }) {
  const lookup = useExerciseLookup();
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const current = picked && exerciseIds.includes(picked) ? picked : (exerciseIds[0] ?? null);
  const shown = exerciseIds.filter((id) => lookup.name(id).toLowerCase().includes(filter.trim().toLowerCase()));

  if (!current) {
    return (
      <Card className="p-2">
        <EmptyState icon={<LineChartIcon className="size-7" aria-hidden />} title="No lifts logged yet" body="Finish a workout and your strength curves appear here." />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 mb-3 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded-xl px-1 text-left active:bg-surface-2"
        aria-haspopup="dialog"
      >
        <span className="min-w-0 flex-1 truncate text-lg font-bold">{lookup.name(current)}</span>
        <ChevronDown className="size-5 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Change exercise</span>
      </button>
      <ExerciseChart key={current} exerciseId={current} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose exercise" size="tall">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint" aria-hidden />
          <label htmlFor="progress-filter" className="sr-only">
            Filter exercises
          </label>
          <input
            id="progress-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 pr-4 pl-12 text-[16px] outline-none focus:border-accent-ink"
          />
        </div>
        <ul className="-mx-2">
          {shown.map((id) => (
            <li key={id}>
              <ListButton
                label={lookup.name(id)}
                aria-current={id === current || undefined}
                className={id === current ? 'text-accent-ink' : undefined}
                onClick={() => {
                  setPicked(id);
                  setOpen(false);
                }}
              />
            </li>
          ))}
        </ul>
      </Sheet>
    </Card>
  );
}
