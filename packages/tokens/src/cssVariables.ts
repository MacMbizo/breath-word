// D1 Acceptance: tokens must also emit CSS custom properties for the Tauri/Web
// (Tailwind) surface. Produces a flat map of `--bw-*` variables for one theme.

import {
  COLORS,
  INDUCTIVE_SYMBOLS,
  inductiveCssVariable,
  inductiveWash,
  type ColorTheme,
  type ThemeName,
} from './colors';

export function themeToCssVariables(theme: ThemeName): Record<string, string> {
  const t = COLORS[theme];
  return {
    '--bw-bg-canvas': t.bg.canvas,
    '--bw-bg-surface': t.bg.surface,
    '--bw-bg-elevated': t.bg.elevated,
    '--bw-text-primary': t.text.primary,
    '--bw-text-secondary': t.text.secondary,
    '--bw-text-verse-num': t.text.verseNum,
    '--bw-text-red-letter': t.text.redLetter,
    '--bw-accent-primary': t.accent.primary,
    '--bw-accent-breath-glow': t.accent.breathGlow,
    '--bw-border-subtle': t.border.subtle,
    // D1 §4.3 inductive highlight washes, resolved for this theme's light/dark canvas.
    ...Object.fromEntries(INDUCTIVE_SYMBOLS.map((symbol) => [inductiveCssVariable(symbol), inductiveWash(symbol, theme)])),
  };
}

export type { ColorTheme, ThemeName };
