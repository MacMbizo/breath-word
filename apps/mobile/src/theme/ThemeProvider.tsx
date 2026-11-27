// D1 §4.2 — live theming for the mobile app (Parchment · Selah · Lamplight).
//
// The provider resolves the effective theme from the reader's saved appearance (core
// `appearance` store) and the device colour scheme ("Lamplight when the device is dark"), and
// hands screens `useTheme()` plus `makeStyles()`: a per-theme cached `StyleSheet`, so switching
// theme re-renders with new colours without rebuilding styles on every render.
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import {
  DEFAULT_APPEARANCE,
  type AppearancePreferences,
  type AppearanceStore,
} from '@breath-and-word/core';
import {
  COLORS,
  DEFAULT_THEME,
  FONT_FACES,
  FONT_SIZES,
  LINE_HEIGHTS,
  isDarkTheme,
  isThemeName,
  type ColorTheme,
  type ThemeName,
} from '@breath-and-word/tokens';

export interface AppTheme {
  /** The theme in effect right now (after "Lamplight when dark"). */
  readonly name: ThemeName;
  /** The theme the reader picked for daytime. */
  readonly chosen: ThemeName;
  readonly colors: ColorTheme;
  readonly dark: boolean;
  readonly fonts: typeof FONT_FACES;
  readonly scriptureSize: number;
  readonly scriptureLineHeight: number;
  readonly prefs: AppearancePreferences;
  /** Persist an appearance change (no-op before the core runtime has booted). */
  readonly update: (patch: Partial<AppearancePreferences>) => void;
  /** Cache key for styles that depend on theme + text size. */
  readonly key: string;
}

const ThemeContext = createContext<AppTheme | null>(null);

const NO_STORE = {
  subscribe: () => () => undefined,
  getState: () => ({ prefs: DEFAULT_APPEARANCE }),
};

/** Clamp a stored scripture size into the token range. */
function scriptureSizeOf(prefs: AppearancePreferences): number {
  const size = prefs.scriptureSize ?? FONT_SIZES.scriptureDefault;
  return Math.min(FONT_SIZES.scriptureMax, Math.max(FONT_SIZES.scriptureMin, Math.round(size)));
}

export function ThemeProvider({ store, children }: { store: AppearanceStore | null; children: ReactNode }) {
  const source = store ?? NO_STORE;
  const prefs = useSyncExternalStore(source.subscribe, () => source.getState().prefs, () => source.getState().prefs);
  const scheme = useColorScheme();
  // Stable across preference changes, so effects that save a preference never re-trigger themselves.
  const update = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      if (store !== null) void store.getState().update(patch);
    },
    [store],
  );

  const value = useMemo<AppTheme>(() => {
    const chosen: ThemeName = isThemeName(prefs.theme) ? prefs.theme : DEFAULT_THEME;
    const name: ThemeName = prefs.followSystemDark && scheme === 'dark' ? 'lamplight' : chosen;
    const scriptureSize = scriptureSizeOf(prefs);
    return {
      name,
      chosen,
      colors: COLORS[name],
      dark: isDarkTheme(name),
      fonts: FONT_FACES,
      scriptureSize,
      scriptureLineHeight: Math.round(
        scriptureSize * (name === 'selah' ? LINE_HEIGHTS.scriptureCalm : LINE_HEIGHTS.scripture),
      ),
      prefs,
      update,
      key: `${name}:${scriptureSize}`,
    };
  }, [prefs, scheme, update]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error('useTheme must be used within <ThemeProvider>.');
  return theme;
}

/**
 * Declare a themed stylesheet once at module scope; call the returned hook in a component.
 * Styles are built once per theme + text size and cached.
 */
/** Same shape `StyleSheet.create` accepts; the intersection keeps literal style values narrow. */
type StylesShape = { readonly [key: string]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<S extends StylesShape>(
  factory: (c: ColorTheme, theme: AppTheme) => S & StylesShape,
): () => Readonly<S> {
  const cache = new Map<string, Readonly<S>>();
  return function useStyles(): Readonly<S> {
    const theme = useTheme();
    const cached = cache.get(theme.key);
    if (cached !== undefined) return cached;
    const styles = StyleSheet.create(factory(theme.colors, theme));
    cache.set(theme.key, styles);
    return styles;
  };
}
