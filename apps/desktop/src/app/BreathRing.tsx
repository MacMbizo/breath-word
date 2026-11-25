// FR-205 Breath Prayer ring — B3 §4.5 Gate-1 Spike 4.
// The breathing circle's expand/contract cycle is driven purely by the shared D1 motion
// tokens (`BREATH_TIMING` sustains, `BREATH_EASING` curve + scale bounds + hold pause).
// Only transform/opacity animate, so the compositor holds frame pacing at 120Hz, and a
// Reduced Motion fallback (AGENTS.md rule 6) renders the ring still while the phase cue
// still advances. Pure UI: no core store, repository, or SQL is involved.
import { useEffect, useMemo, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { BREATH_EASING, BREATH_TIMING } from '@breath-and-word/tokens';

type BreathPhase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

interface BreathStep {
  readonly phase: BreathPhase;
  readonly label: string;
  readonly durationMs: number;
  readonly scale: number;
  readonly opacity: number;
}

type BreathCycle = readonly [BreathStep, BreathStep, BreathStep, BreathStep];

/** Motion `ease` from the D1 sine-in-out control points (`BREATH_EASING.bezier`). */
const EASE: [number, number, number, number] = [
  BREATH_EASING.bezier[0],
  BREATH_EASING.bezier[1],
  BREATH_EASING.bezier[2],
  BREATH_EASING.bezier[3],
];

/** Ring geometry (layout only — every colour, space and radius still comes from the tokens). */
const RING_SIZE_PX = 224;
const EXPANDED_OPACITY = 0.9;
const RESTING_OPACITY = 0.35;
const STATIC_OPACITY = 0.6;

function buildBreathCycle(): BreathCycle {
  return [
    {
      phase: 'inhale',
      label: 'Breathe in',
      durationMs: BREATH_TIMING.inhaleSeconds.default * 1000,
      scale: BREATH_EASING.maxScale,
      opacity: EXPANDED_OPACITY,
    },
    {
      phase: 'hold-in',
      label: 'Hold',
      durationMs: BREATH_EASING.holdPauseMs,
      scale: BREATH_EASING.maxScale,
      opacity: EXPANDED_OPACITY,
    },
    {
      phase: 'exhale',
      label: 'Breathe out',
      durationMs: BREATH_TIMING.exhaleSeconds.default * 1000,
      scale: BREATH_EASING.minScale,
      opacity: RESTING_OPACITY,
    },
    {
      phase: 'hold-out',
      label: 'Rest',
      durationMs: BREATH_EASING.holdPauseMs,
      scale: BREATH_EASING.minScale,
      opacity: RESTING_OPACITY,
    },
  ];
}

export function BreathRing() {
  const reduceMotion = useReducedMotion() === true;
  const cycle = useMemo(buildBreathCycle, []);
  const [running, setRunning] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [completedCycles, setCompletedCycles] = useState(0);

  const step = cycle[stepIndex] ?? cycle[0];

  // Reduced Motion: hold one static size/opacity and let only the phase cue advance, so
  // the breathing guide never introduces vestibular motion.
  const targetScale = reduceMotion ? BREATH_EASING.maxScale : step.scale;
  const targetOpacity = reduceMotion ? STATIC_OPACITY : step.opacity;

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setTimeout(() => {
      const next = (stepIndex + 1) % cycle.length;
      setStepIndex(next);
      if (next === 0) setCompletedCycles((count) => count + 1);
    }, step.durationMs);
    return () => window.clearTimeout(timer);
  }, [running, stepIndex, step.durationMs, cycle.length]);

  return (
    <section className="flex h-full flex-col items-center justify-center gap-xl overflow-hidden">
      <header className="flex flex-col items-center gap-xs">
        <h2 className="font-ui text-uiLg text-ink-primary">Breath Prayer</h2>
        <p className="font-ui text-uiSm text-ink-secondary">
          {`Inhale ${BREATH_TIMING.inhaleSeconds.default}s · Hold ${BREATH_EASING.holdPauseMs}ms · Exhale ${BREATH_TIMING.exhaleSeconds.default}s`}
        </p>
      </header>

      <div
        className="relative flex items-center justify-center"
        style={{ width: RING_SIZE_PX, height: RING_SIZE_PX }}
      >
        {/* Static guide ring: the target the breath expands toward. */}
        <div className="absolute inset-0 rounded-full border border-hairline" />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-accent-breath"
          style={{ boxShadow: '0 0 80px var(--bw-accent-breath-glow)' }}
          initial={{ scale: BREATH_EASING.minScale, opacity: RESTING_OPACITY }}
          animate={{ scale: targetScale, opacity: targetOpacity }}
          transition={{ duration: reduceMotion ? 0 : step.durationMs / 1000, ease: EASE }}
        />
        <div className="flex flex-col items-center gap-xxs">
          <span aria-live="polite" className="font-ui text-uiMd font-medium text-ink-primary">
            {step.label}
          </span>
          <span className="font-ui text-uiXs text-ink-secondary">
            {`${Math.round(step.durationMs / 1000)}s`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-lg">
        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          className="rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90"
        >
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setStepIndex(0);
            setCompletedCycles(0);
          }}
          className="rounded-pill border border-hairline px-xl py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary"
        >
          Reset
        </button>
        <span className="font-ui text-uiSm text-ink-secondary">
          {`${completedCycles} ${completedCycles === 1 ? 'breath' : 'breaths'}`}
        </span>
      </div>

      {reduceMotion && (
        <p className="max-w-md text-center font-ui text-uiXs text-ink-secondary" role="note">
          Reduced Motion is on — the ring stays still and only the phase cue changes.
        </p>
      )}
    </section>
  );
}
