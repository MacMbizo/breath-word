// Desktop study surface (A2 §4.3, design round 2026-11-28): a floating card beside the reader with
// segmented tabs — Words (FR-301/302), Guide (FR-303), Observe (FR-304) and Sketch (FR-305). It
// collapses to `StudyRail`, a slim floating strip of the same four tools.
import { useEffect, useState } from 'react';

import { Icon, type IconName } from '../shell/Icon';

import { InductivePane } from './InductivePane';
import { InkCanvas } from './InkCanvas';
import { PassageGuidePane } from './PassageGuidePane';
import { WordStudyPane } from './WordStudyPane';

export type StudyTab = 'words' | 'guide' | 'inductive' | 'ink';

const TABS: readonly { readonly id: StudyTab; readonly label: string; readonly icon: IconName | null }[] = [
  { id: 'words', label: 'Words', icon: null },
  { id: 'guide', label: 'Guide', icon: 'guide' },
  { id: 'inductive', label: 'Observe', icon: 'observe' },
  { id: 'ink', label: 'Sketch', icon: 'sketch' },
];

/** FR-301 — a tapped English word to focus in the Words tab. */
export interface WordFocus {
  readonly alignmentId: number;
  readonly strongsId?: string;
  readonly wordPosition?: number;
  /** Earlier same-Strong's words in the verse (picks the matching interlinear token). */
  readonly rank: number;
}

export interface StudyPanelProps {
  readonly userId: string | null;
  readonly verseId: number;
  readonly reference: string;
  readonly packId: string;
  readonly translationCode: string;
  readonly wordFocus?: WordFocus | null;
  readonly initialTab?: StudyTab;
  readonly onOpenVerse: (canonicalVerseId: number) => void;
  readonly onCollapse: () => void;
}

const CARD_SHELL =
  'flex max-h-full w-full flex-col gap-md overflow-hidden rounded-[28px] border border-hairline bg-surface p-lg shadow-[0_18px_48px_var(--bw-shadow)]';

export function StudyPanel({ userId, verseId, reference, packId, translationCode, wordFocus = null, initialTab = 'words', onOpenVerse, onCollapse }: StudyPanelProps) {
  const [tab, setTab] = useState<StudyTab>(initialTab);

  // Tapping a word in the reader always lands on the Words tab.
  useEffect(() => {
    if (wordFocus !== null) setTab('words');
  }, [wordFocus]);

  return (
    <aside className={CARD_SHELL} aria-label="Study">
      <div className="flex items-center gap-sm">
        <div className="flex flex-1 gap-xxs rounded-pill bg-sunken p-xxs" role="tablist" aria-label="Study tools">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`h-9 flex-1 rounded-pill font-ui text-[13px] transition ${
                tab === item.id ? 'bg-surface font-semibold text-ink-primary shadow-sm' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse study panel"
          aria-expanded
          className="flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary transition hover:text-ink-primary"
        >
          <Icon name="panelRightClose" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-xs">
        {tab === 'words' && <WordStudyPane verseId={verseId} reference={reference} wordFocus={wordFocus} onOpenVerse={onOpenVerse} />}
        {tab === 'guide' && <PassageGuidePane startVerseId={verseId} endVerseId={verseId} translationPackId={packId} onOpenVerse={onOpenVerse} />}
        {tab === 'inductive' && userId !== null && (
          <InductivePane userId={userId} verseId={verseId} reference={reference} translationCode={translationCode} />
        )}
        {tab === 'ink' && userId !== null && <InkCanvas userId={userId} verseId={verseId} reference={reference} />}
      </div>
    </aside>
  );
}

/** The collapsed study panel: a floating strip of the four tools; any one re-opens the card. */
export function StudyRail({ onOpen }: { onOpen: (tab: StudyTab) => void }) {
  return (
    <div
      role="toolbar"
      aria-label="Study tools (collapsed)"
      aria-orientation="vertical"
      className="flex w-[60px] flex-col items-center gap-xxs rounded-[30px] border border-hairline bg-surface py-xs shadow-[0_12px_32px_var(--bw-shadow)]"
    >
      <button
        type="button"
        onClick={() => onOpen('words')}
        aria-label="Expand study panel"
        aria-expanded={false}
        className="flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary transition hover:text-ink-primary"
      >
        <Icon name="panelRightOpen" />
      </button>
      <span aria-hidden="true" className="my-xxs h-px w-6 bg-hairline" />
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item.id)}
          aria-label={item.label}
          title={item.label}
          className="flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary transition hover:bg-sunken hover:text-ink-primary"
        >
          {item.icon === null ? <span className="font-greek text-[22px] leading-none">α</span> : <Icon name={item.icon} />}
        </button>
      ))}
    </div>
  );
}
