// FR-103 offline FTS5 search (mobile) — runs a local `verses_fts` MATCH through the headless
// reader store and highlights the `[[…]]`-wrapped snippet terms. No SQL here (AGENTS.md rule 1):
// the store calls `ReaderRepository`, which owns the query.

import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';

import { formatCanonicalRange } from '@breath-and-word/core';
import { FONT_FACES, FONT_SIZES, LINE_HEIGHTS, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';
import { makeStyles, useTheme } from '../theme/ThemeProvider';

/** The default (daylight) theme; theme switching lands with the appearance settings. */

const DEFAULT_PACK_ID = 'core_bsb';

/** FR-103 "testament filters" — `''` means no testament restriction. */
const TESTAMENT_OPTIONS: readonly { readonly value: '' | 'OT' | 'NT'; readonly label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OT', label: 'OT' },
  { value: 'NT', label: 'NT' },
];

/** Split an FTS5 `snippet(...)` on its `[[…]]` match markers, emphasising the matched terms. */
function renderSnippet(snippet: string, keyPrefix: string, matchStyle: TextStyle): ReactNode[] {
  return snippet.split(/(\[\[.*?\]\])/g).map((part, index) =>
    part.startsWith('[[') && part.endsWith(']]') ? (
      <Text key={`${keyPrefix}-${index}`} style={matchStyle}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

export function SearchScreen() {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  const runtime = useCoreRuntime();
  const { searchQuery, searchResults, searchStatus, searchError } = useCoreStore(runtime.stores.reader);
  const [packId, setPackId] = useState(DEFAULT_PACK_ID);
  const [translationCode, setTranslationCode] = useState('');
  const [bookNumber, setBookNumber] = useState('');
  const [testament, setTestament] = useState<'' | 'OT' | 'NT'>('');
  const [text, setText] = useState('');

  function search() {
    const translation = translationCode.trim();
    const book = bookNumber.trim();
    void runtime.stores.reader.getState().search({
      packId,
      text,
      translationCode: translation === '' ? undefined : translation,
      bookNumber: book === '' ? undefined : Number(book),
      testament: testament === '' ? undefined : testament,
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Pack</Text>
          <TextInput
            style={styles.input}
            value={packId}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPackId}
          />
        </View>
        <View style={styles.refRow}>
          <View style={[styles.field, styles.refField]}>
            <Text style={styles.label}>Translation (opt.)</Text>
            <TextInput
              style={styles.input}
              value={translationCode}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="BSB"
              placeholderTextColor={THEME.text.verseNum}
              onChangeText={setTranslationCode}
            />
          </View>
          <View style={[styles.field, styles.refField]}>
            <Text style={styles.label}>Book (opt.)</Text>
            <TextInput
              style={styles.input}
              inputMode="numeric"
              value={bookNumber}
              placeholder="45"
              placeholderTextColor={THEME.text.verseNum}
              onChangeText={setBookNumber}
            />
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Testament (opt.)</Text>
          <View style={styles.segmentedRow}>
            {TESTAMENT_OPTIONS.map((option) => {
              const active = testament === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTestament(option.value)}
                  style={[styles.segment, active && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Query (FTS5)</Text>
          <TextInput
            style={styles.input}
            value={text}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={'shepherd AND valley  ·  "living water"  ·  stead*'}
            placeholderTextColor={THEME.text.verseNum}
            onChangeText={setText}
          />
        </View>
        <Pressable onPress={search} accessibilityRole="button" style={styles.submitButton}>
          <Text style={styles.submitButtonText}>Search</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {searchStatus === 'loading' && <Text style={styles.muted}>Searching…</Text>}
        {searchStatus === 'idle' && (
          <Text style={styles.muted}>Search runs entirely offline against the installed pack.</Text>
        )}
        {searchError !== null && (
          <Text accessibilityRole="alert" style={styles.error}>
            {searchError.userMessage}
          </Text>
        )}
        {searchStatus === 'ready' && (
          <>
            <Text style={styles.summary}>
              {searchResults.length === 0
                ? `No verses matched "${searchQuery}".`
                : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'} for "${searchQuery}"`}
            </Text>
            {searchResults.map((hit) => {
              const key = `${hit.canonicalVerseId}-${hit.translationCode}`;
              return (
                <View key={key} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardReference}>
                      {formatCanonicalRange(hit.canonicalVerseId, hit.canonicalVerseId)}
                    </Text>
                    <Text style={styles.cardTranslation}>{hit.translationCode}</Text>
                  </View>
                  <Text style={styles.verse}>{renderSnippet(hit.snippet, key, styles.snippetMatch)}</Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((THEME) => ({
  root: { flex: 1, backgroundColor: THEME.bg.canvas },
  header: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border.subtle,
  },
  title: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  field: { gap: SPACING.xxs },
  refRow: { flexDirection: 'row', gap: SPACING.sm },
  refField: { flex: 1 },
  label: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  submitButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADII.sm,
    backgroundColor: THEME.accent.primary,
  },
  segmentedRow: { flexDirection: 'row', gap: SPACING.xs },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  segmentActive: {
    borderColor: THEME.accent.primary,
    backgroundColor: THEME.accent.primary,
  },
  segmentText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  segmentTextActive: {
    color: THEME.bg.canvas,
  },
  submitButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.sm,
  },
  summary: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  card: {
    gap: SPACING.xs,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.sm },
  cardReference: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  cardTranslation: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  verse: {
    fontFamily: FONT_FACES.scripture.regular,
    fontSize: FONT_SIZES.scriptureDefault,
    lineHeight: FONT_SIZES.scriptureDefault * LINE_HEIGHTS.scripture,
    color: THEME.text.primary,
  },
  snippetMatch: {
    fontFamily: FONT_FACES.scripture.regular,
    fontWeight: '700',
    color: THEME.text.primary,
    textDecorationLine: 'underline',
    textDecorationColor: THEME.accent.primary,
  },
  muted: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  error: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.redLetter,
  },
}));
