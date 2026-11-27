// FR-301 / FR-302 (mobile) — interlinear tokens for a verse, the Morphology Inspector for a tapped
// word, and its lexicon entry with OT/NT/per-book frequency and tappable occurrences.
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isRtlOriginalLanguage, selectAlignedToken, type InterlinearToken } from '@breath-and-word/core';
import { FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { languageFromStrongs, OriginalText } from './OriginalText';
import { useTheme } from '../../theme/ThemeProvider';

import { useStudy } from './studyStyles';

/** FR-301 — an English word tapped in the reader. */
export interface WordFocus {
  readonly strongsId?: string;
  readonly wordPosition?: number;
  /** Earlier same-Strong's words in the verse (picks the matching interlinear token). */
  readonly rank: number;
}

export interface WordStudySectionProps {
  readonly verseId: number;
  readonly reference: string;
  /** FR-301 — preselect the original-language token for this tapped English word. */
  readonly wordFocus?: WordFocus | null;
  readonly onOpenVerse: (canonicalVerseId: number) => void;
}

export function WordStudySection({ verseId, reference, wordFocus = null, onOpenVerse }: WordStudySectionProps) {
  const study = useStudy();
  const { colors: THEME } = useTheme();
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
  // if the installed exegesis pack has no token for it, still show the lexicon entry. Each
  // (focus, tokens) pair is handled once: `openLexicon` toggles `status`, which re-runs this effect.
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
  }, [wordFocus, tokensSettled, verseTokens]);
  const rtlVerse = isRtlOriginalLanguage(languageFromStrongs(tokens.find((t) => t.strongsId !== undefined)?.strongsId));
  const lexiconStrongs = selected?.strongsId ?? lexiconOnly ?? undefined;
  const lexicon = lexiconStrongs !== undefined && activeLexicon?.strongsId === lexiconStrongs ? activeLexicon : null;
  const frequency = lexicon !== null && wordFrequency?.strongsId === lexicon.strongsId ? wordFrequency : null;
  const maxBook = Math.max(1, ...(frequency?.byBook.map((b) => b.occurrences) ?? [1]));

  return (
    <View style={study.section}>
      <Text style={study.heading}>{`Interlinear · ${reference}`}</Text>
      {error !== null && (
        <Text accessibilityRole="alert" style={study.error}>
          {error.userMessage}
        </Text>
      )}
      {status === 'ready' && tokens.length === 0 && error === null && (
        <Text style={study.muted}>No original-language words for this verse in the installed pack.</Text>
      )}

      {/* Reading order follows the script: right-to-left rows for Hebrew. */}
      <View style={[study.wrap, rtlVerse && { flexDirection: 'row-reverse' }]}>
        {tokens.map((token) => {
          const active = selected?.tokenId === token.tokenId;
          return (
            <Pressable
              key={token.tokenId}
              onPress={() => inspect(token)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${token.englishGloss ?? token.originalWord}, ${token.strongsId ?? 'no Strong’s number'}`}
              style={[
                {
                  minWidth: MIN_TOUCH_TARGET + SPACING.lg,
                  alignItems: 'center',
                  gap: SPACING.xxs,
                  paddingHorizontal: SPACING.sm,
                  paddingVertical: SPACING.xs,
                  borderRadius: RADII.md,
                  borderWidth: 1,
                  borderColor: THEME.border.subtle,
                  backgroundColor: THEME.bg.surface,
                },
                active && study.chipActive,
              ]}
            >
              <OriginalText language={languageFromStrongs(token.strongsId)} size={FONT_SIZES.uiLg} style={{ color: THEME.text.primary }}>
                {token.originalWord}
              </OriginalText>
              <Text style={[study.muted, { fontStyle: 'italic' }]}>{token.transliteration ?? ''}</Text>
              <Text style={study.muted}>{token.englishGloss ?? ''}</Text>
              <Text style={[study.muted, { color: THEME.accent.primary }]}>{token.strongsId ?? ''}</Text>
            </Pressable>
          );
        })}
      </View>

      {selected !== null && (
        <View style={study.card} accessibilityLabel="Morphology inspector">
          <Text style={study.heading}>Morphology</Text>
          <Text style={study.body}>{selected.morphologyHuman ?? 'No parsing recorded for this word.'}</Text>
          {selected.morphologyCode !== undefined && <Text style={study.muted}>{`Code ${selected.morphologyCode}`}</Text>}
          {selected.lemma !== undefined && (
            <Text style={study.muted}>
              {'Dictionary form '}
              <OriginalText language={languageFromStrongs(selected.strongsId)} size={FONT_SIZES.uiMd} style={{ color: THEME.text.primary }}>
                {selected.lemma}
              </OriginalText>
            </Text>
          )}
        </View>
      )}

      {lexicon !== null && (
        <View style={study.card} accessibilityLabel={`Lexicon ${lexicon.strongsId}`}>
          <View style={[study.row, { justifyContent: 'space-between' }]}>
            <OriginalText language={lexicon.language} size={FONT_SIZES.uiLg} style={{ color: THEME.text.primary }}>
              {lexicon.lemma}
            </OriginalText>
            <Text style={study.link}>{lexicon.strongsId}</Text>
          </View>
          {lexicon.transliteration !== undefined && (
            <Text style={[study.muted, { fontStyle: 'italic' }]}>{lexicon.transliteration}</Text>
          )}
          <Text style={[study.body, { fontSize: FONT_SIZES.uiMd }]}>{lexicon.shortDefinition}</Text>

          {frequency !== null && (
            <View style={{ gap: SPACING.xs, marginTop: SPACING.sm }}>
              <Text style={study.heading}>
                {`Frequency · ${frequency.totalOccurrences} · OT ${frequency.otOccurrences} · NT ${frequency.ntOccurrences}`}
              </Text>
              {frequency.byBook.map((book) => (
                <View key={book.bookNumber} style={study.row}>
                  <Text style={[study.muted, { width: MIN_TOUCH_TARGET * 2 }]} numberOfLines={1}>
                    {book.bookName}
                  </Text>
                  <View style={{ flex: 1, height: SPACING.xs, borderRadius: RADII.pill, backgroundColor: THEME.bg.elevated }}>
                    <View
                      style={{
                        width: `${(book.occurrences / maxBook) * 100}%`,
                        height: SPACING.xs,
                        borderRadius: RADII.pill,
                        backgroundColor: THEME.accent.primary,
                      }}
                    />
                  </View>
                  <Text style={[study.muted, { width: MIN_TOUCH_TARGET, textAlign: 'right' }]}>{book.occurrences}</Text>
                </View>
              ))}
              <View style={study.wrap}>
                {frequency.occurrences.slice(0, 30).map((hit) => (
                  <Pressable
                    key={`${hit.canonicalVerseId}-${hit.wordPosition}`}
                    onPress={() => onOpenVerse(hit.canonicalVerseId)}
                    accessibilityRole="link"
                    style={{ paddingVertical: SPACING.xs, paddingRight: SPACING.sm }}
                  >
                    <Text style={study.link}>{hit.passageReference}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {lexicon.sections.map((section, index) => (
            <View key={`${section.heading}-${index}`} style={{ gap: SPACING.xxs, marginTop: SPACING.sm }}>
              <Text style={[study.body, { fontWeight: '600' }]}>{section.heading}</Text>
              <Text style={study.body}>{section.body}</Text>
              {section.source !== undefined && <Text style={study.muted}>{section.source}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
