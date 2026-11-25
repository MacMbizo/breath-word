// D1 §4.5 — Shared animation & spring physics for 120Hz flows
// (consumed by react-native-reanimated on mobile, `motion` on desktop/web).

export const MOTION_SPRINGS = {
  /** Tap-to-Capture floating bar, popover reveals. */
  snappy: { stiffness: 420, damping: 32, mass: 0.8 },
  /** Bottom sheets, morphology drawer, parallel compare. */
  sheet: { stiffness: 300, damping: 34, mass: 1.0 },
  /** Prayer Deck card swipe settle, Focus Mode chrome fade. */
  gentle: { stiffness: 180, damping: 26, mass: 1.0 },
} as const;

export const BREATH_EASING = {
  /** Smooth sine-in-out curve for 120Hz inhale (2-4s) and exhale (4-6s) expansion. */
  bezier: [0.37, 0, 0.63, 1] as const,
  minScale: 0.62,
  maxScale: 1.0,
  holdPauseMs: 400,
} as const;

/** Breath Prayer inhale/exhale bounds in seconds (FR-205). */
export const BREATH_TIMING = {
  inhaleSeconds: { min: 2, max: 4, default: 4 },
  exhaleSeconds: { min: 4, max: 6, default: 6 },
} as const;

export type SpringPresetName = keyof typeof MOTION_SPRINGS;
export type MotionSpring = (typeof MOTION_SPRINGS)[SpringPresetName];
