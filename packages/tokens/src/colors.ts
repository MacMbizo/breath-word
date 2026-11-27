// D1 §4.2 — Three semantic themes ("Sacred Editorial Calm", design round 2026-11-28).
// No hard-coded hex values may appear in UI components; import from here.
//
//   parchment — warm day page (Vellum): deep-red rubrics, sage for anything tappable.
//   selah     — the calm theme: cool off-white, more air, sage rubrics.
//   lamplight — night study: warm black, amber for anything tappable, coral rubrics.
//
// Every theme carries the same colour ROLES, so a screen never asks "which theme am I in":
//   accent.primary  — the one interactive colour (active tab, primary button, focus ring)
//   accent.wash     — background of a tapped / selected word; accent.onWash is its text
//   accent.rubric   — decorative rubrics only: chapter numeral, the wordmark "&"
//   text.redLetter  — words of Christ
//   nav.*           — the floating pill navigation (mobile) and its active segment

export type ThemeName = 'parchment' | 'selah' | 'lamplight';

export interface ColorTheme {
  readonly bg: {
    /** Page background. */
    readonly canvas: string;
    /** Cards, sheets, the floating study panel. */
    readonly surface: string;
    /** Chips, passage pill, secondary buttons. */
    readonly elevated: string;
    /** Segmented-control track, recessed wells. */
    readonly sunken: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly verseNum: string;
    readonly redLetter: string;
    /** Text on an `accent.primary` fill. */
    readonly onAccent: string;
  };
  readonly accent: {
    readonly primary: string;
    readonly wash: string;
    readonly onWash: string;
    readonly rubric: string;
    readonly breathGlow: string;
  };
  readonly border: {
    readonly subtle: string;
    readonly strong: string;
  };
  readonly nav: {
    readonly bg: string;
    readonly icon: string;
    readonly activeBg: string;
    readonly activeIcon: string;
  };
  /** Base colour for drop shadows (alpha is applied by the platform). */
  readonly shadow: string;
}

export const COLORS: Record<ThemeName, ColorTheme> = {
  parchment: {
    bg: { canvas: '#F4EEE3', surface: '#FBF8F2', elevated: '#EBE2D3', sunken: '#EFE7DA' },
    text: {
      primary: '#2A211A',
      secondary: '#6B5A49',
      verseNum: '#7A2E24',
      redLetter: '#8C2B20',
      onAccent: '#FFFFFF',
    },
    accent: { primary: '#3E6B5E', wash: '#D6E3DC', onWash: '#1F3A32', rubric: '#7A2E24', breathGlow: '#5E8A7C' },
    border: { subtle: '#DCCFB9', strong: '#C9B79C' },
    nav: { bg: '#2A211A', icon: '#D9CCB6', activeBg: '#3E6B5E', activeIcon: '#FFFFFF' },
    shadow: '#2A211A',
  },
  selah: {
    bg: { canvas: '#F7F7F4', surface: '#FFFFFF', elevated: '#ECEEE9', sunken: '#F0F2EE' },
    text: {
      primary: '#1E2320',
      secondary: '#5D6660',
      verseNum: '#5F6B65',
      redLetter: '#9A3B2E',
      onAccent: '#FFFFFF',
    },
    accent: { primary: '#3E6B5E', wash: '#D6E6DF', onWash: '#1F3A32', rubric: '#3E6B5E', breathGlow: '#7FA89A' },
    border: { subtle: '#E2E5E1', strong: '#CBD1CC' },
    nav: { bg: '#1E2320', icon: '#C9D3CE', activeBg: '#3E6B5E', activeIcon: '#FFFFFF' },
    shadow: '#1E2320',
  },
  lamplight: {
    bg: { canvas: '#12100E', surface: '#1F1B17', elevated: '#2A2520', sunken: '#15120F' },
    text: {
      primary: '#EDE6DA',
      secondary: '#A89D8E',
      verseNum: '#E8806B',
      redLetter: '#E8806B',
      onAccent: '#12100E',
    },
    accent: { primary: '#E0A458', wash: '#E0A458', onWash: '#12100E', rubric: '#E8806B', breathGlow: '#E0A458' },
    border: { subtle: '#2B2621', strong: '#3A332B' },
    nav: { bg: '#2A2520', icon: '#C9BEAF', activeBg: '#E0A458', activeIcon: '#12100E' },
    shadow: '#000000',
  },
};

