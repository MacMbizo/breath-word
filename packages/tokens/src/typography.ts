// D1 §4.4 — Typography & original-language font stack.

export const FONT_FAMILIES = {
  /** Scripture body serif (toggleable to sans). */
  scriptureSerif: 'Literata',
  scriptureSans: 'Inter',
  /** UI chrome & controls. */
  ui: 'Inter',
  /** Original-language stacks (bundled assets). */
  hebrew: 'SBL Hebrew',
  greek: 'Gentium Plus',
} as const;

export const FONT_SIZES = {
  uiXs: 12,
  uiSm: 14,
  uiMd: 16,
  uiLg: 20,
  scriptureMin: 16,
  scriptureDefault: 19,
  scriptureMax: 28,
} as const;

export const LINE_HEIGHTS = {
  scripture: 1.72,
  heading: 1.35,
  ui: 1.4,
  hebrew: 1.9,
  greek: 1.75,
} as const;

export const SCRIPTURE_METRICS = {
  /** 60–68ch centered measure on iPad/Desktop (D1 §4.1). */
  optimalMeasureCh: { min: 60, max: 68 },
  headingMarginTop: 24,
  headingMarginBottom: 8,
  headingScale: 1.15,
  hebrewScale: 1.35,
  greekScale: 1.15,
} as const;
