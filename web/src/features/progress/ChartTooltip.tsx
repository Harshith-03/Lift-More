/** Shared tooltip body for recharts (text in ink tokens; the swatch carries identity). */
export interface TooltipRow {
  name: string;
  value: string;
  color: string;
}

export function ChartTooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-xl shadow-black/30">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
          <span className="flex-1">{r.name}</span>
          <span className="font-semibold text-ink tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}
