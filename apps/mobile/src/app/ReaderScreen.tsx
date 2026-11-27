// FR-101 structured reader (mobile) + FR-104 Focus Mode — B3 §4.1.
//
// Renders a chapter from the headless reader store; no SQL here (AGENTS.md rule 1). A book picker
// drives canon-wide navigation (Genesis..Revelation) from the pack's own book list, and Prev/Next
// stay inside the current book. Focus Mode hides every control so only the scripture typography
// remains, with a low-contrast exit control as the discoverable way back (the desktop shell
// additionally binds Escape).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import {
  bookName,
  strongsOccurrenceRank,
  type BookSummary,
  type Footnote,
  type SymbolTag,
  type VerseWordAlignment,
} from '@breath-and-word/core';
import {
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  INDUCTIVE_HIGHLIGHTS,
  LINE_HEIGHTS,
  MIN_TOUCH_TARGET,
  RADII,
  SPACING,
  inductiveWash,
} from '@breath-and-word/tokens';

import { AudioMiniPlayer } from './AudioMiniPlayer';
import { CaptureSheet } from './CaptureSheet';
import { useCoreRuntime } from './CoreRuntime';
import { useCurrentUserId } from './study/useCurrentUserId';
import { useCoreStore } from './useCoreStore';
import { VerseSpans } from './VerseSpans';

/** The default (daylight) theme; theme switching lands with the appearance settings. */
const THEME = COLORS.daylight;

// Defaults open Romans 8 in the `core_bsb` pack (book numbers are canonical BBCCCVVV).
const DEFAULT_PACK_ID = 'core_bsb';
const DEFAULT_TRANSLATION = 'BSB';
const DEFAULT_BOOK = 45;
const DEFAULT_CHAPTER = 8;

/** Where the reader opens; every field falls back to the Romans 8 / BSB default. */
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

