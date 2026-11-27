// FR-101 reader route (mobile) — renders the structured reader over the booted core runtime
// (provided by app/_layout.tsx). Pure presentation: no store, repository, or SQL is touched here.
//
// Optional deep-link params pick the start passage and translation pack:
// `/read?pack=trans_kjv&translation=KJV&book=43&chapter=3`.
import { useLocalSearchParams } from 'expo-router';

import { BOOKS } from '@breath-and-word/core';

import { ReaderScreen, type ReaderStart } from '../../src/app/ReaderScreen';

const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;
const SAFE_TRANSLATION = /^[A-Z0-9]{2,12}$/;

export default function ReadScreen() {
  const params = useLocalSearchParams<{ pack?: string; translation?: string; book?: string; chapter?: string }>();
  const book = Number(params.book);
  const chapter = Number(params.chapter);
  const bookMeta = BOOKS.find((b) => b.number === book);
  const start: ReaderStart = {
    ...(params.pack !== undefined && SAFE_PACK_ID.test(params.pack) ? { packId: params.pack } : {}),
    ...(params.translation !== undefined && SAFE_TRANSLATION.test(params.translation)
      ? { translationCode: params.translation }
      : {}),
    ...(bookMeta !== undefined ? { bookNumber: bookMeta.number } : {}),
    ...(Number.isInteger(chapter) && chapter >= 1 && chapter <= 150
      ? { chapter }
      : {}),
  };
  return <ReaderScreen start={start} />;
}
