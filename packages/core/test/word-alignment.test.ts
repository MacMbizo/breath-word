// FR-301 — pure segmenting / token-selection helpers for tap-any-English-word.
import { describe, expect, it } from 'vitest';

import type { InterlinearToken, VerseWordAlignment } from '../src/domain/types';
import { strongsClass, strongsEquivalents } from '../src/domain/strongs';
import { segmentSpanText, selectAlignedToken, strongsOccurrenceRank } from '../src/domain/word-alignment';

function align(spanIndex: number, charStart: number, charEnd: number, strongsId: string, id = charStart): VerseWordAlignment {
  return { id, translationCode: 'KJV', canonicalVerseId: 43001016, spanIndex, charStart, charEnd, strongsId };
}

function token(wordPosition: number, strongsId: string): InterlinearToken {
  return { tokenId: wordPosition, canonicalVerseId: 43001016, sourceVerseId: 43001016, wordPosition, originalWord: 'x', strongsId } as InterlinearToken;
}

describe('segmentSpanText (FR-301)', () => {
  const text = 'and grace for grace.';
  const rows = [align(0, 4, 9, 'G5485'), align(0, 14, 19, 'G5485'), align(1, 0, 3, 'G2532')];

  it('splits a span into plain and aligned runs that rejoin to the original text', () => {
    const segments = segmentSpanText(text, 0, rows);
    expect(segments.map((s) => s.text)).toEqual(['and ', 'grace', ' for ', 'grace', '.']);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.alignment !== undefined)).toHaveLength(2);
  });

  it('ignores rows for other spans, out-of-range rows and overlaps', () => {
    const bad = [align(0, 4, 9, 'G5485'), align(0, 6, 8, 'G1'), align(0, 18, 99, 'G2')];
    const segments = segmentSpanText(text, 0, bad);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.alignment !== undefined).map((s) => s.text)).toEqual(['grace']);
    expect(segmentSpanText(text, 2, rows)).toEqual([{ text }]);
    expect(segmentSpanText(text, 0, undefined)).toEqual([{ text }]);
  });
});

describe('token selection by Strong’s occurrence (FR-301)', () => {
  const rows = [align(0, 4, 9, 'G5485'), align(0, 14, 19, 'G5485')];
  const tokens = [token(1, 'G2532'), token(9, 'G5485'), token(11, 'G5485')];

  it('maps the second "grace" to the second χάρις token', () => {
    expect(strongsOccurrenceRank(rows, rows[1]!)).toBe(1);
    expect(selectAlignedToken(tokens, { strongsId: 'G5485', rank: 1 })?.wordPosition).toBe(11);
  });

  it('prefers an explicit word position and clamps an over-long rank', () => {
    expect(selectAlignedToken(tokens, { strongsId: 'G5485', wordPosition: 1 })?.wordPosition).toBe(1);
    expect(selectAlignedToken(tokens, { strongsId: 'G5485', rank: 7 })?.wordPosition).toBe(11);
    expect(selectAlignedToken(tokens, { strongsId: 'G9' })).toBeUndefined();
  });
});

describe('Strong’s equivalence classes (KJV legacy forms ↔ STEPBible lemmas)', () => {
  it('maps the KJV “was” (G2258, ἦν) onto STEPBible’s εἰμί tokens (G1510)', () => {
    const rows = [align(0, 25, 28, 'G2258'), align(0, 40, 43, 'G2258'), align(0, 60, 63, 'G2258')];
    const tokens = [token(3, 'G1510'), token(4, 'G3588'), token(9, 'G1510'), token(15, 'G1510')];
    expect(strongsClass('G2258')).toBe('G1510');
    expect(strongsEquivalents('G26')).toEqual(['G26']);
    expect(strongsEquivalents('G2258')).toContain('G1510');
    const second = rows[1]!;
    expect(selectAlignedToken(tokens, { strongsId: 'G2258', rank: strongsOccurrenceRank(rows, second) })?.wordPosition).toBe(9);
  });
});