export function ReaderScreen({ start }: ReaderScreenProps = {}) {
  const runtime = useCoreRuntime();
  const { location, chapter, status, error, books } = useCoreStore(runtime.stores.reader);
  const [focusMode, setFocusMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** FR-201 — whether the ≤2-tap capture sheet is open over the reader. */
  const [captureOpen, setCaptureOpen] = useState(false);
  /** FR-101 — the footnote whose sheet is open, or `null` when the sheet is closed. */
  const [activeFootnote, setActiveFootnote] = useState<Footnote | null>(null);
  const router = useRouter();
  const userId = useCurrentUserId();
  const { highlights, wordAlignments } = useCoreStore(runtime.stores.study);
  const { activeVerseId: narratedVerseId } = useCoreStore(runtime.stores.audio);

  // The store is idle until asked, so open the start passage and its book list on mount (and
  // again whenever a deep link names a different start).
  const startPack = start?.packId ?? DEFAULT_PACK_ID;
  const startTranslation = start?.translationCode ?? DEFAULT_TRANSLATION;
  const startBook = start?.bookNumber ?? DEFAULT_BOOK;
  const startChapter = start?.chapter ?? DEFAULT_CHAPTER;
  useEffect(() => {
    void runtime.stores.reader.getState().openChapter({
      packId: startPack,
      translationCode: startTranslation,
      bookNumber: startBook,
      chapter: startChapter,
    });
    void runtime.stores.reader.getState().loadBooks(startPack, startTranslation);
  }, [runtime, startPack, startTranslation, startBook, startChapter]);

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

  const bookNumber = location?.bookNumber ?? DEFAULT_BOOK;
  const chapterNumber = location?.chapter ?? DEFAULT_CHAPTER;
  const chapterCount = books.find((book) => book.bookNumber === bookNumber)?.chapterCount;
  const reference = `${bookName(bookNumber)} ${chapterNumber}`;

  const openChapter = useCallback(
    (nextBook: number, nextChapter: number) => {
      if (nextChapter < 1) return;
      void runtime.stores.reader.getState().openChapter({
        packId: location?.packId ?? DEFAULT_PACK_ID,
        translationCode: location?.translationCode ?? DEFAULT_TRANSLATION,
        bookNumber: nextBook,
        chapter: nextChapter,
      });
    },
    [runtime, location],
  );

  const selectBook = useCallback(
    (book: BookSummary) => {
      setPickerOpen(false);
      openChapter(book.bookNumber, 1);
    },
    [openChapter],
  );

  const atFirstChapter = chapterNumber <= 1;
  const atLastChapter = chapterCount !== undefined && chapterNumber >= chapterCount;
  const packId = location?.packId ?? DEFAULT_PACK_ID;
  const translationCode = location?.translationCode ?? DEFAULT_TRANSLATION;

  // FR-304 — load the chapter's highlights so verses carry their inductive washes and badges.
  const firstVerseId = chapter?.verses[0]?.canonicalVerseId;
  const lastVerseId = chapter?.verses[chapter.verses.length - 1]?.canonicalVerseId;
  useEffect(() => {
    if (userId === null || firstVerseId === undefined || lastVerseId === undefined) return;
    void runtime.stores.study.getState().loadRangeStudy(userId, firstVerseId, lastVerseId, translationCode);
  }, [runtime, userId, firstVerseId, lastVerseId, translationCode]);

  // FR-301 — aligned English words for the chapter (empty when the translation carries none).
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
      router.push({
        pathname: '/study',
        params: { verse: String(canonicalVerseId), pack: packId, translation: translationCode },
      });
    },
    [router, packId, translationCode],
  );

  // FR-301 — tapping an aligned English word opens study focused on that word's original token.
  const openWord = useCallback(
    (alignment: VerseWordAlignment) => {
      const verseAlignments = wordAlignments.get(alignment.canonicalVerseId) ?? [];
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
    },
    [router, packId, translationCode, wordAlignments],
  );

  return (
    <View style={styles.root}>
      {!focusMode && (
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.reference}>{reference}</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setCaptureOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Capture passage"
                style={styles.focusButton}
              >
                <Text style={styles.focusButtonText}>Capture</Text>
              </Pressable>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose a book"
                style={styles.focusButton}
              >
                <Text style={styles.focusButtonText}>Books</Text>
              </Pressable>
              <Pressable
                onPress={() => setFocusMode(true)}
                accessibilityRole="button"
                style={styles.focusButton}
              >
                <Text style={styles.focusButtonText}>Focus</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.navRow}>
            <Pressable
              disabled={atFirstChapter}
              onPress={() => openChapter(bookNumber, chapterNumber - 1)}
              accessibilityRole="button"
              style={[styles.navButton, atFirstChapter && styles.navButtonDisabled]}
            >
              <Text style={styles.navButtonText}>‹ Prev</Text>
            </Pressable>
            <Pressable
              disabled={atLastChapter}
              onPress={() => openChapter(bookNumber, chapterNumber + 1)}
              accessibilityRole="button"
              style={[styles.navButton, atLastChapter && styles.navButtonDisabled]}
            >
              <Text style={styles.navButtonText}>Next ›</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {status === 'loading' && <Text style={styles.muted}>Loading…</Text>}
        {error !== null && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error.userMessage}
          </Text>
        )}
        {chapter !== null && chapter.verses.length === 0 && error === null && (
          <Text style={styles.muted}>{`No text is available for ${reference}.`}</Text>
        )}
        {chapter !== null &&
          chapter.verses.map((verse) => {
            const symbols = symbolsByVerse.get(verse.canonicalVerseId) ?? [];
            const wash = symbols[0];
            const narrated = narratedVerseId === verse.canonicalVerseId;
            return (
              <Text
                key={verse.canonicalVerseId}
                style={[
                  styles.verse,
                  wash !== undefined && { backgroundColor: inductiveWash(wash, 'daylight') },
                  narrated && styles.verseNarrated,
                ]}
              >
                <Text
                  style={styles.verseNumber}
                  onPress={focusMode ? undefined : () => openStudy(verse.canonicalVerseId)}
                  accessibilityRole={focusMode ? undefined : 'button'}
                  accessibilityLabel={focusMode ? undefined : `Study verse ${verse.verse}`}
                  suppressHighlighting={false}
                >{`${verse.verse}  `}</Text>
                <VerseSpans
                  verseId={verse.canonicalVerseId}
                  spans={verse.spans}
                  onFootnotePress={openFootnote}
                  {...(focusMode
                    ? {}
                    : { alignments: wordAlignments.get(verse.canonicalVerseId), onWordPress: openWord })}
                />
                {symbols.length > 0 && (
                  <Text style={styles.verseNumber} accessibilityLabel={symbols.map((sym) => INDUCTIVE_HIGHLIGHTS[sym].meaning).join(', ')}>
                    {`  ${symbols.map((sym) => INDUCTIVE_HIGHLIGHTS[sym].badge).join(' ')}`}
                  </Text>
                )}
              </Text>
            );
          })}
      </ScrollView>

      {!focusMode && chapter !== null && (
        <AudioMiniPlayer
          packId={packId}
          translationCode={translationCode}
          bookNumber={bookNumber}
          chapter={chapterNumber}
          reference={reference}
        />
      )}

      {focusMode && (
        <Pressable
          onPress={() => setFocusMode(false)}
          accessibilityRole="button"
          accessibilityLabel="Exit focus mode"
          style={styles.exitFocus}
        >
          <Text style={styles.exitFocusText}>Exit focus</Text>
        </Pressable>
      )}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose a book</Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close book picker"
                style={styles.navButton}
              >
                <Text style={styles.navButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.bookGrid}>
              {books.length === 0 && (
                <Text style={styles.muted}>Install a Bible pack to browse the books.</Text>
              )}
              {books.map((book) => {
                const active = book.bookNumber === bookNumber;
                return (
                  <Pressable
                    key={book.bookNumber}
                    onPress={() => selectBook(book)}
                    accessibilityRole="button"
                    style={[styles.bookChip, active && styles.bookChipActive]}
                  >
                    <Text style={[styles.bookChipText, active && styles.bookChipTextActive]}>
                      {book.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeFootnote !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveFootnote(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{`Note ${activeFootnote?.marker ?? ''}`}</Text>
              <Pressable
                onPress={() => setActiveFootnote(null)}
                accessibilityRole="button"
                accessibilityLabel="Close footnote"
                style={styles.navButton}
              >
                <Text style={styles.navButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.footnoteBody}>
              <Text style={styles.footnoteText}>{activeFootnote?.bodyText ?? ''}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CaptureSheet
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        chapter={chapter}
        reference={reference}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg.canvas },
  header: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border.subtle,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: SPACING.sm },
  reference: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  focusButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  focusButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  navRow: { flexDirection: 'row', gap: SPACING.sm },
  navButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: THEME.bg.elevated,
  },
  navButtonDisabled: { opacity: 0.4 },
  navButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.sm,
  },
  verse: {
    fontFamily: FONT_FAMILIES.scriptureSerif,
    fontSize: FONT_SIZES.scriptureDefault,
    lineHeight: FONT_SIZES.scriptureDefault * LINE_HEIGHTS.scripture,
    color: THEME.text.primary,
  },
  verseNarrated: {
    // FR-106 — the verse being narrated: a soft accent wash readers can follow by eye.
    backgroundColor: THEME.bg.elevated,
    color: THEME.text.primary,
  },
  verseNumber: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.verseNum,
  },
  muted: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  error: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.redLetter,
  },
  exitFocus: {
    position: 'absolute',
    top: SPACING.xl,
    right: SPACING.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
    opacity: 0.4,
  },
  exitFocusText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: THEME.bg.elevated,
  },
  modalSheet: {
    maxHeight: '80%',
    padding: SPACING.xl,
    gap: SPACING.md,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: THEME.bg.surface,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingBottom: SPACING.xl },
  bookChip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  bookChipActive: { backgroundColor: THEME.accent.primary, borderColor: THEME.accent.primary },
  bookChipText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  bookChipTextActive: { color: THEME.bg.canvas },
  footnoteBody: { paddingBottom: SPACING.xl },
  footnoteText: {
    fontFamily: FONT_FAMILIES.scriptureSerif,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * LINE_HEIGHTS.ui,
    color: THEME.text.primary,
  },
});
