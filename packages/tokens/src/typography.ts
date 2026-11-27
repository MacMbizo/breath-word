// D1 §4.4 — Typography & original-language font stack (design round 2026-11-28).
//
// All five families are SIL Open Font License fonts bundled with the apps (never fetched at
// runtime): desktop via `@fontsource/*` CSS, mobile via `@expo-google-fonts/*` loaded at boot.
//
//   scripture — Literata        (body text of the Bible)
//   ui        — Inter           (controls, labels)
//   display   — Cormorant Garamond (chapter numerals, chapter titles, the wordmark)
//   greek     — Gentium Book Plus
//   hebrew    — Noto Serif Hebrew

export const FONT_FAMILIES = {
  /** Scripture body serif (toggleable to sans). */
  scriptureSerif: 'Literata',
  scriptureSans: 'Inter',
  /** UI chrome & controls. */
  ui: 'Inter',
  /** Chapter numerals, chapter titles, the "Breath & Word" wordmark. */
  display: 'Cormorant Garamond',
  /** Original-language stacks (bundled assets). */
  hebrew: 'Noto Serif Hebrew',
  greek: 'Gentium Book Plus',
} as const;

/**
 * Per-face family names for React Native, where a custom font is chosen by family NAME, not by
 * `fontWeight` (Android ignores the weight for an unknown family). The mobile app registers each
 * bundled font file under exactly these names at boot; desktop ignores this table.
 */
export const FONT_FACES = {
  scripture: { regular: 'Literata', italic: 'Literata-Italic', medium: 'Literata-Medium' },
  ui: { regular: 'Inter', medium: 'Inter-Medium', semibold: 'Inter-SemiBold' },
  display: { medium: 'Cormorant-Medium', semibold: 'Cormorant-SemiBold', italic: 'Cormorant-Italic' },
  greek: { regular: 'GentiumBookPlus', italic: 'GentiumBookPlus-Italic' },
  hebrew: { regular: 'NotoSerifHebrew' },
} as const;

export const FONT_SIZES = {
  uiXs: 12,
  uiSm: 14,
  uiMd: 16,
  uiLg: 20,
  scriptureMin: 16,
  scriptureDefault: 19,
  scriptureMax: 28,
  /** Chapter numeral beside the chapter title. */
  chapterNumeral: 58,
  chapterTitle: 21,
} as const;

export const LINE_HEIGHTS = {
  scripture: 1.72,
  /** The Selah theme reads with a little more air between lines. */
  scriptureCalm: 1.82,
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
