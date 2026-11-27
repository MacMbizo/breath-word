// FR-301 — the word card that rises above the pill when an aligned English word is tapped.
//
//   card        — the gentle default: the original word, its gloss, parsing chips, one-line
//                 lexicon meaning, and "Open word study" / "Pray it".
//   interlinear — for readers who study the languages: the whole verse in the original as a
//                 strip (tap any word), plus a parsing grid. Chosen in Reading settings.
//
// It shows a "Looking up…" state the moment it opens (never a blank panel), and ignores a slow
// lookup for a word the reader has already moved on from.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  formatCanonicalRange,
  type InterlinearToken,
  type VerseWordAlignment,
  type WordView,
} from '@breath-and-word/core';
import { FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { makeStyles, useTheme } from '../../theme/ThemeProvider';
import { useCoreRuntime } from '../CoreRuntime';
import { Icon } from '../nav/Icon';
import { languageFromStrongs, OriginalText } from '../study/OriginalText';
import { useCoreStore } from '../useCoreStore';

export interface WordCardProps {
  readonly alignment: VerseWordAlignment;
  /** The English word as printed in the verse. */
  readonly englishWord: string;
  readonly packId: string;
  readonly translationCode: string;
  readonly mode: WordView;
  readonly onOpenStudy: () => void;
  readonly onPray: () => void;
  readonly onClose: () => void;
}

/** "verb, aorist passive subjunctive, 3rd person singular" → ["Verb", "Aorist passive subjunctive", …]. */
function parsingChips(human: string | undefined): string[] {
  if (human === undefined) return [];
  return human
    .split(/\s*[,;]\s*|\s+-\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
}

export function WordCard({ alignment, englishWord, packId, translationCode, mode, onOpenStudy, onPray, onClose }: WordCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { stores } = useCoreRuntime();
  const { inspectedWord, activeLexicon, verseTokens } = useCoreStore(stores.study);
  const [picked, setPicked] = useState<InterlinearToken | null>(null);
  const requested = useRef<number | null>(null);
  const stripRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    requested.current = alignment.id;
    setPicked(null);
    void stores.study
      .getState()
      .inspectWord(packId, translationCode, alignment.canonicalVerseId, { spanIndex: alignment.spanIndex, charOffset: alignment.charStart });
    if (mode === 'interlinear') void stores.study.getState().loadVerseInterlinear(alignment.canonicalVerseId);
  }, [stores, alignment, packId, translationCode, mode]);

  // Only trust an inspection that belongs to the word on screen (a slow lookup for a word the
  // reader already left must not paint over this one).
  const inspection =
    inspectedWord !== null && inspectedWord.alignment?.id === alignment.id && inspectedWord.canonicalVerseId === alignment.canonicalVerseId
      ? inspectedWord
      : null;
  const token = picked ?? inspection?.token;
  const strongsId = token?.strongsId ?? alignment.strongsId;
  const lexicon =
    picked !== null
      ? activeLexicon?.strongsId === picked.strongsId
        ? activeLexicon
        : null
      : (inspection?.lexicon ?? null);
  const loading = inspection === null && picked === null;
  const language = languageFromStrongs(strongsId);
  const reference = formatCanonicalRange(alignment.canonicalVerseId, alignment.canonicalVerseId);
  const strip = useMemo(
    () => verseTokens.filter((t) => t.canonicalVerseId === alignment.canonicalVerseId),
    [verseTokens, alignment.canonicalVerseId],
  );

  function pick(next: InterlinearToken) {
    setPicked(next);
    if (next.strongsId !== undefined) void stores.study.getState().openLexicon(next.strongsId);
  }

  return (
    <View style={styles.card} accessibilityLabel={`Word study: ${englishWord}`}>
      <View style={styles.topRow}>
        <Text style={styles.context}>{`“${englishWord}” · ${reference}`}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close word card" hitSlop={8} style={styles.closeButton}>
          <Icon name="close" size={18} color={colors.text.secondary} />
        </Pressable>
      </View>

      {mode === 'interlinear' && strip.length > 0 && (
        <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {strip.map((t) => {
            const active = t.wordPosition === token?.wordPosition;
            return (
              <Pressable
                key={t.tokenId}
                onPress={() => pick(t)}
                // Bring the tapped word's original into view (it may sit past the card's edge).
                onLayout={
                  active
                    ? (event) => stripRef.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - SPACING.xl), animated: false })
                    : undefined
                }
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${t.transliteration ?? t.originalWord}, ${t.englishGloss ?? ''}`}
                style={[styles.stripWord, active && styles.stripWordActive]}
              >
                <OriginalText language={languageFromStrongs(t.strongsId)} size={18} style={active ? styles.stripGreekActive : styles.stripGreek}>
                  {t.originalWord}
                </OriginalText>
                <Text style={styles.stripGloss} numberOfLines={1}>
                  {t.englishGloss ?? ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <View style={styles.skeletonWide} />
          <Text style={styles.loadingText}>Looking up the original word…</Text>
        </View>
      ) : (
        <>
          <View style={styles.wordRow}>
            <View style={styles.wordText}>
              {token !== undefined ? (
                <OriginalText language={language} size={30} style={styles.original}>
                  {token.originalWord}
                </OriginalText>
              ) : lexicon !== null ? (
                <OriginalText language={lexicon.language} size={30} style={styles.original}>
                  {lexicon.lemma}
                </OriginalText>
              ) : null}
              {(token?.transliteration ?? lexicon?.transliteration) !== undefined && (
                <Text style={styles.translit}>{token?.transliteration ?? lexicon?.transliteration}</Text>
              )}
            </View>
            {strongsId !== undefined && <Text style={styles.strongs}>{strongsId}</Text>}
          </View>

          {mode === 'interlinear' ? (
            <View style={styles.grid}>
              <Text style={styles.gridLabel}>Parsing</Text>
              <Text style={styles.gridValue}>{token?.morphologyCode ?? '—'}</Text>
              <Text style={styles.gridLabel}>Reads as</Text>
              <Text style={styles.gridValue}>{token?.morphologyHuman ?? 'No parsing recorded'}</Text>
              {token?.lemma !== undefined && (
                <>
                  <Text style={styles.gridLabel}>Dictionary form</Text>
                  <OriginalText language={language} size={17} style={styles.gridValue}>
                    {token.lemma}
                  </OriginalText>
                </>
              )}
            </View>
          ) : (
            parsingChips(token?.morphologyHuman).length > 0 && (
              <View style={styles.chips}>
                {parsingChips(token?.morphologyHuman).map((chip) => (
                  <View key={chip} style={styles.chip}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            )
          )}

          {lexicon !== null ? (
            <Text style={styles.meaning}>
              {lexicon.lemma !== token?.originalWord && (
                <Text style={styles.meaningLemma}>{`${lexicon.lemma} · `}</Text>
              )}
              {lexicon.shortDefinition}
            </Text>
          ) : (
            token?.englishGloss !== undefined && <Text style={styles.meaning}>{token.englishGloss}</Text>
          )}
          {token === undefined && lexicon === null && (
            <Text style={styles.loadingText}>The installed Greek and Hebrew pack does not cover this verse yet.</Text>
          )}
        </>
      )}

      <View style={styles.actions}>
        <Pressable onPress={onOpenStudy} accessibilityRole="button" style={styles.primary}>
          <Text style={styles.primaryText}>Open word study</Text>
        </Pressable>
        <Pressable onPress={onPray} accessibilityRole="button" style={styles.secondary}>
          <Text style={styles.secondaryText}>Pray it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  card: {
    gap: SPACING.md,
    padding: SPACING.lg + 2,
    borderRadius: 24,
    backgroundColor: c.bg.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: c.border.strong,
    shadowColor: c.shadow,
    shadowOpacity: t.dark ? 0.5 : 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  context: {
    flex: 1,
    fontFamily: t.fonts.ui.medium,
    fontSize: FONT_SIZES.uiXs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: c.text.secondary,
  },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  strip: { gap: SPACING.sm, paddingVertical: SPACING.xxs },
  stripWord: {
    minHeight: MIN_TOUCH_TARGET + 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border.strong,
  },
  stripWordActive: { borderColor: c.accent.primary, backgroundColor: c.bg.sunken },
  stripGreek: { color: c.text.primary },
  stripGreekActive: { color: c.accent.primary },
  stripGloss: { fontFamily: t.fonts.ui.regular, fontSize: 11, color: c.text.secondary, maxWidth: 110 },
  loading: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  skeletonWide: { width: '55%', height: 26, borderRadius: 8, backgroundColor: c.bg.sunken },
  loadingText: { fontFamily: t.fonts.ui.regular, fontSize: FONT_SIZES.uiSm, color: c.text.secondary },
  wordRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: SPACING.md },
  wordText: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: SPACING.sm, flex: 1 },
  original: { color: c.text.primary },
  translit: { fontFamily: t.fonts.greek.italic, fontSize: FONT_SIZES.uiMd, color: c.text.secondary },
  strongs: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm, color: c.accent.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADII.pill, backgroundColor: c.bg.sunken },
  chipText: { fontFamily: t.fonts.ui.regular, fontSize: FONT_SIZES.uiXs, color: c.text.secondary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: 14,
    backgroundColor: c.bg.sunken,
  },
  gridLabel: { width: '38%', fontFamily: t.fonts.ui.regular, fontSize: 13, color: c.text.secondary },
  gridValue: { width: '62%', fontFamily: t.fonts.ui.regular, fontSize: 13, color: c.text.primary },
  meaning: { fontFamily: t.fonts.scripture.regular, fontSize: FONT_SIZES.uiMd, lineHeight: FONT_SIZES.uiMd * 1.55, color: c.text.primary },
  meaningLemma: { fontFamily: t.fonts.greek.regular, color: c.text.primary },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  primary: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.pill,
    backgroundColor: c.accent.primary,
  },
  primaryText: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm + 1, color: c.text.onAccent },
  secondary: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.pill,
    backgroundColor: c.bg.elevated,
  },
  secondaryText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm + 1, color: c.text.primary },
}));
