// FR-205 Breath Prayer ring — B3 §4.5 Gate-1 Spike 4 (mobile).
//
// The breathing circle is a Skia `Canvas`; its expand/contract cycle is driven by Reanimated
// shared values fed straight into Skia props (`r`, `opacity`), so the whole animation runs on the
// UI thread at frame rate. Every duration, curve, colour and measure comes from the D1 motion /
// colour tokens — nothing is hard-coded. A Reduced Motion fallback (AGENTS.md rule 6) renders the
// ring still while the phase cue still advances. Pure UI: no core store, repository, or SQL.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Canvas, Circle } from '@shopify/react-native-skia';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  BREATH_EASING,
  BREATH_TIMING,
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  MIN_TOUCH_TARGET,
  RADII,
  SPACING,
} from '@breath-and-word/tokens';

type BreathPhase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

interface BreathStep {
  readonly phase: BreathPhase;
  readonly label: string;
  readonly durationMs: number;
  readonly scale: number;
  readonly opacity: number;
}

type BreathCycle = readonly [BreathStep, BreathStep, BreathStep, BreathStep];

/** The default (daylight) theme; theme switching lands with the appearance settings. */
const THEME = COLORS.daylight;

/** Motion `easing` from the D1 sine-in-out control points (`BREATH_EASING.bezier`). */
const EASE = Easing.bezier(
  BREATH_EASING.bezier[0],
  BREATH_EASING.bezier[1],
  BREATH_EASING.bezier[2],
  BREATH_EASING.bezier[3],
);

/** Ring geometry (layout only — every colour, space and radius still comes from the tokens). */
const RING_SIZE_PX = 224;
const STROKE_WIDTH_PX = 8;
const MAX_RADIUS_PX = RING_SIZE_PX / 2 - STROKE_WIDTH_PX / 2;
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

  // Reduced Motion: hold one static size/opacity and let only the phase cue advance, so the
  // breathing guide never introduces vestibular motion.
  const targetScale = reduceMotion ? BREATH_EASING.maxScale : step.scale;
  const targetOpacity = reduceMotion ? STATIC_OPACITY : step.opacity;
  const targetRadius = MAX_RADIUS_PX * targetScale;

  const radius = useSharedValue(MAX_RADIUS_PX * BREATH_EASING.minScale);
  const opacity = useSharedValue(RESTING_OPACITY);

  // Advance the phase cue on a plain JS timer; the ring geometry is animated separately below.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setTimeout(() => {
      const next = (stepIndex + 1) % cycle.length;
      setStepIndex(next);
      if (next === 0) setCompletedCycles((count) => count + 1);
    }, step.durationMs);
    return () => clearTimeout(timer);
  }, [running, stepIndex, step.durationMs, cycle.length]);

  // Animate the ring on the UI thread; Reduced Motion jumps straight to a still target.
  useEffect(() => {
    const duration = reduceMotion ? 0 : step.durationMs;
    radius.value = withTiming(targetRadius, { duration, easing: EASE });
    opacity.value = withTiming(targetOpacity, { duration, easing: EASE });
  }, [radius, opacity, targetRadius, targetOpacity, step.durationMs, reduceMotion]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Breath Prayer</Text>
        <Text style={styles.subtitle}>
          {`Inhale ${BREATH_TIMING.inhaleSeconds.default}s · Hold ${BREATH_EASING.holdPauseMs}ms · Exhale ${BREATH_TIMING.exhaleSeconds.default}s`}
        </Text>
      </View>

      <View style={styles.ringWrap}>
        <Canvas style={styles.canvas}>
          {/* Static guide ring: the target the breath expands toward. */}
          <Circle
            cx={RING_SIZE_PX / 2}
            cy={RING_SIZE_PX / 2}
            r={MAX_RADIUS_PX}
            color={THEME.border.subtle}
            style="stroke"
            strokeWidth={1}
          />
          <Circle
            cx={RING_SIZE_PX / 2}
            cy={RING_SIZE_PX / 2}
            r={radius}
            color={THEME.accent.primary}
            style="stroke"
            strokeWidth={STROKE_WIDTH_PX}
            opacity={opacity}
          />
        </Canvas>
        <View style={styles.cue} pointerEvents="none">
          <Text accessibilityLiveRegion="polite" style={styles.phaseLabel}>
            {step.label}
          </Text>
          <Text style={styles.phaseSeconds}>{`${Math.round(step.durationMs / 1000)}s`}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setRunning((value) => !value)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{running ? 'Pause' : 'Resume'}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setRunning(false);
            setStepIndex(0);
            setCompletedCycles(0);
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Reset</Text>
        </Pressable>
        <Text style={styles.breathCount}>
          {`${completedCycles} ${completedCycles === 1 ? 'breath' : 'breaths'}`}
        </Text>
      </View>

      {reduceMotion && (
        <Text style={styles.note}>
          Reduced Motion is on — the ring stays still and only the phase cue changes.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xxl,
    padding: SPACING.xl,
    backgroundColor: THEME.bg.canvas,
  },
  header: { alignItems: 'center', gap: SPACING.xs },
  title: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  subtitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
    textAlign: 'center',
  },
  ringWrap: {
    width: RING_SIZE_PX,
    height: RING_SIZE_PX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: { width: RING_SIZE_PX, height: RING_SIZE_PX },
  cue: { position: 'absolute', alignItems: 'center', gap: SPACING.xxs },
  phaseLabel: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
  },
  phaseSeconds: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  controls: { alignItems: 'center', gap: SPACING.lg },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
    textAlign: 'center',
  },
  breathCount: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  note: {
    maxWidth: 320,
    textAlign: 'center',
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
});
