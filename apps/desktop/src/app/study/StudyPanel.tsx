// Desktop dual-pane study surface (A2 §4.3): reader on the left, the selected verse's study tools on
// the right — Words (FR-301/302), Guide (FR-303), Inductive (FR-304) and Sketch (FR-305).
import { useEffect, useState } from 'react';

import { InductivePane } from './InductivePane';
import { InkCanvas } from './InkCanvas';
import { PassageGuidePane } from './PassageGuidePane';
import { BUTTON } from './styles';
import { WordStudyPane } from './WordStudyPane';

type StudyTab = 'words' | 'guide' | 'inductive' | 'ink';

const TABS: readonly { readonly id: StudyTab; readonly label: string }[] = [
  { id: 'words', label: 'Words' },
  { id: 'guide', label: 'Guide' },
  { id: 'inductive', label: 'Inductive' },
  { id: 'ink', label: 'Sketch' },
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
  readonly onOpenVerse: (canonicalVerseId: number) => void;
  readonly onClose: () => void;
}

export function StudyPanel({ userId, verseId, reference, packId, translationCode, wordFocus = null, onOpenVerse, onClose }: StudyPanelProps) {
  const [tab, setTab] = useState<StudyTab>('words');

  // Tapping a word in the reader always lands on the Words tab.
  useEffect(() => {
    if (wordFocus !== null) setTab('words');
  }, [wordFocus]);

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col gap-md overflow-hidden border-l border-hairline pl-lg" aria-label="Study">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex gap-xxs" role="tablist" aria-label="Study tools">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-pill px-md py-xxs font-ui text-uiSm transition ${
                tab === item.id ? 'bg-accent text-canvas' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className={BUTTON} onClick={onClose} aria-label="Close study panel">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-lg pr-xs">
        {tab === 'words' && <WordStudyPane verseId={verseId} reference={reference} wordFocus={wordFocus} onOpenVerse={onOpenVerse} />}
        {tab === 'guide' && (
          <PassageGuidePane startVerseId={verseId} endVerseId={verseId} translationPackId={packId} onOpenVerse={onOpenVerse} />
        )}
        {tab === 'inductive' && userId !== null && (
          <InductivePane userId={userId} verseId={verseId} reference={reference} translationCode={translationCode} />
        )}
        {tab === 'ink' && userId !== null && <InkCanvas userId={userId} verseId={verseId} reference={reference} />}
      </div>
    </aside>
  );
}
