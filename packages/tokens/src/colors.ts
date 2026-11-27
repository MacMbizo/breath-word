// D1 §4.2 — Four semantic themes ("Sacred Editorial Calm").
// No hard-coded hex values may appear in UI components; import from here.

export type ThemeName = 'daylight' | 'parchment' | 'midnight' | 'sanctuary';

export interface ColorTheme {
  readonly bg: {
    readonly canvas: string;
    readonly surface: string;
    readonly elevated: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly verseNum: string;
    readonly redLetter: string;
  };
  readonly accent: {
    readonly primary: string;
    readonly breathGlow: string;
  };
  readonly border: {
    readonly subtle: string;
  };
}

export const COLORS: Record<ThemeName, ColorTheme> = {
  daylight: {
    bg: { canvas: '#FAF9F6', surface: '#FFFFFF', elevated: '#F2EFE9' },
    text: {
      primary: '#1C1917',
      secondary: '#57534E',
      verseNum: '#A8A29E',
      redLetter: '#991B1B',
    },
    accent: { primary: '#2B5B6C', breathGlow: '#3B82F6' },
    border: { subtle: '#E7E5E4' },
  },
  parchment: {
    bg: { canvas: '#F5EFE4', surface: '#FBF7F0', elevated: '#EAE0CE' },
    text: {
      primary: '#2B2118',
      secondary: '#6B5B4B',
      verseNum: '#9C8873',
      redLetter: '#8F2424',
    },
    accent: { primary: '#7C4D2B', breathGlow: '#B45309' },
    border: { subtle: '#DFD3BE' },
  },
  midnight: {
    bg: { canvas: '#0F1115', surface: '#171A21', elevated: '#202530' },
    text: {
      primary: '#E8E6E1',
      secondary: '#9CA3AF',
      verseNum: '#64748B',
      redLetter: '#F87171',
    },
    accent: { primary: '#60A5FA', breathGlow: '#38BDF8' },
    border: { subtle: '#262B36' },
  },
  sanctuary: {
    bg: { canvas: '#090D16', surface: '#111827', elevated: '#1B2436' },
    text: {
      primary: '#EDF2F7',
      secondary: '#94A3B8',
      verseNum: '#64748B',
      redLetter: '#FCA5A5',
    },
    accent: { primary: '#818CF8', breathGlow: '#6366F1' },
    border: { subtle: '#1E293B' },
  },
};

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
export const DARK_THEMES: readonly ThemeName[] = ['midnight', 'sanctuary'];

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
