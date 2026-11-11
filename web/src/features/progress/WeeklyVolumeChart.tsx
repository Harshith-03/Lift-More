import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StatsSummary, Unit } from '../../../../shared/types';
import { kgToUnit } from '../../../../shared/engine';
import { fmtCalendarDate, fmtNum, fmtVolumeCompact } from '../../lib/format';
import { Segmented } from '../../components/ui';
import { useChartColors } from './chartTheme';
import { ChartTooltipBox } from './ChartTooltip';

type Metric = 'volume' | 'sets';

/** 12-week bar chart of training volume (one series → one colour). */
export function WeeklyVolumeChart({ weeks, unit }: { weeks: StatsSummary['weeklyVolume']; unit: Unit }) {
  const c = useChartColors();
  const [metric, setMetric] = useState<Metric>('volume');
  const data = weeks.map((w) => ({
    label: fmtCalendarDate(w.weekStart),
    value: metric === 'volume' ? Math.round(kgToUnit(w.volumeKg, unit)) : w.sets,
    workouts: w.workouts,
  }));
  const thisWeek = data[data.length - 1];

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">This week</p>
          <p className="text-2xl font-extrabold tracking-tight">
            {thisWeek ? (metric === 'volume' ? `${fmtVolumeCompact(weeks[weeks.length - 1]!.volumeKg, unit)} ${unit}` : `${thisWeek.value} sets`) : '—'}
          </p>
        </div>
        <Segmented<Metric>
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'volume', label: 'Volume' },
            { value: 'sets', label: 'Sets' },
          ]}
          className="w-44"
        />
      </div>
      <div className="mt-3 h-48" role="img" aria-label={`Weekly ${metric} for the last ${data.length} weeks`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="22%">
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis
              tick={{ fill: c.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v: number) => (metric === 'volume' && v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : String(v))}
            />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={`Week of ${String(label)}`}
                    rows={[
                      {
                        name: metric === 'volume' ? 'Volume' : 'Hard sets',
                        value: metric === 'volume' ? `${Number(payload[0]!.value).toLocaleString('en-US')} ${unit}` : String(payload[0]!.value),
                        color: c.series1,
                      },
                      { name: 'Workouts', value: String((payload[0]!.payload as { workouts: number }).workouts), color: 'transparent' },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="value" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
