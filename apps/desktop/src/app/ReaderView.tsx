// FR-101 structured reader — renders a chapter from the headless reader store.
// No SQL here (AGENTS.md rule 1): the store calls `ReaderRepository`, which owns the SQL.
//
// Canon-wide navigation: the book list comes from the pack's own `books` table (via the store's
// `loadBooks`), so the reader can move Genesis..Revelation, not just the default Romans 8. Prev/Next
// stay inside the current book's `chapterCount`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useReducedMotion } from 'framer-motion';

import {
  bookName,
  formatCanonicalRange,
  fromCanonicalVerseId,
  strongsOccurrenceRank,
  type Footnote,
  type SymbolTag,
  type VerseWordAlignment,
} from '@breath-and-word/core';
import { INDUCTIVE_HIGHLIGHTS, SCRIPTURE_METRICS, inductiveCssVariable } from '@breath-and-word/tokens';

import { AudioMiniPlayer } from './AudioMiniPlayer';
import { CapturePanel } from './CapturePanel';
import { useCoreRuntime } from './CoreRuntime';
import { Icon } from './shell/Icon';
import { QuickLook } from './study/QuickLook';
import { StudyPanel, StudyRail, type StudyTab, type WordFocus } from './study/StudyPanel';
import { useCurrentUserId } from './study/useCurrentUserId';
import { useCoreStore, useCoreStoreSelector } from './useCoreStore';
import { VerseSpans } from './VerseSpans';

/** A first open with nothing remembered starts at John 1 — "In the beginning was the Word". */
const FIRST_BOOK = 43;
const FIRST_CHAPTER = 1;
/** Preferred default translation pack when several are installed. */
const PREFERRED_PACK = 'core_bsb';

const MEASURE = `${SCRIPTURE_METRICS.optimalMeasureCh.max}ch`;

const BUTTON =
  'rounded-pill bg-elevated px-lg py-sm font-ui text-uiSm text-ink-primary transition hover:bg-sunken disabled:opacity-40';
const PILL_SELECT =
  'h-11 appearance-none rounded-pill border-0 bg-elevated px-lg font-ui text-uiSm font-semibold text-ink-primary outline-none transition hover:bg-sunken focus-visible:ring-2 focus-visible:ring-[var(--bw-accent-primary)]';
const ROUND_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary transition hover:bg-sunken hover:text-ink-primary disabled:opacity-30';

export interface ReaderViewProps {
  /** FR-104 — when true, all chrome is hidden and only the scripture typography shows. */
  readonly focusMode?: boolean;
  /** Exit Focus Mode (the shell also wires the Escape key as the subtle exit gesture). */
  readonly onExitFocus?: () => void;
}

