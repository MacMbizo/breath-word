// FR-104 reading plans generated from a canonical verse list (B4 §4.2 `reading_plans`).
//
// Plans are chapter-per-day, so they need only the last verse of each chapter. That comes from any
// Protestant verse list (here Theographic `verses.json` BBCCCVVV ids), never from a hand-typed table.

import { BOOKS, fromCanonicalVerseId, toCanonicalVerseId } from '@breath-and-word/core';

import type { ReadingPlanInput } from '../study-refs-pack';

/** Last verse number of every chapter, keyed `book:chapter`. */
export function chapterExtents(verseIds: Iterable<number>): Map<string, number> {
  const extents = new Map<string, number>();
  for (const id of verseIds) {
    const { book, chapter, verse } = fromCanonicalVerseId(id);
    const key = `${book}:${chapter}`;
    if (verse > (extents.get(key) ?? 0)) extents.set(key, verse);
  }
  return extents;
}

function chaptersOf(book: number, extents: Map<string, number>): { chapter: number; lastVerse: number }[] {
  const out: { chapter: number; lastVerse: number }[] = [];
  for (let chapter = 1; extents.has(`${book}:${chapter}`); chapter += 1) {
    out.push({ chapter, lastVerse: extents.get(`${book}:${chapter}`)! });
  }
  return out;
}

function chapterPlan(
  planId: string,
  title: string,
  description: string,
  category: ReadingPlanInput['category'],
  books: readonly number[],
  extents: Map<string, number>,
): ReadingPlanInput {
  const days = books.flatMap((book) =>
    chaptersOf(book, extents).map(({ chapter, lastVerse }) => ({
      startVerseId: toCanonicalVerseId({ book, chapter, verse: 1 }),
      endVerseId: toCanonicalVerseId({ book, chapter, verse: lastVerse }),
      label: `${BOOKS[book - 1]!.name} ${chapter}`,
    })),
  );
  return {
    planId,
    title,
    description,
    category,
    recommendedMannaMode: true,
    days: days.map((day, index) => ({ ...day, dayNumber: index + 1 })),
  };
}

/** The default plan set: New Testament (one chapter a day) and Psalms & Proverbs. */
export function defaultReadingPlans(extents: Map<string, number>): ReadingPlanInput[] {
  const nt = BOOKS.filter((book) => book.testament === 'NT').map((book) => book.number);
  return [
    chapterPlan(
      'nt-chapter-a-day',
      'New Testament, a chapter a day',
      'Read the whole New Testament one chapter at a time, Matthew to Revelation.',
      'NEW_TESTAMENT',
      nt,
      extents,
    ),
    chapterPlan(
      'psalms-proverbs',
      'Psalms & Proverbs',
      'Pray through the Psalms, then walk through Proverbs, one chapter a day.',
      'PSALMS_PROVERBS',
      [19, 20],
      extents,
    ),
  ];
}
