/**
 * Storage-backed outbox + background sync: retries on the `online` event, on app start,
 * when the tab becomes visible, and on an exponential-backoff timer.
 */
import { useSyncExternalStore } from 'react';
import type { Workout } from '../../../../shared/types';
import { api } from '../../lib/api';
import { readJSON, STORAGE_KEYS, writeJSON } from '../../lib/storage';
import {
  enqueue,
  flushOutbox,
  nextDueAt,
  removeEntry,
  type FlushReport,
  type OutboxEntry,
} from './outbox';

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: OutboxEntry[] = readJSON<OutboxEntry[]>(STORAGE_KEYS.outbox, []);
if (!Array.isArray(snapshot)) snapshot = [];

function load(): OutboxEntry[] {
  const raw = readJSON<OutboxEntry[]>(STORAGE_KEYS.outbox, []);
  return Array.isArray(raw) ? raw : [];
}

function save(entries: OutboxEntry[]) {
  writeJSON(STORAGE_KEYS.outbox, entries);
  snapshot = entries;
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEYS.outbox) return;
    snapshot = load();
    for (const l of listeners) l();
  });
}

export const outboxStore = {
  get: () => snapshot,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  add(workout: Workout, userId: string) {
    save(enqueue(load(), workout, userId, Date.now()));
    scheduleSoon();
  },
  discard(id: string) {
    save(removeEntry(load(), id));
  },
  /** Make a stuck entry retryable again and flush now. */
  retry(id: string) {
    save(load().map((e) => (e.id === id ? { ...e, stuck: false, nextAttemptAt: Date.now() } : e)));
    void syncNow({ force: true });
  },
};

export function useOutbox(userId: string | undefined): OutboxEntry[] {
  const all = useSyncExternalStore(outboxStore.subscribe, outboxStore.get, () => snapshot);
  return userId ? all.filter((e) => e.userId === userId) : all;
}

// ───────────── background sync ─────────────

interface SyncConfig {
  getUserId: () => string | null;
  onReport: (r: FlushReport) => void;
}

let config: SyncConfig | null = null;
let inflight: Promise<FlushReport | null> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function syncNow(opts: { force?: boolean } = {}): Promise<FlushReport | null> {
  if (!config) return Promise.resolve(null);
  if (inflight) return inflight;
  const cfg = config;
  const userId = cfg.getUserId();
  if (!userId) return Promise.resolve(null);
  inflight = flushOutbox({ load, save, send: (w) => api.putWorkout(w), now: () => Date.now(), userId }, opts)
    .then((report) => {
      if (report.sent.length || report.failed || report.unauthorized) cfg.onReport(report);
      return report;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
      schedule();
    });
  return inflight;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!config) return;
  const at = nextDueAt(load(), config.getUserId());
  if (at === null) return;
  const delay = Math.max(1000, at - Date.now());
  timer = setTimeout(() => void syncNow(), delay);
}

function scheduleSoon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 1000);
}

/** Start background sync once per app; returns a stop function. */
export function startOutboxSync(cfg: SyncConfig): () => void {
  config = cfg;
  const onOnline = () => void syncNow({ force: true });
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  void syncNow({ force: true }); // app start
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (timer) clearTimeout(timer);
    timer = null;
    config = null;
  };
}