/** All themes in picker order (D1 §4.2). */
export const THEME_NAMES: readonly ThemeName[] = ['parchment', 'selah', 'lamplight'];

/** Human-readable theme names for pickers. */
export const THEME_LABELS: Record<ThemeName, string> = {
  parchment: 'Parchment',
  selah: 'Selah',
  lamplight: 'Lamplight',
};

/** The theme new installs start in: the calm one. */
export const DEFAULT_THEME: ThemeName = 'selah';

/** True for a stored value that names a current theme (older installs may hold retired names). */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_NAMES as readonly string[]).includes(value);
}

export type InductiveSymbol = 'KEY_TERM' | 'GOD_REF' | 'TRANSITION' | 'PROMISE' | 'COMMAND';

export interface InductiveHighlight {
  readonly meaning: string;
  readonly lightWash: string;
  readonly lightAlpha: number;
  readonly darkWash: string;
  readonly darkAlpha: number;
  readonly badge: string;
}

// D1 §4.3 — Inductive Observation highlight palette (WCAG AA safe over all 4 themes).
export const INDUCTIVE_HIGHLIGHTS: Record<InductiveSymbol, InductiveHighlight> = {
  KEY_TERM: {
    meaning: 'Repeated theme/word',
    lightWash: '#FEF08A',
    lightAlpha: 0.45,
    darkWash: '#CA8A04',
    darkAlpha: 0.32,
    badge: '◇',
  },
  GOD_REF: {
    meaning: 'Father / Christ / Spirit',
    lightWash: '#DDD6FE',
    lightAlpha: 0.5,
    darkWash: '#7C3AED',
    darkAlpha: 0.32,
    badge: '△',
  },
  TRANSITION: {
    meaning: 'Therefore, because, but',
    lightWash: '#BBF7D0',
    lightAlpha: 0.48,
    darkWash: '#16A34A',
    darkAlpha: 0.3,
    badge: '↳',
  },
  PROMISE: {
    meaning: 'Covenant / assurance',
    lightWash: '#BAE6FD',
    lightAlpha: 0.48,
    darkWash: '#0284C7',
    darkAlpha: 0.32,
    badge: '✦',
  },
  COMMAND: {
    meaning: 'Imperative / obedience',
    lightWash: '#FECACA',
    lightAlpha: 0.48,
    darkWash: '#DC2626',
    darkAlpha: 0.3,
    badge: '✓',
  },
};

/** Display order of the inductive symbols in toolbars and legends (D1 §4.3). */
export const INDUCTIVE_SYMBOLS: readonly InductiveSymbol[] = ['KEY_TERM', 'GOD_REF', 'TRANSITION', 'PROMISE', 'COMMAND'];

/** Themes whose canvas is dark, so highlight washes use the deeper `darkWash` at its own alpha. */
export const DARK_THEMES: readonly ThemeName[] = ['lamplight'];

export function isDarkTheme(theme: ThemeName): boolean {
  return DARK_THEMES.includes(theme);
}

/** `#RRGGBB` + alpha → `rgba(r, g, b, a)`; the only colour maths the UI needs for washes. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Translucent background wash for an inductive highlight in the given theme (D1 §4.3). */
export function inductiveWash(symbol: InductiveSymbol, theme: ThemeName): string {
  const h = INDUCTIVE_HIGHLIGHTS[symbol];
  return isDarkTheme(theme) ? hexWithAlpha(h.darkWash, h.darkAlpha) : hexWithAlpha(h.lightWash, h.lightAlpha);
}

/** CSS custom-property name carrying a symbol's wash, e.g. `--bw-inductive-key-term`. */
export function inductiveCssVariable(symbol: InductiveSymbol): string {
  return `--bw-inductive-${symbol.toLowerCase().replace(/_/g, '-')}`;
}
