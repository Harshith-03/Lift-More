import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readString, STORAGE_KEYS, writeString } from './storage';

// ───────────── online / offline ─────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

// ───────────── ticking clock ─────────────

/** Current time, re-rendering every `intervalMs` while `active`. */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

// ───────────── Screen Wake Lock ─────────────

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  released: boolean;
}

/** Keep the screen on while `active` (feature-detected; re-acquired when the tab becomes visible). */
export function useWakeLock(active: boolean): void {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!active || !wl) return;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const s = await wl.request('screen');
        if (cancelled) void s.release();
        else sentinel.current = s;
      } catch {
        /* denied (battery saver, iframe, …) — not critical */
      }
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    };
  }, [active]);
}

// ───────────── theme ─────────────

export type Theme = 'dark' | 'light';
const themeListeners = new Set<() => void>();

export function getTheme(): Theme {
  return readString(STORAGE_KEYS.theme) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6f1' : '#0b0d0a');
}

export function setTheme(theme: Theme): void {
  writeString(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
  for (const l of themeListeners) l();
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    getTheme,
    () => 'dark' as Theme,
  );
  return [theme, setTheme];
}

// ───────────── misc ─────────────

/** Countdown in whole seconds to `untilMs` (null when not counting). */
export function useCountdown(untilMs: number | null): number {
  const now = useNow(1000, untilMs != null);
  return untilMs == null ? 0 : Math.max(0, Math.ceil((untilMs - now) / 1000));
}
