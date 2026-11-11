/** Rest-timer alerts: a short WebAudio beep + vibration. Audio is unlocked on a user gesture (✓ tap). */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a click/tap handler so later beeps are allowed by autoplay policies. */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

export function beep(): void {
  const c = audioContext();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const t0 = c.currentTime + 0.01;
    // two short rising tones
    [
      { f: 880, at: 0 },
      { f: 1320, at: 0.18 },
    ].forEach(({ f, at }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.16);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.18);
    });
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

export function restDoneAlert(): void {
  vibrate();
  beep();
}
