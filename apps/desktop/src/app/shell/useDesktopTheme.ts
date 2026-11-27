// D1 §4.2 — the desktop's live theme: the reader's saved choice (core `appearance` store), switched
// to Lamplight while the OS is in dark mode when "Lamplight when my device is dark" is on. Writes
// the token CSS variables whenever the effective theme changes.
import { useEffect, useState } from 'react';

import type { AppearancePreferences } from '@breath-and-word/core';
import { DEFAULT_THEME, isDarkTheme, isThemeName, type ThemeName } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { applyTheme } from '../theme';
import { useCoreStoreSelector } from '../useCoreStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export interface DesktopTheme {
  readonly name: ThemeName;
  readonly chosen: ThemeName;
  readonly dark: boolean;
  readonly prefs: AppearancePreferences;
  readonly update: (patch: Partial<AppearancePreferences>) => void;
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return dark;
}

/** Call once (in the shell) to apply the theme; other components read the same store. */
export function useDesktopTheme(): DesktopTheme {
  const { stores } = useCoreRuntime();
  const prefs = useCoreStoreSelector(stores.appearance, (state) => state.prefs);
  const systemDark = useSystemDark();
  const chosen: ThemeName = isThemeName(prefs.theme) ? prefs.theme : DEFAULT_THEME;
  const name: ThemeName = prefs.followSystemDark && systemDark ? 'lamplight' : chosen;

  useEffect(() => {
    applyTheme(name);
  }, [name]);

  return {
    name,
    chosen,
    dark: isDarkTheme(name),
    prefs,
    update: (patch) => {
      void stores.appearance.getState().update(patch);
    },
  };
}
