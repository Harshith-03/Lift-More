import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import type { ExportBundle } from '../../../../shared/types';
import { api, errorMessage } from '../../lib/api';
import { plural } from '../../lib/format';
import { Card, ListButton } from '../../components/ui';
import { useConfirm, useToast } from '../../components/feedback';

function isBundle(x: unknown): x is ExportBundle {
  const b = x as ExportBundle;
  return !!b && b.version === 1 && Array.isArray(b.workouts) && Array.isArray(b.routines) && Array.isArray(b.customExercises) && Array.isArray(b.bodyweight);
}

export function DataSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      const bundle = await api.exportData();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lift-more-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Exported ${plural(bundle.workouts.length, 'workout')}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    let bundle: unknown;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      toast.error('That file isn’t valid JSON.');
      return;
    }
    if (!isBundle(bundle)) {
      toast.error('That doesn’t look like a Lift More export (version 1).');
      return;
    }
    const ok = await confirm({
      title: 'Import this backup?',
      message: `${plural(bundle.workouts.length, 'workout')}, ${plural(bundle.routines.length, 'routine')}, ${plural(bundle.customExercises.length, 'custom exercise')} and ${plural(bundle.bodyweight.length, 'bodyweight entry', 'bodyweight entries')}. Items with the same id are updated; nothing is deleted.`,
      confirmLabel: 'Import',
    });
    if (!ok) return;
    setBusy('import');
    try {
      const r = await api.importData(bundle);
      await qc.invalidateQueries();
      toast.success(`Imported ${plural(r.workouts, 'workout')} and ${plural(r.routines, 'routine')}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Import failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card as="div" className="p-1.5">
      <ListButton
        icon={<Download className="size-5" />}
        label="Export data"
        description="Download everything as JSON"
        disabled={busy !== null}
        aria-busy={busy === 'export' || undefined}
        onClick={() => void doExport()}
      />
      <ListButton
        icon={<Upload className="size-5" />}
        label="Import data"
        description="Restore from a Lift More export"
        disabled={busy !== null}
        aria-busy={busy === 'import' || undefined}
        onClick={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void doImport(f);
        }}
      />
    </Card>
  );
}
