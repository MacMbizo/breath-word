// FR-301..305 study route (mobile) — `/study?verse=45008028&pack=core_bsb&translation=BSB`.
// Pure presentation over the booted core runtime (app/_layout.tsx); no repository or SQL here.
import { useLocalSearchParams } from 'expo-router';

import { isValidCanonicalVerseId, normalizeStrongsId } from '@breath-and-word/core';

import { StudyScreen } from '../src/app/study/StudyScreen';

const DEFAULT_VERSE = 45_008_028;

export default function StudyRoute() {
  const params = useLocalSearchParams<{
    verse?: string;
    pack?: string;
    translation?: string;
    /** FR-301 — a tapped English word: its Strong's ID, stored word position and occurrence rank. */
    strongs?: string;
    wordPos?: string;
    rank?: string;
  }>();
  const parsed = Number(params.verse);
  const verseId = isValidCanonicalVerseId(parsed) ? parsed : DEFAULT_VERSE;
  const strongsId = params.strongs !== undefined ? normalizeStrongsId(params.strongs) : null;
  const wordPosition = Number(params.wordPos);
  const rank = Number(params.rank);
  const wordFocus =
    strongsId !== null || Number.isInteger(wordPosition)
      ? {
          ...(strongsId !== null ? { strongsId } : {}),
          ...(Number.isInteger(wordPosition) && wordPosition > 0 ? { wordPosition } : {}),
          rank: Number.isInteger(rank) && rank >= 0 ? rank : 0,
        }
      : null;
  return (
    <StudyScreen
      key={`${verseId}|${params.strongs ?? ''}|${params.rank ?? ''}`}
      initialVerseId={verseId}
      initialWordFocus={wordFocus}
      packId={params.pack ?? 'core_bsb'}
      translationCode={params.translation ?? 'BSB'}
    />
  );
}
