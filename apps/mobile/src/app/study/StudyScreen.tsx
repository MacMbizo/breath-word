// Mobile study screen for one verse (FR-301..305): Words, Guide, Inductive and Sketch tabs. Opened by
// tapping a verse number in the reader; following a cross-reference or occurrence moves both this
// screen and the reader to that verse.
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { formatCanonicalRange, fromCanonicalVerseId } from '@breath-and-word/core';
import { SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';

import { InductiveSection } from './InductiveSection';
import { InkSketch } from './InkSketch';
import { PassageGuideSection } from './PassageGuideSection';
import { useTheme } from '../../theme/ThemeProvider';

import { useStudy } from './studyStyles';
import { useCurrentUserId } from './useCurrentUserId';
import { WordStudySection, type WordFocus } from './WordStudySection';

type StudyTab = 'words' | 'guide' | 'inductive' | 'ink';

const TABS: readonly { readonly id: StudyTab; readonly label: string }[] = [
  { id: 'words', label: 'Words' },
  { id: 'guide', label: 'Guide' },
  { id: 'inductive', label: 'Inductive' },
  { id: 'ink', label: 'Sketch' },
];

export interface StudyScreenProps {
  readonly initialVerseId: number;
  readonly packId: string;
  readonly translationCode: string;
  /** FR-301 — the English word tapped in the reader, preselected in the Words tab. */
  readonly initialWordFocus?: WordFocus | null;
}

export function StudyScreen({ initialVerseId, packId, translationCode, initialWordFocus = null }: StudyScreenProps) {
  const study = useStudy();
  const { colors: THEME } = useTheme();
  const runtime = useCoreRuntime();
  const router = useRouter();
  const userId = useCurrentUserId();
  const [verseId, setVerseId] = useState(initialVerseId);
  const [tab, setTab] = useState<StudyTab>('words');
  const reference = formatCanonicalRange(verseId, verseId);

  // The tapped word only applies to the verse it came from; following a link clears it.
  const [wordFocus, setWordFocus] = useState<WordFocus | null>(initialWordFocus);

  function openVerse(canonicalVerseId: number) {
    const { book, chapter } = fromCanonicalVerseId(canonicalVerseId);
    setWordFocus(null);
    setVerseId(canonicalVerseId);
    void runtime.stores.reader.getState().openChapter({ packId, translationCode, bookNumber: book, chapter });
  }

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg.canvas }}>
      <View
        style={{
          gap: SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.xl,
          paddingBottom: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: THEME.border.subtle,
        }}
      >
        <View style={[study.row, { justifyContent: 'space-between' }]}>
          <Text style={study.title} accessibilityRole="header">
            {reference}
          </Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to reader" style={study.button}>
            <Text style={study.buttonText}>Reader</Text>
          </Pressable>
        </View>
        <View style={study.wrap} accessibilityRole="tablist">
          {TABS.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.id }}
              style={[study.chip, tab === item.id && study.chipActive]}
            >
              <Text style={study.chipText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: SPACING.xxxl, gap: SPACING.lg }}
        // The ink canvas owns its pan gesture; keep the scroll view from stealing strokes.
        scrollEnabled={tab !== 'ink'}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'words' && <WordStudySection verseId={verseId} reference={reference} wordFocus={wordFocus} onOpenVerse={openVerse} />}
        {tab === 'guide' && (
          <PassageGuideSection startVerseId={verseId} endVerseId={verseId} translationPackId={packId} onOpenVerse={openVerse} />
        )}
        {tab === 'inductive' && userId !== null && (
          <InductiveSection userId={userId} verseId={verseId} reference={reference} translationCode={translationCode} />
        )}
        {tab === 'ink' && userId !== null && <InkSketch userId={userId} verseId={verseId} reference={reference} />}
      </ScrollView>
    </View>
  );
}
