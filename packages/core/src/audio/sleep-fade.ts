// FR-106 — smooth sleep-timer fade-out, shared by every platform's `AudioEngineAdapter`.
//
// Adapters stay thin: they arm one timer, sample `sleepFadeGain` on a short interval and multiply it
// into the narration and ambient volumes, then pause at the end. Keeping the curve here means mobile
// and desktop fade identically and the shape is unit-tested once.

/** Length of the fade before the sleep timer pauses playback. */
export const SLEEP_FADE_MS = 30_000;

/** How often adapters re-sample the gain while fading (a 4 Hz step is inaudible on a 30 s ramp). */
export const SLEEP_FADE_STEP_MS = 250;

/**
 * Gain multiplier (0..1) at `elapsedMs` after a sleep timer of `timerMs` was armed. Full volume until
 * the last `fadeMs`, then an equal-power (cosine) ramp to silence so the drop feels even to the ear.
 * Shorter timers fade across their whole length.
 */
export function sleepFadeGain(elapsedMs: number, timerMs: number, fadeMs: number = SLEEP_FADE_MS): number {
  if (!(timerMs > 0) || elapsedMs >= timerMs) return 0;
  if (elapsedMs <= 0) return 1;
  const fade = Math.min(Math.max(fadeMs, 0), timerMs);
  const fadeStart = timerMs - fade;
  if (elapsedMs <= fadeStart || fade === 0) return 1;
  const progress = (elapsedMs - fadeStart) / fade;
  return Math.cos((progress * Math.PI) / 2);
}
