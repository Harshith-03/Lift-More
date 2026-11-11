import clsx from 'clsx';
import { MUSCLE_GROUPS, type MuscleVolume } from '../../../../shared/types';
import { fmtNum, muscleLabel } from '../../lib/format';

type Status = 'under' | 'ok' | 'over';

function statusOf(v: MuscleVolume): Status {
  if (v.sets < v.target.min) return 'under';
  if (v.sets > v.target.max) return 'over';
  return 'ok';
}

const STATUS_TEXT: Record<Status, string> = { under: 'Under', ok: 'On target', over: 'Above' };

/** Hard sets per muscle vs the recommended weekly range (shaded band). */
export function MuscleVolumeBars({ volume, compact = false }: { volume: MuscleVolume[]; compact?: boolean }) {
  const rows = MUSCLE_GROUPS.map((m) => volume.find((v) => v.muscle === m)).filter(
    (v): v is MuscleVolume => !!v && (v.target.max > 0 || v.sets > 0),
  );
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted">No training volume logged yet.</p>;
  const scale = Math.max(...rows.map((r) => Math.max(r.sets, r.target.max * 1.15)), 1);
  const under = rows.filter((r) => statusOf(r) === 'under').length;

  return (
    <div>
      <ul className="flex flex-col gap-2.5" aria-label="Weekly sets per muscle">
        {rows.map((v) => {
          const st = statusOf(v);
          return (
            <li key={v.muscle} className={clsx('grid items-center gap-x-3', compact ? 'grid-cols-[5.5rem_1fr_minmax(4.5rem,auto)]' : 'grid-cols-[6rem_1fr_minmax(5rem,auto)]')}>
              <span className="truncate text-sm font-medium">{muscleLabel(v.muscle)}</span>
              <div className="relative h-3 rounded-full bg-surface-2" aria-hidden>
                {/* target band */}
                <div
                  className="absolute inset-y-0 rounded-full bg-[color-mix(in_srgb,var(--color-good)_22%,transparent)]"
                  style={{ left: `${(v.target.min / scale) * 100}%`, width: `${((v.target.max - v.target.min) / scale) * 100}%` }}
                />
                <div
                  className={clsx(
                    'absolute inset-y-[3px] left-[3px] rounded-full',
                    st === 'under' ? 'bg-warn' : st === 'over' ? 'bg-info' : 'bg-good',
                  )}
                  style={{ width: `max(0px, calc(${(Math.min(v.sets, scale) / scale) * 100}% - 6px))` }}
                />
              </div>
              <span className="text-right text-sm whitespace-nowrap">
                <span className="font-bold">{fmtNum(v.sets, 1)}</span>
                <span className="text-faint">
                  /{v.target.min}–{v.target.max}
                </span>
                <span className="sr-only"> sets, {STATUS_TEXT[st]}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-[color-mix(in_srgb,var(--color-good)_30%,transparent)]" aria-hidden /> Target range
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warn" aria-hidden /> Under
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-good" aria-hidden /> On target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-info" aria-hidden /> Above
        </span>
        {under > 0 && <span className="ml-auto font-semibold text-warn">{under} under target</span>}
      </p>
    </div>
  );
}
