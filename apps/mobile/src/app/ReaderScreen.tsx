// FR-101 structured reader (mobile) + FR-104 Focus Mode + FR-301 word card — design round 2026-11-28.
//
// Renders a chapter from the headless reader store; no SQL here (AGENTS.md rule 1).
//
//   header   — search · passage pill ("John 3 · KJV", opens book/chapter/translation) · "Aa"
//   page     — book name, the chapter numeral as a rubric, verses with rubric verse numbers;
//              chapter navigation sits at the end of the chapter, where the reader arrives
//   floating — above the pill nav: the word card when an aligned word is tapped, otherwise the
//              audio bar
//
// The reader reopens where it was last (device-local `lastPassage`), falls back to an installed
// translation, and shows a gentle way to the Library when no Bible is installed yet.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  bookName,
  strongsOccurrenceRank,
  type Footnote,
  type SymbolTag,
  type TranslationSummary,
  type Verse,
  type VerseWordAlignment,
} from '@breath-and-word/core';
import { FONT_SIZES, INDUCTIVE_HIGHLIGHTS, inductiveWash, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { makeStyles, useTheme } from '../theme/ThemeProvider';

import { AudioMiniPlayer } from './AudioMiniPlayer';
import { CaptureSheet } from './CaptureSheet';
import { useCoreRuntime } from './CoreRuntime';
import { setFocusMode, useFocusMode } from './nav/chrome';
import { useNavClearance } from './nav/FloatingNav';
import { Icon } from './nav/Icon';
import { PassageSheet } from './reader/PassageSheet';
import { ReadingSettingsSheet } from './reader/ReadingSettingsSheet';
import { WordCard } from './reader/WordCard';
import { useCurrentUserId } from './study/useCurrentUserId';
import { useCoreStore, useCoreStoreSelector } from './useCoreStore';
import { VerseSpans } from './VerseSpans';

/** A first open with nothing remembered starts at John 1 — "In the beginning was the Word". */
const FIRST_BOOK = 43;
const FIRST_CHAPTER = 1;
/** Preferred default translation pack when several are installed. */
const PREFERRED_PACK = 'core_bsb';

/** Where the reader opens; any field left out comes from the last passage or the defaults. */
export interface ReaderStart {
  readonly packId?: string;
  readonly translationCode?: string;
  readonly bookNumber?: number;
  readonly chapter?: number;
}

export interface ReaderScreenProps {
  /** Deep-link start (`/read?pack=trans_kjv&translation=KJV&book=43&chapter=3`). */
  readonly start?: ReaderStart;
}

interface ActiveWord {
  readonly alignment: VerseWordAlignment;
  readonly text: string;
}

export function ReaderScreen({ start }: ReaderScreenProps = {}) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const runtime = useCoreRuntime();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useCurrentUserId();
  const clearance = useNavClearance();
  const focusMode = useFocusMode();
  const { location, chapter, status, error, books, translations } = useCoreStore(runtime.stores.reader);
  // Select only the slices the page draws: a word lookup's loading flags must not re-render
  // every verse of the chapter.
  const highlights = useCoreStoreSelector(runtime.stores.study, (state) => state.highlights);
  const wordAlignments = useCoreStoreSelector(runtime.stores.study, (state) => state.wordAlignments);
  const narratedVerseId = useCoreStoreSelector(runtime.stores.audio, (state) => state.activeVerseId);

  const [translationsReady, setTranslationsReady] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** FR-201 — the ≤2-tap capture sheet (from "Pray it" or a long press on a verse). */
  const [captureOpen, setCaptureOpen] = useState(false);
  const [activeFootnote, setActiveFootnote] = useState<Footnote | null>(null);
  const [activeWord, setActiveWord] = useState<ActiveWord | null>(null);

  // Focus Mode is a reader state: leaving the reader always brings the chrome back.
  useEffect(() => () => setFocusMode(false), []);

  useEffect(() => {
    let live = true;
    void runtime.stores.reader
      .getState()
      .loadTranslations()
      .finally(() => {
        if (live) setTranslationsReady(true);
      });
    return () => {
      live = false;
    };
  }, [runtime]);

  // Decide where to open: an explicit deep link wins, then the remembered passage, then an
  // installed translation at John 1. Applied once per distinct start request.
  const lastPassage = theme.prefs.lastPassage;
  const target = useMemo(() => {
    if (!translationsReady) return null;
    const installed = (packId: string, code: string) => translations.some((t) => t.packId === packId && t.translationCode === code);
    if (start?.packId !== undefined && start.translationCode !== undefined) {
      return { packId: start.packId, translationCode: start.translationCode, bookNumber: start.bookNumber ?? FIRST_BOOK, chapter: start.chapter ?? FIRST_CHAPTER };
    }
    if (lastPassage !== null && installed(lastPassage.packId, lastPassage.translationCode) && start?.bookNumber === undefined) {
      return lastPassage;
    }
    const fallback = translations.find((t) => t.packId === PREFERRED_PACK) ?? translations[0];
    if (fallback === undefined) return null;
    return { packId: fallback.packId, translationCode: fallback.translationCode, bookNumber: start?.bookNumber ?? FIRST_BOOK, chapter: start?.chapter ?? FIRST_CHAPTER };
  }, [translationsReady, translations, start, lastPassage]);

  const appliedStart = useRef<string | null>(null);
  const startKey = JSON.stringify(start ?? {});
  useEffect(() => {
    if (target === null || appliedStart.current === startKey) return;
    appliedStart.current = startKey;
    void runtime.stores.reader.getState().openChapter(target);
    void runtime.stores.reader.getState().loadBooks(target.packId, target.translationCode);
  }, [runtime, target, startKey]);

  // Remember the passage each time a chapter opens successfully.
  const update = theme.update;
  const locationKey = location === null ? null : `${location.packId}|${location.translationCode}|${location.bookNumber}|${location.chapter}`;
  useEffect(() => {
    if (status !== 'ready' || location === null) return;
    const last = lastPassage;
    const lastKey = last === null ? null : `${last.packId}|${last.translationCode}|${last.bookNumber}|${last.chapter}`;
    if (lastKey !== locationKey) update({ lastPassage: location });
    // `location` is captured via its key; re-run only when the passage (or load status) changes.
  }, [status, locationKey, update]);

  const packId = location?.packId ?? target?.packId ?? PREFERRED_PACK;
  const translationCode = location?.translationCode ?? target?.translationCode ?? '';
  const bookNumber = location?.bookNumber ?? target?.bookNumber ?? FIRST_BOOK;
  const chapterNumber = location?.chapter ?? target?.chapter ?? FIRST_CHAPTER;
  const chapterCount = books.find((book) => book.bookNumber === bookNumber)?.chapterCount;
  const reference = `${bookName(bookNumber)} ${chapterNumber}`;

  const openChapter = useCallback(
    (nextBook: number, nextChapter: number, translation?: TranslationSummary) => {
      if (nextChapter < 1) return;
      setActiveWord(null);
      const next = {
        packId: translation?.packId ?? packId,
        translationCode: translation?.translationCode ?? translationCode,
        bookNumber: nextBook,
        chapter: nextChapter,
      };
      void runtime.stores.reader.getState().openChapter(next);
      if (translation !== undefined) void runtime.stores.reader.getState().loadBooks(next.packId, next.translationCode);
    },
    [runtime, packId, translationCode],
  );

  // FR-101 — footnote markers resolve to the chapter's note bodies.
  const footnotesById = useMemo(() => new Map((chapter?.footnotes ?? []).map((note) => [note.footnoteId, note])), [chapter]);
  const openFootnote = useCallback(
    (footnoteId: string) => {
      const note = footnotesById.get(footnoteId);
      if (note !== undefined) setActiveFootnote(note);
    },
    [footnotesById],
  );

  // FR-304 highlights and FR-301 word alignments for the open chapter.
  const firstVerseId = chapter?.verses[0]?.canonicalVerseId;
  const lastVerseId = chapter?.verses[chapter.verses.length - 1]?.canonicalVerseId;
  useEffect(() => {
    if (userId === null || firstVerseId === undefined || lastVerseId === undefined) return;
    void runtime.stores.study.getState().loadRangeStudy(userId, firstVerseId, lastVerseId, translationCode);
  }, [runtime, userId, firstVerseId, lastVerseId, translationCode]);
  useEffect(() => {
    if (firstVerseId === undefined || lastVerseId === undefined) return;
    void runtime.stores.study.getState().loadRangeAlignments(packId, translationCode, firstVerseId, lastVerseId);
  }, [runtime, packId, translationCode, firstVerseId, lastVerseId]);

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

  // FR-301..305 — a verse number opens that verse's study tools.
  const openStudy = useCallback(
    (canonicalVerseId: number) => {
      router.push({ pathname: '/study', params: { verse: String(canonicalVerseId), pack: packId, translation: translationCode } });
    },
    [router, packId, translationCode],
  );

  const openWord = useCallback(
    (alignment: VerseWordAlignment) => {
      const verse = chapter?.verses.find((v) => v.canonicalVerseId === alignment.canonicalVerseId);
      const text = verse?.spans[alignment.spanIndex]?.text.slice(alignment.charStart, alignment.charEnd) ?? '';
      setActiveWord({ alignment, text });
    },
    [chapter],
  );

  const openCapture = useCallback(() => setCaptureOpen(true), []);

  const openWordStudy = useCallback(() => {
    if (activeWord === null) return;
    const { alignment } = activeWord;
    const verseAlignments = wordAlignments.get(alignment.canonicalVerseId) ?? [];
    setActiveWord(null);
    router.push({
      pathname: '/study',
      params: {
        verse: String(alignment.canonicalVerseId),
        pack: packId,
        translation: translationCode,
        ...(alignment.strongsId !== undefined ? { strongs: alignment.strongsId } : {}),
        ...(alignment.interlinearWordPos !== undefined ? { wordPos: String(alignment.interlinearWordPos) } : {}),
        rank: String(strongsOccurrenceRank(verseAlignments, alignment)),
      },
    });
  }, [activeWord, wordAlignments, router, packId, translationCode]);

  const atFirstChapter = chapterNumber <= 1;
  const atLastChapter = chapterCount !== undefined && chapterNumber >= chapterCount;
  const noBibleInstalled = translationsReady && translations.length === 0;
  const floatingBottom = clearance - SPACING.lg + SPACING.sm;

  return (
    <View style={styles.root}>
      {!focusMode && (
        <View style={styles.header}>
          <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search scripture" style={styles.iconButton}>
            <Icon name="search" color={colors.text.secondary} />
          </Pressable>
          <Pressable
            onPress={() => setPassageOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${reference}${translationCode !== '' ? `, ${translationCode}` : ''}. Change passage`}
            style={styles.passagePill}
          >
            <Text style={styles.passageText} numberOfLines={1}>
              {reference}
              {translationCode !== '' && <Text style={styles.passageCode}>{`  ·  ${translationCode}`}</Text>}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} accessibilityRole="button" accessibilityLabel="Reading settings" style={styles.iconButton}>
            <Text style={styles.aa}>Aa</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: focusMode ? insets.bottom + SPACING.xxxl : clearance + 76 }]}>
        {noBibleInstalled && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Let’s add a Bible</Text>
            <Text style={styles.emptyBody}>
              Breath & Word reads entirely on your device. Download a translation once from the Library and it stays with you, even offline.
            </Text>
            <Pressable onPress={() => router.navigate('/library')} accessibilityRole="button" style={styles.primary}>
              <Text style={styles.primaryText}>Open the Library</Text>
            </Pressable>
          </View>
        )}

        {!noBibleInstalled && chapter === null && status !== 'error' && (
          <View style={styles.skeleton} accessibilityLabel="Loading chapter">
            <View style={[styles.skeletonLine, { width: '30%', height: 48 }]} />
            {[92, 100, 86, 97, 70].map((w, i) => (
              <View key={i} style={[styles.skeletonLine, { width: `${w}%` }]} />
            ))}
          </View>
        )}

        {error !== null && !noBibleInstalled && (
          <View style={styles.notice} accessibilityRole="alert">
            <Text style={styles.noticeText}>{error.userMessage}</Text>
            <Pressable onPress={() => setPassageOpen(true)} accessibilityRole="button">
              <Text style={styles.link}>Choose another passage</Text>
            </Pressable>
          </View>
        )}

        {chapter !== null && (
          <>
            <View style={styles.opening}>
              <Text style={styles.bookLabel}>{bookName(bookNumber)}</Text>
              <Text style={styles.numeral} accessibilityLabel={`Chapter ${chapterNumber}`}>
                {chapterNumber}
              </Text>
            </View>

            {chapter.verses.length === 0 && <Text style={styles.muted}>{`No text is available for ${reference}.`}</Text>}

            {chapter.verses.map((verse) => (
              <VerseRow
                key={verse.canonicalVerseId}
                verse={verse}
                symbols={symbolsByVerse.get(verse.canonicalVerseId)}
                narrated={narratedVerseId === verse.canonicalVerseId}
                focusMode={focusMode}
                alignments={wordAlignments.get(verse.canonicalVerseId)}
                activeAlignmentId={activeWord?.alignment.canonicalVerseId === verse.canonicalVerseId ? activeWord.alignment.id : undefined}
                onStudyVerse={openStudy}
                onWord={openWord}
                onFootnote={openFootnote}
                onCapture={openCapture}
              />
            ))}

            {!focusMode && (
              <View style={styles.chapterNav}>
                <Pressable
                  disabled={atFirstChapter}
                  onPress={() => openChapter(bookNumber, chapterNumber - 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Previous chapter, ${bookName(bookNumber)} ${chapterNumber - 1}`}
                  style={[styles.chapterButton, atFirstChapter && styles.hidden]}
                >
                  <Icon name="back" size={16} color={colors.text.secondary} />
                  <Text style={styles.chapterButtonText}>{`${bookName(bookNumber)} ${chapterNumber - 1}`}</Text>
                </Pressable>
                <Pressable
                  disabled={atLastChapter}
                  onPress={() => openChapter(bookNumber, chapterNumber + 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Next chapter, ${bookName(bookNumber)} ${chapterNumber + 1}`}
                  style={[styles.chapterButton, styles.chapterButtonNext, atLastChapter && styles.hidden]}
                >
                  <Text style={styles.chapterButtonNextText}>{`${bookName(bookNumber)} ${chapterNumber + 1}`}</Text>
                  <Icon name="chevronRight" size={16} color={colors.text.onAccent} />
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!focusMode && chapter !== null && (
        <View style={[styles.floating, { bottom: floatingBottom }]} pointerEvents="box-none">
          {activeWord !== null ? (
            <WordCard
              alignment={activeWord.alignment}
              englishWord={activeWord.text}
              packId={packId}
              translationCode={translationCode}
              mode={theme.prefs.wordView}
              onOpenStudy={openWordStudy}
              onPray={() => setCaptureOpen(true)}
              onClose={() => setActiveWord(null)}
            />
          ) : (
            <AudioMiniPlayer floating packId={packId} translationCode={translationCode} bookNumber={bookNumber} chapter={chapterNumber} reference={reference} />
          )}
        </View>
      )}

      {focusMode && (
        <Pressable
          onPress={() => setFocusMode(false)}
          accessibilityRole="button"
          accessibilityLabel="Exit focus mode"
          style={[styles.exitFocus, { top: SPACING.md }]}
        >
          <Text style={styles.exitFocusText}>Exit focus</Text>
        </Pressable>
      )}

      <PassageSheet
        visible={passageOpen}
        onClose={() => setPassageOpen(false)}
        translations={translations}
        packId={packId}
        translationCode={translationCode}
        books={books}
        bookNumber={bookNumber}
        chapter={chapterNumber}
        onSelectTranslation={(t) => {
          openChapter(bookNumber, chapterNumber, t);
        }}
        onSelectChapter={(b, c) => {
          setPassageOpen(false);
          openChapter(b, c);
        }}
        onCompare={() => {
          setPassageOpen(false);
          router.push('/compare');
        }}
      />

      <ReadingSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} onFocusMode={() => setFocusMode(true)} />

      <Modal visible={activeFootnote !== null} animationType="slide" transparent onRequestClose={() => setActiveFootnote(null)}>
        <View style={styles.noteBackdrop}>
          <View style={[styles.noteSheet, { paddingBottom: insets.bottom + SPACING.xl }]}>
            <View style={styles.noteHeader}>
              <Text style={styles.noteTitle}>{`Note ${activeFootnote?.marker ?? ''}`}</Text>
              <Pressable onPress={() => setActiveFootnote(null)} accessibilityRole="button" accessibilityLabel="Close footnote" style={styles.closeChip}>
                <Text style={styles.closeChipText}>Done</Text>
              </Pressable>
            </View>
            <Text style={styles.noteText}>{activeFootnote?.bodyText ?? ''}</Text>
          </View>
        </View>
      </Modal>

      <CaptureSheet visible={captureOpen} onClose={() => setCaptureOpen(false)} chapter={chapter} reference={reference} />
    </View>
  );
}

interface VerseRowProps {
  readonly verse: Verse;
  readonly symbols: readonly SymbolTag[] | undefined;
  readonly narrated: boolean;
  readonly focusMode: boolean;
  readonly alignments: readonly VerseWordAlignment[] | undefined;
  readonly activeAlignmentId: number | undefined;
  readonly onStudyVerse: (canonicalVerseId: number) => void;
  readonly onWord: (alignment: VerseWordAlignment) => void;
  readonly onFootnote: (footnoteId: string) => void;
  readonly onCapture: () => void;
}

/** One verse paragraph. Memoised: tapping a word re-renders only the verse it touched. */
const VerseRow = memo(function VerseRow({
  verse,
  symbols,
  narrated,
  focusMode,
  alignments,
  activeAlignmentId,
  onStudyVerse,
  onWord,
  onFootnote,
  onCapture,
}: VerseRowProps) {
  const styles = useStyles();
  const { name: themeName } = useTheme();
  const wash = symbols?.[0];
  return (
    <Text
      style={[styles.verse, wash !== undefined && { backgroundColor: inductiveWash(wash, themeName) }, narrated && styles.verseNarrated]}
      onLongPress={focusMode ? undefined : onCapture}
    >
      <Text
        style={styles.verseNumber}
        onPress={focusMode ? undefined : () => onStudyVerse(verse.canonicalVerseId)}
        accessibilityRole={focusMode ? undefined : 'button'}
        accessibilityLabel={focusMode ? undefined : `Study verse ${verse.verse}`}
        suppressHighlighting={false}
      >{`${verse.verse}\u2009 `}</Text>
      <VerseSpans
        verseId={verse.canonicalVerseId}
        spans={verse.spans}
        onFootnotePress={onFootnote}
        {...(focusMode ? {} : { alignments, onWordPress: onWord, ...(activeAlignmentId !== undefined ? { activeAlignmentId } : {}) })}
      />
      {symbols !== undefined && symbols.length > 0 && (
        <Text style={styles.verseNumber} accessibilityLabel={symbols.map((sym) => INDUCTIVE_HIGHLIGHTS[sym].meaning).join(', ')}>
          {`  ${symbols.map((sym) => INDUCTIVE_HIGHLIGHTS[sym].badge).join(' ')}`}
        </Text>
      )}
    </Text>
  );
});

const useStyles = makeStyles((c, t) => ({
  root: { flex: 1, backgroundColor: c.bg.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aa: { fontFamily: t.fonts.scripture.regular, fontSize: 18, color: c.text.secondary },
  passagePill: {
    flexShrink: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg + 2,
    borderRadius: RADII.pill,
    backgroundColor: c.bg.elevated,
  },
  passageText: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm + 1, color: c.text.primary },
  passageCode: { fontFamily: t.fonts.ui.medium, color: c.text.secondary },
  content: { paddingHorizontal: SPACING.xl + 2, paddingTop: SPACING.sm, gap: SPACING.sm + 2 },
  opening: { gap: 2, marginTop: SPACING.md, marginBottom: SPACING.sm },
  bookLabel: {
    fontFamily: t.fonts.ui.medium,
    fontSize: FONT_SIZES.uiXs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: c.text.secondary,
  },
  numeral: {
    // Literata, not Cormorant: the bundled Cormorant build draws an old-style "1" that reads as a
    // Roman "I" and Android ignores its lining-figure feature. Cormorant stays for titles.
    fontFamily: t.fonts.scripture.medium,
    fontSize: FONT_SIZES.chapterNumeral - 6,
    lineHeight: (FONT_SIZES.chapterNumeral - 6) * 1.1,
    color: c.accent.rubric,
  },
  verse: {
    fontFamily: t.fonts.scripture.regular,
    fontSize: t.scriptureSize,
    lineHeight: t.scriptureLineHeight,
    color: c.text.primary,
  },
  verseNarrated: { backgroundColor: c.bg.elevated },
  verseNumber: {
    fontFamily: t.fonts.ui.semibold,
    fontSize: Math.max(10, Math.round(t.scriptureSize * 0.55)),
    color: c.text.verseNum,
  },
  chapterNav: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, marginTop: SPACING.xl },
  chapterButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: c.bg.elevated,
  },
  chapterButtonText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm, color: c.text.primary },
  chapterButtonNext: { backgroundColor: c.accent.primary },
  chapterButtonNextText: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm, color: c.text.onAccent },
  hidden: { opacity: 0 },
  floating: { position: 'absolute', left: SPACING.md, right: SPACING.md },
  muted: { fontFamily: t.fonts.ui.regular, fontSize: FONT_SIZES.uiSm, color: c.text.secondary },
  link: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm, color: c.accent.primary },
  notice: { gap: SPACING.sm, padding: SPACING.lg, borderRadius: 16, backgroundColor: c.bg.sunken, marginTop: SPACING.lg },
  noticeText: { fontFamily: t.fonts.ui.regular, fontSize: FONT_SIZES.uiSm + 1, color: c.text.primary },
  empty: { gap: SPACING.md, marginTop: SPACING.xxl },
  emptyTitle: { fontFamily: t.fonts.display.semibold, fontSize: 34, color: c.text.primary },
  emptyBody: { fontFamily: t.fonts.scripture.regular, fontSize: FONT_SIZES.uiMd, lineHeight: FONT_SIZES.uiMd * 1.6, color: c.text.secondary },
  primary: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: c.accent.primary,
  },
  primaryText: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm + 1, color: c.text.onAccent },
  skeleton: { gap: SPACING.md, marginTop: SPACING.lg },
  skeletonLine: { height: 16, borderRadius: 8, backgroundColor: c.bg.sunken },
  exitFocus: {
    position: 'absolute',
    right: SPACING.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    backgroundColor: c.bg.elevated,
    opacity: 0.55,
  },
  exitFocusText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiXs, color: c.text.secondary },
  noteBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  noteSheet: {
    padding: SPACING.xl,
    gap: SPACING.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: c.bg.surface,
    borderTopWidth: 1,
    borderColor: c.border.strong,
    shadowColor: c.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  noteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteTitle: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiMd, color: c.text.primary },
  closeChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, backgroundColor: c.bg.elevated },
  closeChipText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm, color: c.text.primary },
  noteText: { fontFamily: t.fonts.scripture.regular, fontSize: FONT_SIZES.uiMd, lineHeight: FONT_SIZES.uiMd * 1.6, color: c.text.primary },
}));
