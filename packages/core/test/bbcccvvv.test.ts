import { describe, expect, it } from 'vitest';

import {
  chapterVerseRange,
  formatCanonicalRange,
  fromCanonicalVerseId,
  isValidCanonicalVerseId,
  toCanonicalVerseId,
} from '../src/domain/bbcccvvv';

describe('BBCCCVVV canonical addressing (B4 §4.1)', () => {
  it('encodes known references', () => {
    expect(toCanonicalVerseId({ book: 45, chapter: 8, verse: 28 })).toBe(45008028); // Romans 8:28
    expect(toCanonicalVerseId({ book: 23, chapter: 52, verse: 13 })).toBe(23052013); // Isaiah 52:13
    expect(toCanonicalVerseId({ book: 23, chapter: 53, verse: 12 })).toBe(23053012); // Isaiah 53:12
    expect(toCanonicalVerseId({ book: 1, chapter: 1, verse: 1 })).toBe(1001001); // Genesis 1:1
    expect(toCanonicalVerseId({ book: 66, chapter: 22, verse: 21 })).toBe(66022021); // Revelation 22:21
  });

  it('round-trips encode/decode', () => {
    expect(fromCanonicalVerseId(45008028)).toEqual({ book: 45, chapter: 8, verse: 28 });
    expect(fromCanonicalVerseId(23053012)).toEqual({ book: 23, chapter: 53, verse: 12 });
  });

  it('validates canonical bounds', () => {
    expect(isValidCanonicalVerseId(45008028)).toBe(true);
    expect(isValidCanonicalVerseId(1001001)).toBe(true);
    expect(isValidCanonicalVerseId(1000999)).toBe(false);
    expect(isValidCanonicalVerseId(66022022)).toBe(false);
    expect(isValidCanonicalVerseId(Number.NaN)).toBe(false);
  });

  it('builds a chapter-level scan range', () => {
    expect(chapterVerseRange(45, 8)).toEqual({ start: 45008000, end: 45008999 });
  });

  it('formats single verses and cross-chapter ranges', () => {
    expect(formatCanonicalRange(45008028, 45008028)).toBe('Romans 8:28');
    expect(formatCanonicalRange(45008028, 45008030)).toBe('Romans 8:28-30');
    expect(formatCanonicalRange(23052013, 23053012)).toBe('Isaiah 52:13-53:12');
  });
});
