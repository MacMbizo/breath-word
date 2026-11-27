// Desktop shell (B3 §4.1, design round 2026-11-28): the collapsible side panel and the active screen.
// Screens read the headless core stores through React (see `useCoreStore`); this component owns
// only view state. The theme (Parchment · Selah · Lamplight) is applied by `useDesktopTheme`.
import { useEffect, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { AccountView } from './AccountView';
import { BreathRing } from './BreathRing';
import { CompareView } from './CompareView';
import { EngineView } from './EngineView';
import { HabitsView } from './HabitsView';
import { LibraryView } from './LibraryView';
import { PoolsView } from './PoolsView';
import { PrayerSessionView } from './PrayerSessionView';
import { ReaderView } from './ReaderView';
import { SearchView } from './SearchView';
import { SidePanel, type Tab } from './shell/SidePanel';
import { useDesktopTheme } from './shell/useDesktopTheme';
import { VaultView } from './VaultView';

export function App() {
  const theme = useDesktopTheme();
  const [tab, setTab] = useState<Tab>('read');
  const [focusMode, setFocusMode] = useState(false);
  const reduceMotion = useReducedMotion();

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
    <div className="flex h-full bg-canvas text-ink-primary">
      <SidePanel
        tab={tab}
        onSelect={setTab}
        onFocus={() => {
          setTab('read');
          setFocusMode(true);
        }}
        theme={theme}
      />
      <main className={`min-w-0 flex-1 overflow-hidden ${tab === 'read' ? '' : 'px-xl py-lg'}`}>
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion === true ? 0 : 0.25 }}
          className="h-full"
        >
          {tab === 'read' && <ReaderView />}
          {tab === 'search' && <SearchView />}
          {tab === 'compare' && <CompareView />}
          {tab === 'library' && <LibraryView />}
          {tab === 'breathe' && <BreathRing />}
          {tab === 'pools' && <PoolsView />}
          {tab === 'deck' && <PrayerSessionView />}
          {tab === 'pray' && <EngineView />}
          {tab === 'vault' && <VaultView />}
          {tab === 'habits' && <HabitsView />}
          {tab === 'account' && <AccountView />}
        </motion.div>
      </main>
    </div>
  );
}
