// Gate-1 Spike 1 (B3 §4.5, B4 §4.6 Acceptance) — static content pack SQL layer.
//
// Proves, without native bindings, that the canonical TRANSLATION pack schema supports:
//   1. FTS5 search returning Romans 8:28 (45008028) fast (<15ms per B4 §4.6).
//   2. `PRAGMA integrity_check` = ok.
//   3. The Core `ContentDbAdapter` attach/detach contract over multiple namespaced packs.
//   4. WAL mode allowing a reader to run while a writer holds an open transaction —
//      the no-lock-contention property PowerSync's syncing writer relies on.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { TRANSLATION_PACK_DDL } from '../src/content/pack-schema';
import { toCanonicalVerseId } from '../src/domain/bbcccvvv';

import { NodeContentDbAdapter } from './helpers/node-content-db';
import { DatabaseSync } from './helpers/node-sqlite';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-pack-spike-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const ROMANS_8_28_TEXT =
  'And we know that all things work together for good to those who love God, to those who are called according to His purpose.';

interface VerseFixture {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

const FIXTURE_VERSES: readonly VerseFixture[] = [
  { book: 1, chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
  { book: 43, chapter: 3, verse: 16, text: 'For God so loved the world, that He gave His one and only Son.' },
  { book: 45, chapter: 8, verse: 28, text: ROMANS_8_28_TEXT },
];

interface BookFixture {
  readonly number: number;
  readonly osis: string;
  readonly name: string;
  readonly testament: 'OT' | 'NT';
  readonly chapterCount: number;
  readonly genre: string;
}

const FIXTURE_BOOKS: readonly BookFixture[] = [
  { number: 1, osis: 'Gen', name: 'Genesis', testament: 'OT', chapterCount: 50, genre: 'LAW' },
  { number: 43, osis: 'John', name: 'John', testament: 'NT', chapterCount: 21, genre: 'GOSPEL' },
  { number: 45, osis: 'Rom', name: 'Romans', testament: 'NT', chapterCount: 16, genre: 'EPISTLE' },
];

/** Build a minimal but schema-faithful `core_bsb.sqlite` pack. */
function buildFixturePack(packPath: string): void {
  const db = new DatabaseSync(packPath);
  try {
    db.exec(TRANSLATION_PACK_DDL);
    db.prepare(
      `INSERT INTO pack_metadata
         (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('core_bsb', 'TRANSLATION', 1, '1.0.0', 'Berean Standard Bible', 'CC0-1.0', 'Public domain.', '2026-11-25T00:00:00Z');
    db.prepare(
      `INSERT INTO translations
         (translation_code, name, language, license_type, versification, has_audio, has_word_alignments, version)
       VALUES (?, ?, 'en', ?, 'protestant', 0, 0, ?)`,
    ).run('BSB', 'Berean Standard Bible', 'CC0-1.0', '1.0.0');
    const insertBook = db.prepare(
      `INSERT INTO books (book_number, osis_code, name, testament, chapter_count, literary_genre)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const b of FIXTURE_BOOKS) {
      insertBook.run(b.number, b.osis, b.name, b.testament, b.chapterCount, b.genre);
    }

    const insertVerse = db.prepare(
      `INSERT INTO verses (translation_code, canonical_verse_id, book_number, chapter, verse, plain_text, content_json)
       VALUES ('BSB', ?, ?, ?, ?, ?, ?)`,
    );
    for (const v of FIXTURE_VERSES) {
      const id = toCanonicalVerseId(v);
      insertVerse.run(id, v.book, v.chapter, v.verse, v.text, JSON.stringify([{ type: 'text', text: v.text }]));
    }

    // ETL FTS5 population step (B4 §4.2).
    db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild');");
    db.exec('ANALYZE;');
    db.exec('VACUUM;');
  } finally {
    db.close();
  }
}

describe('content pack schema — Gate-1 Spike 1 (B4 §4.2/§4.6)', () => {
  const packPath = join(tmpRoot, 'core_bsb.sqlite');
  buildFixturePack(packPath);

  it('passes PRAGMA integrity_check', () => {
    const db = new DatabaseSync(packPath);
    try {
      const row = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
      expect(row.integrity_check).toBe('ok');
    } finally {
      db.close();
    }
  });

  it('returns Romans 8:28 (45008028) via FTS5 in <15ms', async () => {
    const adapter = new NodeContentDbAdapter();
    try {
      await adapter.attachPack('core_bsb', packPath);

      const sql =
        'SELECT canonical_verse_id, plain_text FROM core_bsb.verses_fts WHERE verses_fts MATCH ?';
      // Warm-up (page cache / statement preparation) then measure the contract query.
      await adapter.query(sql, ['work together for good']);
      const started = performance.now();
      const result = await adapter.query<{ canonical_verse_id: number }>(sql, ['work together for good']);
      const elapsedMs = performance.now() - started;

      expect(result.rows.map((row) => row.canonical_verse_id)).toContain(45008028);
      expect(elapsedMs).toBeLessThan(15);
    } finally {
      adapter.close();
    }
  });

  it('namespaces multiple attached packs and detaches cleanly', async () => {
    const adapter = new NodeContentDbAdapter();
    try {
      await adapter.attachPack('core_bsb', packPath);
      await adapter.attachPack('trans_web', packPath);

      expect((await adapter.getAttachedPacks()).sort()).toEqual(['core_bsb', 'trans_web']);

      await adapter.detachPack('trans_web');
      expect(await adapter.getAttachedPacks()).toEqual(['core_bsb']);
    } finally {
      adapter.close();
    }
  });

  it('rejects pack ids that would break the ATTACH schema name', async () => {
    const adapter = new NodeContentDbAdapter();
    try {
      await expect(adapter.attachPack('core-bsb; DROP TABLE verses', packPath)).rejects.toThrow();
    } finally {
      adapter.close();
    }
  });
});

describe('WAL no-lock-contention — Gate-1 Spike 1 (B3 §4.5)', () => {
  it('lets a reader run while a writer holds an open write transaction', () => {
    const walPath = join(tmpRoot, 'sync.sqlite');

    const writer = new DatabaseSync(walPath);
    const reader = new DatabaseSync(walPath);
    try {
      writer.exec('PRAGMA journal_mode = WAL;');
      writer.exec('PRAGMA busy_timeout = 5000;');
      reader.exec('PRAGMA busy_timeout = 5000;');

      const journal = writer.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(journal.journal_mode).toBe('wal');

      writer.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);');

      writer.exec('BEGIN IMMEDIATE;');
      writer.prepare('INSERT INTO notes (body) VALUES (?);').run('written by the syncing writer');

      // The reader is NOT blocked by the writer's open transaction (WAL snapshot isolation).
      const duringWrite = reader.prepare('SELECT count(*) AS c FROM notes;').get() as { c: number };
      expect(duringWrite.c).toBe(0);

      writer.exec('COMMIT;');

      const afterCommit = reader.prepare('SELECT count(*) AS c FROM notes;').get() as { c: number };
      expect(afterCommit.c).toBe(1);
    } finally {
      reader.close();
      writer.close();
    }
  });
});
