import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, LayoutTemplate, Plus } from 'lucide-react';
import type { Routine } from '../../../../shared/types';
import { TEMPLATES } from '../../../../shared/engine';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useExerciseLookup, useRoutines } from '../../lib/queries';
import { plural } from '../../lib/format';
import { Badge, Button, Card, EmptyState, IconButton, Skeleton } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/feedback';

function TemplateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (templateId: string) => {
    setBusy(templateId);
    try {
      const created = await api.routinesFromTemplate(templateId, false);
      void qc.invalidateQueries({ queryKey: qk.routines });
      void qc.invalidateQueries({ queryKey: qk.plan });
      toast.success(`Added ${plural(created.length, 'routine')}`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the template'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add from template" description="Routines are added after your existing ones." size="tall">
      <ul className="flex flex-col gap-2 pb-2">
        {TEMPLATES.map((t) => (
          <li key={t.id} className="rounded-2xl border border-line/60 bg-surface-2/50 p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t.name}</p>
                <p className="mt-0.5 text-sm text-muted">{t.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{t.daysPerWeek} days/wk</Badge>
                  <Badge>{t.level}</Badge>
                  <Badge>{t.goal}</Badge>
                </div>
                <p className="mt-2 text-xs text-faint">{t.routines.map((r) => r.name).join(' · ')}</p>
              </div>
              <Button variant="primary" size="sm" loading={busy === t.id} disabled={!!busy} onClick={() => void add(t.id)}>
                Add
              </Button>
            </div>
          </li>
        ))}
        {TEMPLATES.length === 0 && <p className="py-6 text-center text-sm text-muted">No templates available.</p>}
      </ul>
    </Sheet>
  );
}

export function RoutinesSection() {
  const { data: routines, isPending } = useRoutines();
  const lookup = useExerciseLookup();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(false);

  const move = async (index: number, delta: -1 | 1) => {
    if (!routines) return;
    const next = routines.slice();
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    const prev = routines;
    qc.setQueryData<Routine[]>(qk.routines, next.map((r, i) => ({ ...r, position: i })));
    try {
      const saved = await api.reorderRoutines(next.map((r) => r.id));
      qc.setQueryData(qk.routines, saved);
      void qc.invalidateQueries({ queryKey: qk.plan });
    } catch (e) {
      qc.setQueryData(qk.routines, prev);
      toast.error(errorMessage(e, 'Could not reorder'));
    }
  };

  return (
    <>
      {isPending ? (
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      ) : !routines || routines.length === 0 ? (
        <Card className="p-2">
          <EmptyState title="No routines yet" body="Start from a proven template or build your own." />
        </Card>
      ) : (
        <Card as="div" className="divide-y divide-line/60 overflow-hidden">
          <ol aria-label="Routines (in rotation order)">
            {routines.map((r, i) => (
              <li key={r.id} className="flex items-center gap-1 py-1 pr-1 pl-1">
                <button
                  type="button"
                  onClick={() => navigate(`/routines/${r.id}`)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left active:bg-surface-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {r.items.length ? r.items.map((it) => lookup.name(it.exerciseId)).join(', ') : 'No exercises'}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0">
                  <IconButton label={`Move ${r.name} up`} tone="muted" disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton label={`Move ${r.name} down`} tone="muted" disabled={i === routines.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown className="size-4" aria-hidden />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<Plus className="size-5" aria-hidden />} onClick={() => navigate('/routines/new')}>
          New routine
        </Button>
        <Button variant="secondary" icon={<LayoutTemplate className="size-5" aria-hidden />} onClick={() => setTemplates(true)}>
          From template
        </Button>
      </div>
      <TemplateSheet open={templates} onClose={() => setTemplates(false)} />
    </>
  );
}
