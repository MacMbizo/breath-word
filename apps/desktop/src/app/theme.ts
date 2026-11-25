// D1 tokens -> CSS custom properties for the Tailwind surface (AGENTS.md rule 6).
// Colours come from `themeToCssVariables`; fonts from `FONT_FAMILIES`; spacing/radii
// from `SPACING`/`RADII`. Nothing here hard-codes a value.

import {
  FONT_FAMILIES,
  RADII,
  SPACING,
  themeToCssVariables,
  type ThemeName,
} from '@breath-and-word/tokens';

export const DEFAULT_THEME: ThemeName = 'parchment';

/** The four D1 §4.2 Sacred Editorial Calm themes, in toggle order. */
export const THEMES: readonly ThemeName[] = ['daylight', 'parchment', 'midnight', 'sanctuary'];

/** Write one theme's colours plus the shared font/spacing/radius scales onto a root element. */
export function applyTheme(theme: ThemeName, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty('--bw-font-scripture', FONT_FAMILIES.scriptureSerif);
  root.style.setProperty('--bw-font-ui', FONT_FAMILIES.ui);
  root.style.setProperty('--bw-font-hebrew', FONT_FAMILIES.hebrew);
  root.style.setProperty('--bw-font-greek', FONT_FAMILIES.greek);
  for (const [key, value] of Object.entries(SPACING)) {
    root.style.setProperty(`--bw-space-${key}`, `${value}px`);
  }
  for (const [key, value] of Object.entries(RADII)) {
    root.style.setProperty(`--bw-radius-${key}`, `${value}px`);
  }
}
