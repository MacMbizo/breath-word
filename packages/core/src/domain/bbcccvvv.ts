// B4 §4.1 — Canonical BBCCCVVV addressing.
// canonical_verse_id = (book * 1_000_000) + (chapter * 1_000) + verse
// Bounds: 01001001 (Genesis 1:1) .. 66022021 (Revelation 22:21).

import { BOOKS } from './books';

export interface VerseRef {
  readonly book: number; // 1..66
  readonly chapter: number;
  readonly verse: number;
}

const MIN_VERSE_ID = 1_001_001;
const MAX_VERSE_ID = 66_022_021;

/** Encode a reference to its 32-bit canonical integer (pure, no validation throw). */
export function toCanonicalVerseId({ book, chapter, verse }: VerseRef): number {
  return book * 1_000_000 + chapter * 1_000 + verse;
}

/** Decode a canonical integer back into book/chapter/verse parts. */
export function fromCanonicalVerseId(id: number): VerseRef {
  const book = Math.floor(id / 1_000_000);
  const chapter = Math.floor((id % 1_000_000) / 1_000);
  const verse = id % 1_000;
  return { book, chapter, verse };
}

export function isValidCanonicalVerseId(id: number): boolean {
  return Number.isInteger(id) && id >= MIN_VERSE_ID && id <= MAX_VERSE_ID;
}

/** Inclusive range covering all verses of a chapter — enables O(log n) index scans. */
export function chapterVerseRange(book: number, chapter: number): { start: number; end: number } {
  const base = book * 1_000_000 + chapter * 1_000;
  return { start: base, end: base + 999 };
}

export function bookName(book: number): string {
  return BOOKS[book - 1]?.name ?? `Book ${book}`;
}

export function bookOsis(book: number): string {
  return BOOKS[book - 1]?.osis ?? '';
}

/** Human reference, e.g. "Romans 8:28" or "Isaiah 52:13-53:12". */
export function formatCanonicalRange(startId: number, endId: number): string {
  const start = fromCanonicalVerseId(startId);
  const end = fromCanonicalVerseId(endId);
  const startName = bookName(start.book);

  if (start.book === end.book && start.chapter === end.chapter) {
    return start.verse === end.verse
      ? `${startName} ${start.chapter}:${start.verse}`
      : `${startName} ${start.chapter}:${start.verse}-${end.verse}`;
  }
  if (start.book === end.book) {
    return `${startName} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
  }
  return `${startName} ${start.chapter}:${start.verse}-${bookName(end.book)} ${end.chapter}:${end.verse}`;
}
