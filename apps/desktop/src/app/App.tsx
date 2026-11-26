// Desktop shell (B3 §4.1): header, screen tabs and theme switch. Screens read the headless
// core stores through React (see `useCoreStore`); this component owns only view state.
import { useEffect, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import type { ThemeName } from '@breath-and-word/tokens';

import { BreathRing } from './BreathRing';
import { CompareView } from './CompareView';
import { LibraryView } from './LibraryView';
import { ReaderView } from './ReaderView';
import { SearchView } from './SearchView';
import { applyTheme, DEFAULT_THEME, THEMES } from './theme';

type Tab = 'read' | 'search' | 'compare' | 'library' | 'breathe';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'read', label: 'Read' },
  { id: 'search', label: 'Search' },
  { id: 'compare', label: 'Compare' },
  { id: 'library', label: 'Library' },
  { id: 'breathe', label: 'Breathe' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('read');
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [focusMode, setFocusMode] = useState(false);
  const reduceMotion = useReducedMotion();

  function selectTheme(next: ThemeName) {
    applyTheme(next);
    setTheme(next);
  }

  // FR-104 — Escape is the subtle exit gesture from Focus Mode (the discoverable control
  // lives in the reader itself); the listener only exists while Focus Mode is active.
  useEffect(() => {
    if (!focusMode) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFocusMode(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  if (focusMode) {
    return (
      <div className="flex h-full flex-col bg-canvas text-ink-primary">
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion === true ? 0 : 0.3 }}
          className="flex-1 overflow-hidden"
        >
          <ReaderView focusMode onExitFocus={() => setFocusMode(false)} />
        </motion.main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas text-ink-primary">
      <header className="flex items-center justify-between border-b border-hairline px-xl py-md">
        <div className="flex items-center gap-lg">
          <h1 className="font-ui text-uiLg font-semibold">Breath &amp; Word</h1>
          <nav className="flex gap-xs">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-pill px-lg py-xs font-ui text-uiSm transition ${
                  tab === item.id ? 'bg-accent text-canvas' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-xxs">
          {THEMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => selectTheme(name)}
              aria-pressed={theme === name}
              className={`rounded-pill px-md py-xs font-ui text-uiXs capitalize transition ${
                theme === name ? 'bg-elevated text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-hidden px-xl py-lg">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion === true ? 0 : 0.25 }}
          className="h-full"
        >
          {tab === 'read' && <ReaderView onEnterFocus={() => setFocusMode(true)} />}
          {tab === 'search' && <SearchView />}
          {tab === 'compare' && <CompareView />}
          {tab === 'library' && <LibraryView />}
          {tab === 'breathe' && <BreathRing />}
        </motion.div>
      </main>
    </div>
  );
}
