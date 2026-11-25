// B4 §4.2 — writes a minimal but schema-faithful TRANSLATION pack `.sqlite` file so
// repository tests can `ATTACH DATABASE` real packs instead of hand-rolled rows.

import { TRANSLATION_PACK_DDL } from '../../src/content/pack-schema';
import { toCanonicalVerseId } from '../../src/domain/bbcccvvv';
import type { VerseSpan } from '../../src/domain/types';

import { DatabaseSync } from './node-sqlite';

export interface FixtureBook {
  readonly number: number;
  readonly osis: string;
  readonly name: string;
  readonly testament: 'OT' | 'NT';
  readonly chapterCount: number;
  readonly genre: string;
}

export interface FixtureVerse {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly plainText: string;
  readonly spans: VerseSpan[];
}

export interface FixtureFootnote {
  readonly footnoteId: string;
  readonly canonicalVerseId: number;
  readonly marker: string;
  readonly category: string;
  readonly bodyText: string;
}

export interface FixturePackSpec {
  readonly packId: string;
  readonly translationCode: string;
  readonly translationName: string;
  readonly contentVersion?: string;
  readonly books: readonly FixtureBook[];
  readonly verses: readonly FixtureVerse[];
  readonly footnotes?: readonly FixtureFootnote[];
}

/** Build a `pack.sqlite` at `packPath` containing exactly the supplied rows. */
export function writeFixturePack(packPath: string, spec: FixturePackSpec): void {
  const db = new DatabaseSync(packPath);
  try {
    db.exec(TRANSLATION_PACK_DDL);
    db.prepare(
      `INSERT INTO pack_metadata
         (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
       VALUES (?, 'TRANSLATION', 1, ?, ?, 'CC0-1.0', 'Public domain.', '2026-11-25T00:00:00Z')`,
    ).run(spec.packId, spec.contentVersion ?? '1.0.0', spec.translationName);

    db.prepare(
      `INSERT INTO translations
         (translation_code, name, language, license_type, versification, has_audio, has_word_alignments, version)
       VALUES (?, ?, 'en', 'CC0-1.0', 'protestant', 0, 0, '1.0.0')`,
    ).run(spec.translationCode, spec.translationName);

    const insertBook = db.prepare(
      `INSERT INTO books (book_number, osis_code, name, testament, chapter_count, literary_genre)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const book of spec.books) {
      insertBook.run(book.number, book.osis, book.name, book.testament, book.chapterCount, book.genre);
    }

    const insertVerse = db.prepare(
      `INSERT INTO verses (translation_code, canonical_verse_id, book_number, chapter, verse, plain_text, content_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const verse of spec.verses) {
      insertVerse.run(
        spec.translationCode,
        toCanonicalVerseId(verse),
        verse.book,
        verse.chapter,
        verse.verse,
        verse.plainText,
        JSON.stringify(verse.spans),
      );
    }

    const insertFootnote = db.prepare(
      `INSERT INTO footnotes (footnote_id, translation_code, canonical_verse_id, marker, category, body_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const footnote of spec.footnotes ?? []) {
      insertFootnote.run(
        footnote.footnoteId,
        spec.translationCode,
        footnote.canonicalVerseId,
        footnote.marker,
        footnote.category,
        footnote.bodyText,
      );
    }

    // ETL FTS5 population step (B4 §4.2).
    db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild');");
    db.exec('ANALYZE;');
    db.exec('VACUUM;');
  } finally {
    db.close();
  }
}
