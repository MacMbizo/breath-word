// FR-101 structured reader — renders a chapter from the headless reader store.
// No SQL here (AGENTS.md rule 1): the store calls `ReaderRepository`, which owns the SQL.
//
// Canon-wide navigation: the book list comes from the pack's own `books` table (via the store's
// `loadBooks`), so the reader can move Genesis..Revelation, not just the default Romans 8. Prev/Next
// stay inside the current book's `chapterCount`.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { useReducedMotion } from 'framer-motion';

import { bookName, formatCanonicalRange, fromCanonicalVerseId, type Footnote, type SymbolTag } from '@breath-and-word/core';
import { INDUCTIVE_HIGHLIGHTS, SCRIPTURE_METRICS, inductiveCssVariable } from '@breath-and-word/tokens';

import { AudioMiniPlayer } from './AudioMiniPlayer';
import { CapturePanel } from './CapturePanel';
import { useCoreRuntime } from './CoreRuntime';
import { StudyPanel } from './study/StudyPanel';
import { useCurrentUserId } from './study/useCurrentUserId';
import { useCoreStore } from './useCoreStore';
import { VerseSpans } from './VerseSpans';

// Defaults open Romans 8 in the `core_bsb` pack (book numbers are canonical BBCCCVVV).
const DEFAULT_PACK_ID = 'core_bsb';
const DEFAULT_TRANSLATION = 'BSB';
const DEFAULT_BOOK = 45;
const DEFAULT_CHAPTER = 8;

const MEASURE = `${SCRIPTURE_METRICS.optimalMeasureCh.max}ch`;

const FIELD =
  'rounded-md border border-hairline bg-surface px-md py-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-xxs font-ui text-uiXs text-ink-secondary';
const BUTTON =
  'rounded-md border border-hairline px-lg py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40';

export interface ReaderViewProps {
  /** FR-104 — when true, all chrome is hidden and only the scripture typography shows. */
  readonly focusMode?: boolean;
  /** Enter Focus Mode from the reader toolbar. */
  readonly onEnterFocus?: () => void;
  /** Exit Focus Mode (the shell also wires the Escape key as the subtle exit gesture). */
  readonly onExitFocus?: () => void;
}

