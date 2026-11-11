import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Scale, Trash2 } from 'lucide-react';
import type { BodyweightEntry } from '../../../../shared/types';
import { kgToUnit, localDate } from '../../../../shared/engine';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useBodyweight, useUser } from '../../lib/queries';
import { fmtCalendarDate, fmtNum, inputToKg } from '../../lib/format';
import { NumericInput } from '../../components/NumericInput';
import { Button, Card, IconButton, Skeleton } from '../../components/ui';
import { useConfirm, useToast } from '../../components/feedback';
import { useChartColors } from './chartTheme';
import { ChartTooltipBox } from './ChartTooltip';

/** Bodyweight reads best with one decimal ("81.3 kg"). */
const fmtBw = (kg: number, unit: 'kg' | 'lb') => `${fmtNum(kgToUnit(kg, unit), 1)} ${unit}`;

export function BodyweightCard() {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const c = useChartColors();
  const { data, isPending } = useBodyweight();
  const [value, setValue] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const today = useMemo(() => localDate(new Date(), user.timezone), [user.timezone]);
  const entries = data ?? [];
  const todays = entries.find((e) => e.date === today);

  const save = useMutation({
    mutationFn: ({ date, weightKg }: { date: string; weightKg: number }) => api.putBodyweight(date, weightKg),
    onSuccess: (entry) => {
      qc.setQueryData<BodyweightEntry[]>(qk.bodyweight, (old) =>
        [...(old ?? []).filter((e) => e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setValue(null);
      toast.success(`Logged ${fmtBw(entry.weightKg, user.unit)}`);
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save bodyweight')),
  });

  const remove = useMutation({
    mutationFn: (date: string) => api.deleteBodyweight(date),
    onSuccess: (_v, date) => qc.setQueryData<BodyweightEntry[]>(qk.bodyweight, (old) => (old ?? []).filter((e) => e.date !== date)),
    onError: (e) => toast.error(errorMessage(e, 'Could not delete entry')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const kg = inputToKg(value, user.unit);
    if (kg == null || kg <= 0) return;
    save.mutate({ date: today, weightKg: kg });
  };

  const points = entries.slice(-60).map((e) => ({ label: fmtCalendarDate(e.date), value: Math.round(kgToUnit(e.weightKg, user.unit) * 10) / 10 }));
  const latest = entries[entries.length - 1];
  const newestFirst = [...entries].reverse();
  const list = showAll ? newestFirst : newestFirst.slice(0, 5);

  return (
    <Card className="p-4">
      <div className="flex items-baseline gap-2">
        <Scale className="size-5 self-center text-muted" aria-hidden />
        <span className="text-2xl font-extrabold tracking-tight">{latest ? fmtBw(latest.weightKg, user.unit) : '—'}</span>
        {latest && <span className="text-sm text-muted">on {fmtCalendarDate(latest.date)}</span>}
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="bw-today" className="sr-only">
          Today’s bodyweight in {user.unit}
        </label>
        <NumericInput
          id="bw-today"
          decimal
          maxDecimals={1}
          value={value}
          onValueChange={setValue}
          placeholder={todays ? `Today: ${fmtNum(kgToUnit(todays.weightKg, user.unit), 1)}` : `Today (${user.unit})`}
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-[16px] font-semibold outline-none placeholder:font-normal placeholder:text-faint focus:border-accent-ink"
        />
        <Button type="submit" variant="primary" loading={save.isPending} disabled={value == null || value <= 0}>
          {todays ? 'Update' : 'Log'}
        </Button>
      </form>

      {isPending ? (
        <Skeleton className="mt-4 h-40" />
      ) : points.length >= 2 ? (
        <div className="mt-4 h-40" role="img" aria-label={`Bodyweight trend, ${points.length} entries`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={24} />
              <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} domain={['dataMin - 1', 'dataMax + 1']} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: c.axis, strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltipBox title={String(label)} rows={[{ name: 'Bodyweight', value: `${payload[0]!.value} ${user.unit}`, color: c.series1 }]} />
                  ) : null
                }
              />
              <Line type="monotone" dataKey="value" name="Bodyweight" stroke={c.series1} strokeWidth={2} dot={points.length <= 20 ? { r: 4, strokeWidth: 2, stroke: c.surface, fill: c.series1 } : false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-muted">Log a few days to see your trend.</p>
      )}

      {list.length > 0 && (
        <ul className="mt-3 divide-y divide-line/50 border-t border-line/50">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-1">
              <span className="flex-1 text-sm text-muted">{fmtCalendarDate(e.date, true)}</span>
              <span className="font-semibold">{fmtBw(e.weightKg, user.unit)}</span>
              <IconButton
                label={`Delete entry for ${fmtCalendarDate(e.date)}`}
                tone="muted"
                onClick={async () => {
                  if (await confirm({ title: 'Delete this entry?', message: `${fmtBw(e.weightKg, user.unit)} on ${fmtCalendarDate(e.date, true)}`, confirmLabel: 'Delete', tone: 'danger' }))
                    remove.mutate(e.date);
                }}
              >
                <Trash2 className="size-4.5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 5 && (
        <Button variant="ghost" size="sm" block className="mt-1" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show less' : `Show all ${entries.length}`}
        </Button>
      )}
    </Card>
  );
}
