// FR-301 / FR-302 — interlinear tokens for the selected verse, the Morphology Inspector for a tapped
// word, and its lexicon entry (BDB / Thayer / Abbott-Smith sections) with the Word Frequency Suite.
// All data comes through the headless study store; no SQL here (AGENTS.md rule 1).
import { useEffect, useRef, useState } from 'react';

import { isRtlOriginalLanguage, selectAlignedToken, type InterlinearToken } from '@breath-and-word/core';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { languageFromStrongs, OriginalText } from './OriginalText';
import type { WordFocus } from './StudyPanel';
import { CARD, LINK, PANEL_HEADING } from './styles';

export interface WordStudyPaneProps {
  readonly verseId: number;
  readonly reference: string;
  /** FR-301 — an English word tapped in the reader: preselect its original-language token. */
  readonly wordFocus?: WordFocus | null;
  /** Jump the reader to a verse (word occurrences). */
  readonly onOpenVerse: (canonicalVerseId: number) => void;
}

export function WordStudyPane({ verseId, reference, wordFocus = null, onOpenVerse }: WordStudyPaneProps) {
  const { stores } = useCoreRuntime();
  const { verseTokens, activeLexicon, wordFrequency, status, error } = useCoreStore(stores.study);
  const [selected, setSelected] = useState<InterlinearToken | null>(null);
  /** A tapped word whose Strong's has no token in the installed exegesis pack: show its lexicon alone. */
  const [lexiconOnly, setLexiconOnly] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
    void stores.study.getState().loadVerseInterlinear(verseId);
  }, [stores, verseId]);

  function inspect(token: InterlinearToken) {
    setSelected(token);
    setLexiconOnly(null);
    if (token.strongsId !== undefined) void stores.study.getState().openLexicon(token.strongsId);
  }

  const tokens = verseTokens.filter((t) => t.canonicalVerseId === verseId);
  const tokensSettled = status !== 'loading';

  // FR-301 — once this verse's tokens are in, select the one the tapped English word points at;
  // if the installed exegesis pack has no token for it, still show the lexicon entry.
  // Handle each (focus, loaded tokens) pair once: `openLexicon` toggles `status`, which would
  // otherwise re-run this effect and reopen the lexicon forever.
  const handledFocus = useRef<{ focus: WordFocus; tokens: readonly InterlinearToken[] } | null>(null);
  useEffect(() => {
    if (wordFocus === null || !tokensSettled) return;
    const handled = handledFocus.current;
    if (handled !== null && handled.focus === wordFocus && handled.tokens === verseTokens) return;
    handledFocus.current = { focus: wordFocus, tokens: verseTokens };
    const token = selectAlignedToken(tokens, wordFocus);
    if (token !== undefined) {
      inspect(token);
    } else if (wordFocus.strongsId !== undefined) {
      setSelected(null);
      setLexiconOnly(wordFocus.strongsId);
      void stores.study.getState().openLexicon(wordFocus.strongsId);
    }
    // `tokens`/`inspect` derive from state read here; re-run only when the focus or loaded tokens change.
  }, [wordFocus, tokensSettled, verseTokens]);
  const verseLanguage = languageFromStrongs(tokens.find((t) => t.strongsId !== undefined)?.strongsId);
  const lexiconStrongs = selected?.strongsId ?? lexiconOnly ?? undefined;
  const lexicon = lexiconStrongs !== undefined && activeLexicon?.strongsId === lexiconStrongs ? activeLexicon : null;
  const frequency = lexicon !== null && wordFrequency?.strongsId === lexicon.strongsId ? wordFrequency : null;
  const maxBook = Math.max(1, ...(frequency?.byBook.map((b) => b.occurrences) ?? [1]));

  return (
    <div className="flex flex-col gap-md">
      <h3 className={PANEL_HEADING}>{`Interlinear · ${reference}`}</h3>
      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}
      {status === 'ready' && tokens.length === 0 && error === null && (
        <p className="font-ui text-uiSm text-ink-secondary">No original-language words for this verse in the installed pack.</p>
      )}

      {/* Words flow in reading order: right-to-left for Hebrew, left-to-right for Greek. */}
      <div
        className="flex flex-wrap gap-xs"
        dir={isRtlOriginalLanguage(verseLanguage) ? 'rtl' : 'ltr'}
        style={{ unicodeBidi: 'isolate' }}
      >
        {tokens.map((token) => (
          <button
            key={token.tokenId}
            type="button"
            onClick={() => inspect(token)}
            aria-pressed={selected?.tokenId === token.tokenId}
            className={`flex min-w-16 flex-col items-center gap-xxs rounded-md border px-sm py-xs transition ${
              selected?.tokenId === token.tokenId ? 'border-accent bg-elevated' : 'border-hairline bg-surface hover:border-accent'
            }`}
          >
            <OriginalText language={languageFromStrongs(token.strongsId)} className="text-uiLg text-ink-primary">
              {token.originalWord}
            </OriginalText>
            <span dir="ltr" className="font-ui text-uiXs italic text-ink-secondary">
              {token.transliteration ?? ''}
            </span>
            <span dir="ltr" className="font-ui text-uiXs text-ink-primary">
              {token.englishGloss ?? ''}
            </span>
            <span dir="ltr" className="font-ui text-uiXs text-accent">
              {token.strongsId ?? ''}
            </span>
          </button>
        ))}
      </div>

      {selected !== null && (
        <section className={CARD} aria-label="Morphology inspector">
          <h4 className={PANEL_HEADING}>Morphology</h4>
          <p className="mt-xs font-ui text-uiSm text-ink-primary">
            {selected.morphologyHuman ?? 'No parsing recorded for this word.'}
          </p>
          {selected.morphologyCode !== undefined && (
            <p className="font-ui text-uiXs text-ink-secondary">{`Code ${selected.morphologyCode}`}</p>
          )}
          {selected.lemma !== undefined && (
            <p className="mt-xs font-ui text-uiSm text-ink-secondary">
              Dictionary form{' '}
              <OriginalText language={languageFromStrongs(selected.strongsId)} className="text-uiMd text-ink-primary">
                {selected.lemma}
              </OriginalText>
            </p>
          )}
        </section>
      )}

      {lexicon !== null && (
        <section className={CARD} aria-label={`Lexicon ${lexicon.strongsId}`}>
          <div className="flex items-baseline justify-between gap-sm">
            <OriginalText language={lexicon.language} className="text-uiLg text-ink-primary">
              {lexicon.lemma}
            </OriginalText>
            <span className="font-ui text-uiSm text-accent">{lexicon.strongsId}</span>
          </div>
          {lexicon.transliteration !== undefined && (
            <p className="font-ui text-uiSm italic text-ink-secondary">{lexicon.transliteration}</p>
          )}
          <p className="mt-xs font-ui text-uiMd text-ink-primary">{lexicon.shortDefinition}</p>

          {frequency !== null && (
            <div className="mt-md flex flex-col gap-xs">
              <h4 className={PANEL_HEADING}>
                {`Frequency · ${frequency.totalOccurrences} total · OT ${frequency.otOccurrences} · NT ${frequency.ntOccurrences}`}
              </h4>
              <ul className="flex flex-col gap-xxs">
                {frequency.byBook.map((book) => (
                  <li key={book.bookNumber} className="flex items-center gap-sm font-ui text-uiXs text-ink-secondary">
                    <span className="w-24 truncate">{book.bookName}</span>
                    <span className="h-xs flex-1 rounded-pill bg-elevated">
                      <span
                        className="block h-xs rounded-pill bg-accent"
                        style={{ width: `${(book.occurrences / maxBook) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-right">{book.occurrences}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-x-sm gap-y-xxs">
                {frequency.occurrences.slice(0, 40).map((hit) => (
                  <button
                    key={`${hit.canonicalVerseId}-${hit.wordPosition}`}
                    type="button"
                    className={LINK}
                    onClick={() => onOpenVerse(hit.canonicalVerseId)}
                  >
                    {hit.passageReference}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-md flex flex-col gap-sm">
            {lexicon.sections.map((section, index) => (
              <article key={`${section.heading}-${index}`}>
                <h4 className="font-ui text-uiSm font-semibold text-ink-primary">{section.heading}</h4>
                <p className="whitespace-pre-line font-ui text-uiSm text-ink-primary">{section.body}</p>
                {section.source !== undefined && (
                  <p className="font-ui text-uiXs text-ink-secondary">{section.source}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