export function ReaderView({ focusMode = false, onExitFocus }: ReaderViewProps = {}) {
  const { stores } = useCoreRuntime();
  const { location, chapter, status, error, books, translations } = useCoreStore(stores.reader);
  const prefs = useCoreStoreSelector(stores.appearance, (state) => state.prefs);
  const [translationsReady, setTranslationsReady] = useState(false);
  /** FR-301 — the tapped word itself (for the quick look when the study panel is collapsed). */
  const [activeAlignment, setActiveAlignment] = useState<VerseWordAlignment | null>(null);
  const [studyTab, setStudyTab] = useState<StudyTab>('words');
  /** FR-101 — the footnote whose sheet is open, or `null` when the sheet is closed. */
  const [activeFootnote, setActiveFootnote] = useState<Footnote | null>(null);
  /** FR-201 — whether the ≤2-tap capture panel is open over the reader. */
  const [captureOpen, setCaptureOpen] = useState(false);
  /** FR-301..305 — the verse whose study tools are open in the side panel. */
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null);
  /** FR-301 — the tapped English word whose study is open (its verse is `selectedVerseId`). */
  const [wordFocus, setWordFocus] = useState<WordFocus | null>(null);
  /** A verse to scroll to once its chapter has loaded (cross-reference / occurrence jumps). */
  const [pendingVerseId, setPendingVerseId] = useState<number | null>(null);
  const userId = useCurrentUserId();
  const { highlights, wordAlignments } = useCoreStore(stores.study);
  const { activeVerseId: audioVerseId, isPlaying } = useCoreStore(stores.audio);
  const reduceMotion = useReducedMotion() === true;

  useEffect(() => {
    let live = true;
    void stores.reader
      .getState()
      .loadTranslations()
      .finally(() => {
        if (live) setTranslationsReady(true);
      });
    return () => {
      live = false;
    };
  }, [stores]);

  // Open where the reader was last (device-local), else an installed translation at John 1 — once,
  // and only when nothing is open yet (the reader keeps its place when switching screens).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !translationsReady) return;
    opened.current = true;
    if (stores.reader.getState().location !== null) return;
    const last = prefs.lastPassage;
    const installed = (packId: string, code: string) => translations.some((t) => t.packId === packId && t.translationCode === code);
    const fallback = translations.find((t) => t.packId === PREFERRED_PACK) ?? translations[0];
    const target =
      last !== null && installed(last.packId, last.translationCode)
        ? last
        : fallback !== undefined
          ? { packId: fallback.packId, translationCode: fallback.translationCode, bookNumber: FIRST_BOOK, chapter: FIRST_CHAPTER }
          : null;
    if (target === null) return;
    void stores.reader.getState().openChapter(target);
    void stores.reader.getState().loadBooks(target.packId, target.translationCode);
  }, [stores, translationsReady, translations, prefs.lastPassage]);

  // Remember the passage each time a chapter opens successfully.
  const locationKey = location === null ? null : `${location.packId}|${location.translationCode}|${location.bookNumber}|${location.chapter}`;
  useEffect(() => {
    if (status !== 'ready' || location === null) return;
    const last = stores.appearance.getState().prefs.lastPassage;
    const lastKey = last === null ? null : `${last.packId}|${last.translationCode}|${last.bookNumber}|${last.chapter}`;
    if (lastKey !== locationKey) void stores.appearance.getState().update({ lastPassage: location });
  }, [stores, status, locationKey, location]);

  const packId = location?.packId ?? PREFERRED_PACK;
  const translationCode = location?.translationCode ?? '';
  const bookNumber = location?.bookNumber ?? FIRST_BOOK;
  const chapterNumber = location?.chapter ?? FIRST_CHAPTER;
  const studyOpen = prefs.studyPanelOpen;
  const noBibleInstalled = translationsReady && translations.length === 0;
  const chapterCount = books.find((book) => book.bookNumber === bookNumber)?.chapterCount;
  const reference = `${bookName(bookNumber)} ${chapterNumber}`;

  const openChapter = useCallback(
    (nextBook: number, nextChapter: number) => {
      if (nextChapter < 1) return;
      setActiveAlignment(null);
      void stores.reader.getState().openChapter({ packId, translationCode, bookNumber: nextBook, chapter: nextChapter });
    },
    [stores, packId, translationCode],
  );

  const atFirstChapter = chapterNumber <= 1;
  const atLastChapter = chapterCount !== undefined && chapterNumber >= chapterCount;
  const chapters =
    chapterCount !== undefined
      ? Array.from({ length: chapterCount }, (_, index) => index + 1)
      : [chapterNumber];

  // FR-101 — tap-to-open footnote sheet: markers in the text resolve to the chapter's note bodies.
  const footnotesById = useMemo(
    () => new Map((chapter?.footnotes ?? []).map((note) => [note.footnoteId, note])),
    [chapter],
  );
  const openFootnote = useCallback(
    (footnoteId: string) => {
      const note = footnotesById.get(footnoteId);
      if (note !== undefined) setActiveFootnote(note);
    },
    [footnotesById],
  );

  // FR-304 — load the chapter's highlights / notes so the reader can paint inductive washes.
  const firstVerseId = chapter?.verses[0]?.canonicalVerseId;
  const lastVerseId = chapter?.verses[chapter.verses.length - 1]?.canonicalVerseId;
  const openTranslation = location?.translationCode;
  useEffect(() => {
    if (userId === null || firstVerseId === undefined || lastVerseId === undefined) return;
    void stores.study.getState().loadRangeStudy(userId, firstVerseId, lastVerseId, openTranslation);
  }, [stores, userId, firstVerseId, lastVerseId, openTranslation]);

  // FR-301 — aligned English words for the chapter (empty when the translation carries none).
  const openPack = location?.packId;
  useEffect(() => {
    if (openPack === undefined || openTranslation === undefined) return;
    if (firstVerseId === undefined || lastVerseId === undefined) return;
    void stores.study.getState().loadRangeAlignments(openPack, openTranslation, firstVerseId, lastVerseId);
  }, [stores, openPack, openTranslation, firstVerseId, lastVerseId]);

  const openWord = useCallback(
    (alignment: VerseWordAlignment) => {
      const verseAlignments = wordAlignments.get(alignment.canonicalVerseId) ?? [];
      setActiveAlignment(alignment);
      setSelectedVerseId(alignment.canonicalVerseId);
      setWordFocus({
        alignmentId: alignment.id,
        ...(alignment.strongsId !== undefined ? { strongsId: alignment.strongsId } : {}),
        ...(alignment.interlinearWordPos !== undefined ? { wordPosition: alignment.interlinearWordPos } : {}),
        rank: strongsOccurrenceRank(verseAlignments, alignment),
      });
    },
    [wordAlignments],
  );

  const symbolsByVerse = useMemo(() => {
    const map = new Map<number, SymbolTag[]>();
    for (const h of highlights) {
      if (h.symbolTag === undefined) continue;
      for (let id = h.startVerseId; id <= h.endVerseId; id += 1) {
        const list = map.get(id) ?? [];
        if (!list.includes(h.symbolTag)) list.push(h.symbolTag);
        map.set(id, list);
      }
    }
    return map;
  }, [highlights]);

  // FR-303 / FR-302 — jump to a verse from a cross-reference or word occurrence.
  const openVerse = useCallback(
    (canonicalVerseId: number) => {
      const { book, chapter: target } = fromCanonicalVerseId(canonicalVerseId);
      setSelectedVerseId(canonicalVerseId);
      setPendingVerseId(canonicalVerseId);
      if (book !== bookNumber || target !== chapterNumber) openChapter(book, target);
    },
    [bookNumber, chapterNumber, openChapter],
  );

  // Scroll a pending jump target, or the verse being narrated, into view (instant under Reduced Motion).
  const followVerseId = pendingVerseId ?? (isPlaying ? audioVerseId : null);
  useEffect(() => {
    if (followVerseId === null || chapter === null) return;
    const element = document.getElementById(`verse-${followVerseId}`);
    if (element === null) return;
    element.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    if (pendingVerseId !== null) setPendingVerseId(null);
  }, [followVerseId, chapter, reduceMotion, pendingVerseId]);

  const scripture =
    chapter !== null ? (
      <article
        className="mx-auto font-scripture text-ink-primary"
        style={{ maxWidth: MEASURE, lineHeight: 1.75, fontSize: 'calc(var(--bw-font-size-scriptureDefault) + 1px)' }}
      >
        <header className="mb-lg mt-md flex flex-col gap-xxs">
          <span className="font-ui text-uiXs font-medium uppercase tracking-[0.18em] text-ink-secondary">{bookName(bookNumber)}</span>
          <span className="font-display text-[72px] font-semibold leading-none text-accent-rubric [font-variant-numeric:lining-nums]" aria-label={`Chapter ${chapterNumber}`}>
            {chapterNumber}
          </span>
        </header>
        {chapter.verses.map((verse) => {
          const symbols = symbolsByVerse.get(verse.canonicalVerseId) ?? [];
          const wash = symbols[0];
          const isSelected = selectedVerseId === verse.canonicalVerseId;
          const isNarrated = audioVerseId === verse.canonicalVerseId;
          return (
            <p
              key={verse.canonicalVerseId}
              id={`verse-${verse.canonicalVerseId}`}
              className={`mb-sm rounded-sm ${isSelected ? 'outline outline-1 outline-accent' : ''} ${
                isNarrated ? 'border-l-2 border-accent pl-xs' : ''
              }`}
              style={wash !== undefined ? { backgroundColor: `var(${inductiveCssVariable(wash)})` } : undefined}
              aria-current={isNarrated ? 'true' : undefined}
            >
              {focusMode ? (
                <sup className="mr-xs font-ui text-uiXs text-ink-verse">{verse.verse}</sup>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setWordFocus(null);
                    setSelectedVerseId(isSelected ? null : verse.canonicalVerseId);
                  }}
                  className="mr-xs align-super font-ui text-uiXs font-semibold text-ink-verse hover:text-accent"
                  aria-label={`Study ${formatCanonicalRange(verse.canonicalVerseId, verse.canonicalVerseId)}`}
                  aria-pressed={isSelected}
                >
                  {verse.verse}
                </button>
              )}
              <VerseSpans
                verseId={verse.canonicalVerseId}
                spans={verse.spans}
                onFootnotePress={openFootnote}
                {...(focusMode
                  ? {}
                  : {
                      alignments: wordAlignments.get(verse.canonicalVerseId),
                      onWordPress: openWord,
                      wordsFocusable: isSelected,
                      ...(isSelected && wordFocus !== null ? { activeAlignmentId: wordFocus.alignmentId } : {}),
                    })}
              />
              {!focusMode && !studyOpen && activeAlignment !== null && activeAlignment.canonicalVerseId === verse.canonicalVerseId && (
                <QuickLook
                  alignment={activeAlignment}
                  englishWord={verse.spans[activeAlignment.spanIndex]?.text.slice(activeAlignment.charStart, activeAlignment.charEnd) ?? ''}
                  packId={packId}
                  translationCode={translationCode}
                  onOpenPanel={() => {
                    setStudyTab('words');
                    void stores.appearance.getState().update({ studyPanelOpen: true });
                  }}
                  onClose={() => {
                    setActiveAlignment(null);
                    setWordFocus(null);
                  }}
                />
              )}
              {symbols.map((symbol) => (
                <span
                  key={symbol}
                  className="ml-xxs font-ui text-uiXs text-ink-secondary"
                  title={INDUCTIVE_HIGHLIGHTS[symbol].meaning}
                  aria-label={INDUCTIVE_HIGHLIGHTS[symbol].meaning}
                >
                  {INDUCTIVE_HIGHLIGHTS[symbol].badge}
                </span>
              ))}
            </p>
          );
        })}
      </article>
    ) : null;

  // FR-101 — the footnote sheet mirrors the mobile bottom sheet: a low-chrome panel that shows the
  // tapped marker's note body, dismissable from the Close control (or the backdrop).
  const footnoteSheet =
    activeFootnote !== null ? (
      <div
        className="fixed inset-0 z-20 flex flex-col justify-end bg-elevated"
        role="dialog"
        aria-modal="true"
        aria-label={`Note ${activeFootnote.marker}`}
      >
        <div className="flex flex-col gap-md border-t border-hairline bg-surface p-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-ui text-uiMd text-ink-primary">{`Note ${activeFootnote.marker}`}</h3>
            <button type="button" onClick={() => setActiveFootnote(null)} className={BUTTON}>
              Close
            </button>
          </div>
          <p className="max-h-64 overflow-y-auto font-scripture text-uiMd text-ink-primary">
            {activeFootnote.bodyText}
          </p>
        </div>
      </div>
    ) : null;

  // FR-104 — Focus Mode hides every toolbar; the only affordance is a low-contrast exit
  // control (plus Escape, wired by the shell) so nothing competes with the text.
  if (focusMode) {
    return (
      <>
        <section className="relative flex h-full flex-col overflow-hidden">
          <button
            type="button"
            onClick={onExitFocus}
            className="absolute right-lg top-lg z-10 rounded-pill border border-hairline bg-surface px-md py-xs font-ui text-uiXs text-ink-secondary opacity-40 transition hover:opacity-100 focus-visible:opacity-100"
            aria-label="Exit focus mode"
          >
            Exit focus · Esc
          </button>
          <div className="flex-1 overflow-y-auto px-xl py-xxl">
            {error !== null && (
              <p className="font-ui text-uiSm text-ink-red" role="alert">
                {error.userMessage}
              </p>
            )}
            {scripture === null && error === null && (
              <p
                className="mx-auto font-ui text-uiSm text-ink-secondary"
                style={{ maxWidth: MEASURE }}
              >
                Open a chapter to begin reading.
              </p>
            )}
            {scripture}
          </div>
        </section>
        {footnoteSheet}
      </>
    );
  }

  const verseForStudy = selectedVerseId ?? chapter?.verses[0]?.canonicalVerseId ?? null;

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 gap-lg">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-xl pb-xxl pt-lg">
          <div className="flex items-center justify-center gap-xs">
            <button type="button" disabled={atFirstChapter} onClick={() => openChapter(bookNumber, chapterNumber - 1)} className={ROUND_BUTTON} aria-label="Previous chapter">
              <Icon name="back" />
            </button>
            <label className="sr-only" htmlFor="reader-book">Book</label>
            <select id="reader-book" className={PILL_SELECT} value={bookNumber} onChange={(e) => openChapter(Number(e.target.value), 1)}>
              {books.length === 0 && <option value={bookNumber}>{bookName(bookNumber)}</option>}
              {books.map((book) => (
                <option key={book.bookNumber} value={book.bookNumber}>
                  {book.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="reader-chapter">Chapter</label>
            <select id="reader-chapter" className={PILL_SELECT} value={chapterNumber} onChange={(e) => openChapter(bookNumber, Number(e.target.value))}>
              {chapters.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button type="button" disabled={atLastChapter} onClick={() => openChapter(bookNumber, chapterNumber + 1)} className={ROUND_BUTTON} aria-label="Next chapter">
              <Icon name="next" />
            </button>
            <button type="button" onClick={() => setCaptureOpen(true)} className={`${ROUND_BUTTON} ml-md`} aria-label="Capture a prayer from this passage" title="Capture">
              <Icon name="capture" size={18} />
            </button>
          </div>

          {noBibleInstalled && (
            <div className="mx-auto mt-xxl flex flex-col gap-md" style={{ maxWidth: MEASURE }}>
              <h2 className="font-display text-[40px] font-semibold text-ink-primary">Let’s add a Bible</h2>
              <p className="font-scripture text-uiMd leading-relaxed text-ink-secondary">
                Breath &amp; Word reads entirely on your device. Download a translation once from the Library and it stays with you, even offline.
              </p>
            </div>
          )}
          {!noBibleInstalled && chapter === null && status !== 'error' && (
            <div className="mx-auto mt-xl flex w-full flex-col gap-md" style={{ maxWidth: MEASURE }} aria-label="Loading chapter">
              <div className="h-12 w-24 rounded-md bg-sunken" />
              {[92, 100, 86, 97, 70].map((w, i) => (
                <div key={i} className="h-4 rounded-pill bg-sunken" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {error !== null && !noBibleInstalled && (
            <p className="mx-auto mt-xl rounded-md bg-sunken p-lg font-ui text-uiSm text-ink-primary" style={{ maxWidth: MEASURE }} role="alert">
              {error.userMessage}
            </p>
          )}
          {chapter !== null && scripture}
        </div>

        {chapter !== null && verseForStudy !== null && (
          <div className={`flex shrink-0 py-lg pr-lg ${studyOpen ? 'w-[440px]' : 'w-auto items-start'}`}>
            {studyOpen ? (
              <StudyPanel
                key={studyTab}
                userId={userId}
                verseId={verseForStudy}
                reference={formatCanonicalRange(verseForStudy, verseForStudy)}
                packId={packId}
                translationCode={translationCode}
                wordFocus={wordFocus}
                initialTab={studyTab}
                onOpenVerse={openVerse}
                onCollapse={() => void stores.appearance.getState().update({ studyPanelOpen: false })}
              />
            ) : (
              <StudyRail
                onOpen={(nextTab) => {
                  setStudyTab(nextTab);
                  void stores.appearance.getState().update({ studyPanelOpen: true });
                }}
              />
            )}
          </div>
        )}
      </div>
      {chapter !== null && (
        <AudioMiniPlayer
          packId={packId}
          translationCode={translationCode}
          bookNumber={bookNumber}
          chapter={chapterNumber}
          reference={reference}
        />
      )}
      {footnoteSheet}
      <CapturePanel
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        chapter={chapter}
        reference={reference}
      />
    </section>
  );
}
