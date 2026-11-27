// FR-101 / FR-102 — choose translation, book and chapter in one calm sheet: translations as
// chips (only what is installed), then books, then that book's chapters as a number grid.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { BookSummary, TranslationSummary } from '@breath-and-word/core';
import { FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { makeStyles, useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../nav/Icon';
import { Sheet } from '../ui/Sheet';

export interface PassageSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly translations: readonly TranslationSummary[];
  readonly packId: string;
  readonly translationCode: string;
  readonly books: readonly BookSummary[];
  readonly bookNumber: number;
  readonly chapter: number;
  readonly onSelectTranslation: (t: TranslationSummary) => void;
  readonly onSelectChapter: (bookNumber: number, chapter: number) => void;
  readonly onCompare: () => void;
}

export function PassageSheet(props: PassageSheetProps) {
  const { visible, onClose, translations, packId, translationCode, books, bookNumber, chapter } = props;
  const styles = useStyles();
  const { colors } = useTheme();
  const [book, setBook] = useState<BookSummary | null>(null);

  // Every time the sheet opens it starts on the book list.
  useEffect(() => {
    if (visible) setBook(null);
  }, [visible]);

  const testaments: { label: string; books: BookSummary[] }[] = [
    { label: 'Old Testament', books: books.filter((b) => b.testament === 'OT') },
    { label: 'New Testament', books: books.filter((b) => b.testament === 'NT') },
  ].filter((group) => group.books.length > 0);

  return (
    <Sheet visible={visible} title={book === null ? 'Go to a passage' : book.name} onClose={onClose}>
      {book === null ? (
        <>
          {translations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.label}>Translation</Text>
              <View style={styles.wrap}>
                {translations.map((t) => {
                  const active = t.packId === packId && t.translationCode === translationCode;
                  return (
                    <Pressable
                      key={`${t.packId}:${t.translationCode}`}
                      onPress={() => props.onSelectTranslation(t)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t.name}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.translationCode}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={props.onCompare} accessibilityRole="button" style={styles.compare}>
                  <Icon name="compare" size={18} color={colors.accent.primary} />
                  <Text style={styles.compareText}>Compare</Text>
                </Pressable>
              </View>
            </View>
          )}
          {books.length === 0 && <Text style={styles.muted}>Install a Bible from the Library to browse the books.</Text>}
          {testaments.map((group) => (
            <View key={group.label} style={styles.section}>
              <Text style={styles.label}>{group.label}</Text>
              <View style={styles.wrap}>
                {group.books.map((b) => {
                  const active = b.bookNumber === bookNumber;
                  return (
                    <Pressable
                      key={b.bookNumber}
                      onPress={() => (b.chapterCount === 1 ? props.onSelectChapter(b.bookNumber, 1) : setBook(b))}
                      accessibilityRole="button"
                      style={[styles.chip, active && styles.chipCurrent]}
                    >
                      <Text style={styles.chipText}>{b.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.section}>
          <Pressable onPress={() => setBook(null)} accessibilityRole="button" style={styles.back}>
            <Icon name="back" size={18} color={colors.accent.primary} />
            <Text style={styles.compareText}>All books</Text>
          </Pressable>
          <View style={styles.grid}>
            {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((n) => {
              const current = book.bookNumber === bookNumber && n === chapter;
              return (
                <Pressable
                  key={n}
                  onPress={() => props.onSelectChapter(book.bookNumber, n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${book.name} chapter ${n}`}
                  style={[styles.cell, current && styles.chipActive]}
                >
                  <Text style={[styles.cellText, current && styles.chipTextActive]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((c, t) => ({
  section: { gap: SPACING.sm },
  label: {
    fontFamily: t.fonts.ui.semibold,
    fontSize: FONT_SIZES.uiXs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: c.text.secondary,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs + 2 },
  chip: {
    minHeight: MIN_TOUCH_TARGET - 4,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md + 2,
    borderRadius: RADII.pill,
    backgroundColor: c.bg.sunken,
  },
  chipCurrent: { borderWidth: 1.5, borderColor: c.accent.primary },
  chipActive: { backgroundColor: c.accent.primary },
  chipText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm, color: c.text.primary },
  chipTextActive: { color: c.text.onAccent },
  compare: {
    minHeight: MIN_TOUCH_TARGET - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  compareText: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm, color: c.accent.primary },
  back: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, minHeight: MIN_TOUCH_TARGET },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  cell: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: c.bg.sunken,
  },
  cellText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiMd, color: c.text.primary },
  muted: { fontFamily: t.fonts.ui.regular, fontSize: FONT_SIZES.uiSm, color: c.text.secondary },
}));
