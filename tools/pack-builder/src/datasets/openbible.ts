// OpenBible.info cross-references (CC BY 4.0, votes-weighted TSK superset) → `CrossReferenceInput[]`.
//
// Format (cross_references.txt): `From Verse <TAB> To Verse <TAB> Votes`, OSIS references
// (`Gen.1.1`, `Ps.89.11-Ps.89.12`, `1John.1.1`). The header row and comments are skipped.

import { BOOKS, toCanonicalVerseId } from '@breath-and-word/core';

import { packSourceInvalid } from '../pack-common';
import type { CrossReferenceInput } from '../study-refs-pack';

const BOOK_BY_OSIS = new Map<string, number>(BOOKS.map((book) => [book.osis, book.number]));

/** `Gen.1.1` → 1001001. Throws on an unknown book or malformed reference. */
export function osisToVerseId(ref: string, lineNo: number): number {
  const match = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(ref.trim());
  const book = match !== null ? BOOK_BY_OSIS.get(match[1]!) : undefined;
  if (match === null || book === undefined) {
    throw packSourceInvalid(`line ${lineNo}: unrecognised OSIS reference "${ref}".`);
  }
  return toCanonicalVerseId({ book, chapter: Number(match[2]), verse: Number(match[3]) });
}

export function parseOpenBibleCrossReferences(text: string): CrossReferenceInput[] {
  const refs: CrossReferenceInput[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const lineNo = index + 1;
    if (line.trim().length === 0 || line.startsWith('From Verse') || line.startsWith('#')) return;
    const [from, to, votes] = line.split('\t');
    if (from === undefined || to === undefined || votes === undefined) {
      throw packSourceInvalid(`line ${lineNo}: expected three tab-separated columns.`);
    }
    const [toStart, toEnd] = to.split('-');
    const parsedVotes = Number.parseInt(votes, 10);
    if (!Number.isSafeInteger(parsedVotes)) throw packSourceInvalid(`line ${lineNo}: votes "${votes}" is not an integer.`);
    refs.push({
      fromVerseId: osisToVerseId(from, lineNo),
      toStartVerseId: osisToVerseId(toStart!, lineNo),
      toEndVerseId: osisToVerseId(toEnd ?? toStart!, lineNo),
      votes: parsedVotes,
      source: 'OPENBIBLE',
    });
  });
  return refs;
}
