// B4 §4.5 — pure parallel-reader alignment (FR-102).
//
// A verse-synchronized parallel reader lines whole chapters up verse by verse. Rather than giving
// each translation its own scroll position (which drifts under virtualization), the columns share
// ONE scroll surface built from a single row-per-verse grid — so alignment is exact by construction.
// This module owns that projection and nothing else: pure TypeScript, no SQL, no platform imports
// (AGENTS.md rule 1).

import type { Verse } from './types';

/** Anything carrying an ordered list of verses — structurally satisfied by `Chapter`. */
export interface ChapterVerses {
  readonly verses: readonly Verse[];
}

/** One row of the parallel grid: a canonical verse with one cell per column. */
export interface AlignedVerseRow {
  /** BBCCCVVV of the row's verse — the scroll anchor every column shares. */
  readonly canonicalVerseId: number;
  /** Verse number within its chapter (`canonicalVerseId % 1000`). */
  readonly verse: number;
  /** One cell per column, in column order; `undefined` when that column omits the verse. */
  readonly cells: readonly (Verse | undefined)[];
}

/**
 * Line up several translations of one chapter onto a single row-per-verse grid.
 *
 * Rows are the ascending union of the canonical verse ids present in ANY column, so a column that
 * drops or merges a verse (translations genuinely differ here) still lines up with the others — it
 * simply renders an empty cell for that row.
 */
export function alignChapterVerses(chapters: readonly ChapterVerses[]): AlignedVerseRow[] {
  const rows = new Map<number, (Verse | undefined)[]>();

  chapters.forEach((chapter, columnIndex) => {
    for (const verse of chapter.verses) {
      let cells = rows.get(verse.canonicalVerseId);
      if (cells === undefined) {
        cells = new Array<Verse | undefined>(chapters.length).fill(undefined);
        rows.set(verse.canonicalVerseId, cells);
      }
      cells[columnIndex] = verse;
    }
  });

  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([canonicalVerseId, cells]) => ({
      canonicalVerseId,
      // BBCCCVVV = book*1e6 + chapter*1e3 + verse, so the low three digits are the verse number.
      verse: canonicalVerseId % 1000,
      cells,
    }));
}
