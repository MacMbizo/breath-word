// FR-301..305 study route (mobile) — `/study?verse=45008028&pack=core_bsb&translation=BSB`.
// Pure presentation over the booted core runtime (app/_layout.tsx); no repository or SQL here.
import { useLocalSearchParams } from 'expo-router';

import { isValidCanonicalVerseId } from '@breath-and-word/core';

import { StudyScreen } from '../src/app/study/StudyScreen';

const DEFAULT_VERSE = 45_008_028;

export default function StudyRoute() {
  const params = useLocalSearchParams<{ verse?: string; pack?: string; translation?: string }>();
  const parsed = Number(params.verse);
  const verseId = isValidCanonicalVerseId(parsed) ? parsed : DEFAULT_VERSE;
  return (
    <StudyScreen
      key={verseId}
      initialVerseId={verseId}
      packId={params.pack ?? 'core_bsb'}
      translationCode={params.translation ?? 'BSB'}
    />
  );
}
