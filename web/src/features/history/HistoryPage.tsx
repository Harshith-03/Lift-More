import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CloudUpload, History as HistoryIcon } from 'lucide-react';
import type { WorkoutSummary } from '../../../../shared/types';
import { addDays, weekStartOf } from '../../../../shared/engine';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup, useUser } from '../../lib/queries';
import { fmtCalendarDate, fmtDay, fmtDuration, fmtTime, fmtVolume, fmtVolumeCompact, plural } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { Button, EmptyState, Skeleton, Spinner } from '../../components/ui';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { useOutbox } from '../sync/outboxStore';
import { useStartWorkout } from '../workout/useStartWorkout';

const PAGE = 20;

function WorkoutRow({ w }: { w: WorkoutSummary }) {
  const user = useUser();
  const lookup = useExerciseLookup();
  return (
    <li>
      <Link to={`/history/${w.id}`} className="block rounded-[var(--radius-card)] border border-line/60 bg-surface p-4 active:bg-surface-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-bold">{w.name}</p>
          <p className="shrink-0 text-sm text-muted">{fmtDay(w.startedAt, user.timezone)}</p>
        </div>
        <p className="mt-1 text-sm text-muted">
          {fmtTime(w.startedAt, user.timezone)} · {fmtDuration(w.durationSec)} · {plural(w.setCount, 'set')} · {fmtVolume(w.volumeKg, user.unit)}
        </p>
        {w.exerciseIds.length > 0 && <p className="mt-2 line-clamp-2 text-sm text-ink/80">{w.exerciseIds.map((id) => lookup.name(id)).join(' · ')}</p>}
      </Link>
    </li>
  );
}

function PendingRows() {
  const user = useUser();
  const pending = useOutbox(user.id);
  if (pending.length === 0) return null;
  return (
    <section className="mb-5" aria-label="Waiting to sync">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wider text-info uppercase">
        <CloudUpload className="size-4" aria-hidden /> Waiting to sync
      </h2>
      <ul className="flex flex-col gap-2">
        {pending.map((e) => (
          <li key={e.id} className="rounded-[var(--radius-card)] border border-dashed border-info/50 bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate font-bold">{e.workout.name}</p>
              <p className="shrink-0 text-sm text-muted">{fmtDay(e.workout.startedAt, user.timezone)}</p>
            </div>
            <p className="mt-1 text-sm text-muted">{plural(e.workout.sets.filter((s) => s.completed).length, 'set')} · saved on this device</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HistoryPage() {
  const user = useUser();
  const start = useStartWorkout();
  const query = useInfiniteQuery({
    queryKey: qk.workoutList,
    queryFn: ({ pageParam, signal }) => api.workouts({ limit: PAGE, before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1]?.startedAt),
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const weeks = useMemo(() => {
    const all = query.data?.pages.flat() ?? [];
    const seen = new Set<string>();
    const groups: Array<{ weekStart: string; items: WorkoutSummary[]; volumeKg: number }> = [];
    for (const w of all) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      const ws = weekStartOf(w.startedAt, user.timezone);
      let g = groups[groups.length - 1];
      if (!g || g.weekStart !== ws) {
        g = { weekStart: ws, items: [], volumeKg: 0 };
        groups.push(g);
      }
      g.items.push(w);
      g.volumeKg += w.volumeKg;
    }
    return groups;
  }, [query.data, user.timezone]);

  const thisWeek = useMemo(() => weekStartOf(new Date(), user.timezone), [user.timezone]);
  const weekLabel = (ws: string) => {
    if (ws === thisWeek) return 'This week';
    if (ws === addDays(thisWeek, -7)) return 'Last week';
    return `${fmtCalendarDate(ws)} – ${fmtCalendarDate(addDays(ws, 6))}`;
  };

  return (
    <div>
      <PageHeader title="History" />
      <PendingRows />
      {query.isPending ? (
        <div className="flex flex-col gap-3 pt-2" aria-busy="true">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-24 rounded-[var(--radius-card)]" />
          <Skeleton className="h-24 rounded-[var(--radius-card)]" />
          <Skeleton className="h-24 rounded-[var(--radius-card)]" />
        </div>
      ) : query.isError && !query.data ? (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
      ) : weeks.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="size-7" aria-hidden />}
          title="No workouts yet"
          body="Finished workouts show up here, grouped by week."
          action={
            <Button variant="primary" onClick={() => void start({ empty: true })}>
              Log your first workout
            </Button>
          }
        />
      ) : (
        <>
          {weeks.map((g) => (
            <section key={g.weekStart} className="mb-6" aria-label={weekLabel(g.weekStart)}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold tracking-wider text-muted uppercase">{weekLabel(g.weekStart)}</h2>
                <p className="text-xs text-faint">
                  {plural(g.items.length, 'workout')} · {fmtVolumeCompact(g.volumeKg, user.unit)} {user.unit}
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {g.items.map((w) => (
                  <WorkoutRow key={w.id} w={w} />
                ))}
              </ul>
            </section>
          ))}
          <div ref={sentinel} className="flex justify-center py-4">
            {query.isFetchingNextPage ? (
              <Spinner />
            ) : query.hasNextPage ? (
              <Button variant="secondary" onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            ) : (
              <p className="text-sm text-faint">That’s everything.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
