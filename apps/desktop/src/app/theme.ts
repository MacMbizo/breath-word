// D1 tokens -> CSS custom properties for the Tailwind surface (AGENTS.md rule 6).
// Colours come from `themeToCssVariables`; fonts from `FONT_FAMILIES`; spacing/radii
// from `SPACING`/`RADII`. Nothing here hard-codes a value.

import {
  DEFAULT_THEME,
  FONT_FAMILIES,
  FONT_SIZES,
  RADII,
  SPACING,
  THEME_NAMES,
  themeToCssVariables,
  type ThemeName,
} from '@breath-and-word/tokens';

export { DEFAULT_THEME };

/** The three D1 §4.2 themes (Parchment · Selah · Lamplight), in picker order. */
export const THEMES: readonly ThemeName[] = THEME_NAMES;

/** Write one theme's colours plus the shared font/spacing/radius scales onto a root element. */
export function applyTheme(theme: ThemeName, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty('--bw-font-scripture', FONT_FAMILIES.scriptureSerif);
  root.style.setProperty('--bw-font-ui', FONT_FAMILIES.ui);
  root.style.setProperty('--bw-font-display', FONT_FAMILIES.display);
  root.style.colorScheme = themeToCssVariables(theme)['--bw-color-scheme'] ?? 'light';
  root.style.setProperty('--bw-font-hebrew', FONT_FAMILIES.hebrew);
  root.style.setProperty('--bw-font-greek', FONT_FAMILIES.greek);
  for (const [key, value] of Object.entries(FONT_SIZES)) {
    root.style.setProperty(`--bw-font-size-${key}`, `${value}px`);
  }
  for (const [key, value] of Object.entries(SPACING)) {
    root.style.setProperty(`--bw-space-${key}`, `${value}px`);
  }
  for (const [key, value] of Object.entries(RADII)) {
    root.style.setProperty(`--bw-radius-${key}`, `${value}px`);
  }
}