export function ReaderView({ focusMode = false, onEnterFocus, onExitFocus }: ReaderViewProps = {}) {
  const { stores } = useCoreRuntime();
  const { location, chapter, status, error, books } = useCoreStore(stores.reader);
  const [packId, setPackId] = useState(DEFAULT_PACK_ID);
  const [translationCode, setTranslationCode] = useState(DEFAULT_TRANSLATION);
  /** FR-101 — the footnote whose sheet is open, or `null` when the sheet is closed. */
  const [activeFootnote, setActiveFootnote] = useState<Footnote | null>(null);
  /** FR-201 — whether the ≤2-tap capture panel is open over the reader. */
  const [captureOpen, setCaptureOpen] = useState(false);
  /** FR-301..305 — the verse whose study tools are open in the side panel. */
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null);
  /** A verse to scroll to once its chapter has loaded (cross-reference / occurrence jumps). */
  const [pendingVerseId, setPendingVerseId] = useState<number | null>(null);
  const userId = useCurrentUserId();
  const { highlights } = useCoreStore(stores.study);
  const { activeVerseId: audioVerseId, isPlaying } = useCoreStore(stores.audio);
  const reduceMotion = useReducedMotion() === true;

  // The store is idle until asked, so open the default passage and its book list once on mount.
  useEffect(() => {
    void stores.reader.getState().openChapter({
      packId: DEFAULT_PACK_ID,
      translationCode: DEFAULT_TRANSLATION,
      bookNumber: DEFAULT_BOOK,
      chapter: DEFAULT_CHAPTER,
    });
    void stores.reader.getState().loadBooks(DEFAULT_PACK_ID, DEFAULT_TRANSLATION);
  }, [stores]);

  const bookNumber = location?.bookNumber ?? DEFAULT_BOOK;
  const chapterNumber = location?.chapter ?? DEFAULT_CHAPTER;
  const chapterCount = books.find((book) => book.bookNumber === bookNumber)?.chapterCount;
  const reference = `${bookName(bookNumber)} ${chapterNumber}`;

  const openChapter = useCallback(
    (nextBook: number, nextChapter: number) => {
      if (nextChapter < 1) return;
      void stores.reader.getState().openChapter({
        packId: location?.packId ?? packId,
        translationCode: location?.translationCode ?? translationCode,
        bookNumber: nextBook,
        chapter: nextChapter,
      });
    },
    [stores, location, packId, translationCode],
  );

  // Switching pack/translation reloads the book list and reopens the current passage under it.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void stores.reader.getState().loadBooks(packId, translationCode);
    void stores.reader.getState().openChapter({
      packId,
      translationCode,
      bookNumber,
      chapter: chapterNumber,
    });
  }

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
        style={{ maxWidth: MEASURE, lineHeight: 1.72 }}
      >
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
                  onClick={() => setSelectedVerseId(isSelected ? null : verse.canonicalVerseId)}
                  className="mr-xs align-super font-ui text-uiXs text-ink-verse hover:text-accent"
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
              />
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

  return (
    <section className="flex h-full flex-col gap-lg overflow-hidden">
      <form onSubmit={onSubmit} className="flex flex-col gap-sm">
        <div className="flex flex-wrap items-end gap-sm">
          <label className={`${LABEL} flex-1`}>
            Pack
            <input className={FIELD} value={packId} onChange={(e) => setPackId(e.target.value)} />
          </label>
          <label className={`${LABEL} w-32`}>
            Translation
            <input
              className={FIELD}
              value={translationCode}
              onChange={(e) => setTranslationCode(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent px-lg py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90"
          >
            Open
          </button>
          <button type="button" onClick={() => setCaptureOpen(true)} className={BUTTON}>
            Capture
          </button>
          {onEnterFocus !== undefined && (
            <button type="button" onClick={onEnterFocus} className={BUTTON}>
              Focus
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-sm">
          <span className="pb-sm font-ui text-uiMd text-ink-primary">{reference}</span>
          <label className={LABEL}>
            Book
            <select
              className={FIELD}
              value={bookNumber}
              onChange={(e) => openChapter(Number(e.target.value), 1)}
            >
              {books.length === 0 && <option value={bookNumber}>{bookName(bookNumber)}</option>}
              {books.map((book) => (
                <option key={book.bookNumber} value={book.bookNumber}>
                  {book.name}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Chapter
            <select
              className={FIELD}
              value={chapterNumber}
              onChange={(e) => openChapter(bookNumber, Number(e.target.value))}
            >
              {chapters.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={atFirstChapter}
            onClick={() => openChapter(bookNumber, chapterNumber - 1)}
            className={BUTTON}
          >
            ‹ Prev
          </button>
          <button
            type="button"
            disabled={atLastChapter}
            onClick={() => openChapter(bookNumber, chapterNumber + 1)}
            className={BUTTON}
          >
            Next ›
          </button>
        </div>
      </form>

      <div className="flex min-h-0 flex-1 gap-lg">
        <div className="flex-1 overflow-y-auto">
          {status === 'loading' && <p className="font-ui text-uiSm text-ink-secondary">Loading…</p>}
          {error !== null && (
            <p className="font-ui text-uiSm text-ink-red" role="alert">
              {error.userMessage}
            </p>
          )}
          {chapter === null && status === 'idle' && (
            <p className="font-ui text-uiSm text-ink-secondary">
              Open a chapter to begin reading.
            </p>
          )}
          {chapter !== null && scripture}
        </div>
        {selectedVerseId !== null && (
          <StudyPanel
            userId={userId}
            verseId={selectedVerseId}
            reference={formatCanonicalRange(selectedVerseId, selectedVerseId)}
            packId={location?.packId ?? packId}
            translationCode={location?.translationCode ?? translationCode}
            onOpenVerse={openVerse}
            onClose={() => setSelectedVerseId(null)}
          />
        )}
      </div>
      {chapter !== null && (
        <AudioMiniPlayer
          packId={location?.packId ?? packId}
          translationCode={location?.translationCode ?? translationCode}
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
