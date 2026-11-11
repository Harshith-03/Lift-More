/**
 * The live workout draft, persisted to localStorage on every change so it survives reloads,
 * tab kills and offline sessions. Shared by the logger, Home (resume banner) and the tab layout.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { readJSON, removeKey, STORAGE_KEYS, writeJSON } from '../../lib/storage';
import { DRAFT_VERSION, draftReducer, type DraftAction, type WorkoutDraft } from './draftReducer';

type Listener = () => void;

function isDraft(x: unknown): x is WorkoutDraft {
  const d = x as WorkoutDraft | null;
  return !!d && d.v === DRAFT_VERSION && typeof d.id === 'string' && Array.isArray(d.exercises);
}

let current: WorkoutDraft | null = null;
let loaded = false;
const listeners = new Set<Listener>();

function load(): WorkoutDraft | null {
  if (!loaded) {
    const raw = readJSON<unknown>(STORAGE_KEYS.activeWorkout, null);
    current = isDraft(raw) ? raw : null;
    loaded = true;
  }
  return current;
}

function emit() {
  for (const l of listeners) l();
}

function persist() {
  if (current) writeJSON(STORAGE_KEYS.activeWorkout, current);
  else removeKey(STORAGE_KEYS.activeWorkout);
}

if (typeof window !== 'undefined') {
  // keep several open tabs in sync
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEYS.activeWorkout) return;
    loaded = false;
    load();
    emit();
  });
}

export const draftStore = {
  get: load,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  start(draft: WorkoutDraft) {
    current = { ...draft, mode: 'live' };
    loaded = true;
    persist();
    emit();
  },
  dispatch(action: DraftAction) {
    const prev = load();
    if (!prev) return;
    const next = draftReducer(prev, action);
    if (next === prev) return;
    current = next;
    persist();
    emit();
  },
  clear() {
    current = null;
    loaded = true;
    persist();
    emit();
  },
};

/** The live draft for this user (drafts of other accounts on this device are ignored). */
export function useLiveDraft(userId: string | undefined): WorkoutDraft | null {
  const d = useSyncExternalStore(draftStore.subscribe, draftStore.get, () => null);
  return d && (!userId || d.userId === userId) ? d : null;
}

export function useDraftDispatch(): (a: DraftAction) => void {
  return useCallback((a: DraftAction) => draftStore.dispatch(a), []);
}
