// FR-301 — pure helpers for "tap any aligned English word" (B4 `verse_word_alignments`).
//
// Shared by the desktop and mobile readers so both split verse text and pick the interlinear
// token the same way. No I/O here: alignments and tokens arrive from `ExegesisRepository`.

import type { InterlinearToken, VerseWordAlignment } from './types';

/** One run of a span's text: plain text, or an aligned (tappable) English word. */
export interface AlignedTextSegment {
  readonly text: string;
  readonly alignment?: VerseWordAlignment;
}

/**
 * Split one span's text into plain and aligned segments, in order. Alignments for other spans,
 * out-of-range offsets and overlaps are ignored, so a bad row can never garble the verse text:
 * joining every segment's `text` always reproduces `text` exactly.
 */
export function segmentSpanText(
  text: string,
  spanIndex: number,
  alignments: readonly VerseWordAlignment[] | undefined,
): AlignedTextSegment[] {
  if (alignments === undefined || alignments.length === 0) return [{ text }];
  const inSpan = alignments
    .filter((a) => a.spanIndex === spanIndex && a.charStart >= 0 && a.charEnd <= text.length && a.charEnd > a.charStart)
    .sort((a, b) => a.charStart - b.charStart);
  if (inSpan.length === 0) return [{ text }];

  const segments: AlignedTextSegment[] = [];
  let cursor = 0;
  for (const alignment of inSpan) {
    if (alignment.charStart < cursor) continue; // overlapping row: keep the earlier word
    if (alignment.charStart > cursor) segments.push({ text: text.slice(cursor, alignment.charStart) });
    segments.push({ text: text.slice(alignment.charStart, alignment.charEnd), alignment });
    cursor = alignment.charEnd;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/**
 * How many earlier aligned words in the same verse carry the same Strong's ID: "grace for grace"
 * maps the second "grace" to the second χάρις token, not the first.
 */
export function strongsOccurrenceRank(
  alignments: readonly VerseWordAlignment[],
  alignment: VerseWordAlignment,
): number {
  if (alignment.strongsId === undefined) return 0;
  return alignments.filter(
    (a) =>
      a.strongsId === alignment.strongsId &&
      (a.spanIndex < alignment.spanIndex || (a.spanIndex === alignment.spanIndex && a.charStart < alignment.charStart)),
  ).length;
}

/**
 * The interlinear token a tapped English word points at: the explicit `interlinearWordPos` when
 * the pack stored one, otherwise the `rank`-th token carrying the word's Strong's ID (clamped to
 * the last, since a translation may repeat a word the original says once).
 */
export function selectAlignedToken(
  tokens: readonly InterlinearToken[],
  target: { readonly strongsId?: string; readonly wordPosition?: number; readonly rank?: number },
): InterlinearToken | undefined {
  if (target.wordPosition !== undefined) {
    const exact = tokens.find((t) => t.wordPosition === target.wordPosition);
    if (exact !== undefined) return exact;
  }
  if (target.strongsId === undefined) return undefined;
  const matches = tokens
    .filter((t) => t.strongsId === target.strongsId)
    .sort((a, b) => a.wordPosition - b.wordPosition);
  if (matches.length === 0) return undefined;
  return matches[Math.min(target.rank ?? 0, matches.length - 1)];
}
