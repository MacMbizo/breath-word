// Phase 1 Core Local Reader — ReaderRepository acceptance (FR-101 / FR-102 / FR-103).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { VerseSpan } from '../src/domain/types';
import { alignChapterVerses } from '../src/domain/verse-alignment';
import { ReaderRepository, type TranslationRef } from '../src/repositories/reader-repository';

import { writeFixturePack, type FixturePackSpec } from './helpers/fixture-pack';
import { NodeContentDbAdapter } from './helpers/node-content-db';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-reader-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const ROMANS_8_28 = 45_008_028;
const PSALM_23_1 = 19_023_001;

const PSALM_23_1_SPANS: VerseSpan[] = [
  { type: 'heading', text: 'The LORD Is My Shepherd' },
  { type: 'poetry', indentLevel: 1, text: 'The LORD is my shepherd; I shall not want.' },
  { type: 'red_letter', text: 'He makes me lie down in green pastures.' },
  { type: 'footnote', text: 'a', footnoteId: 'BSB:19023001:a' },
];

const CORE_BSB: FixturePackSpec = {
  packId: 'core_bsb',
  translationCode: 'BSB',
  translationName: 'Berean Standard Bible',
  books: [
    { number: 19, osis: 'Ps', name: 'Psalms', testament: 'OT', chapterCount: 150, genre: 'POETRY_WISDOM' },
    { number: 45, osis: 'Rom', name: 'Romans', testament: 'NT', chapterCount: 16, genre: 'EPISTLE' },
  ],
  verses: [
    {
      book: 19,
      chapter: 23,
      verse: 1,
      plainText: 'The LORD is my shepherd; I shall not want. He makes me lie down in green pastures.',
      spans: PSALM_23_1_SPANS,
    },
    {
      book: 19,
      chapter: 23,
      verse: 2,
      plainText: 'He leads me beside quiet waters.',
      spans: [{ type: 'text', text: 'He leads me beside quiet waters.' }],
    },
    {
      book: 45,
      chapter: 8,
      verse: 28,
      plainText:
        'And we know that all things work together for good to those who love God, to those who are called according to His purpose.',
      spans: [
        {
          type: 'text',
          text: 'And we know that all things work together for good to those who love God, to those who are called according to His purpose.',
        },
      ],
    },
  ],
  footnotes: [
    {
      footnoteId: 'BSB:19023001:a',
      canonicalVerseId: PSALM_23_1,
      marker: 'a',
      category: 'TRANSLATION',
      bodyText: 'Or "I shall not lack."',
    },
  ],
};

const TRANS_WEB: FixturePackSpec = {
  packId: 'trans_web',
  translationCode: 'WEB',
  translationName: 'World English Bible',
  books: [{ number: 45, osis: 'Rom', name: 'Romans', testament: 'NT', chapterCount: 16, genre: 'EPISTLE' }],
  verses: [
    {
      book: 45,
      chapter: 8,
      verse: 28,
      plainText:
        'We know that all things work together for good for those who love God, for those who are called according to his purpose.',
      spans: [
        {
          type: 'text',
          text: 'We know that all things work together for good for those who love God, for those who are called according to his purpose.',
        },
      ],
    },
  ],
};

let adapter: NodeContentDbAdapter;
let reader: ReaderRepository;

beforeAll(async () => {
  writeFixturePack(join(tmpRoot, 'core_bsb.sqlite'), CORE_BSB);
  writeFixturePack(join(tmpRoot, 'trans_web.sqlite'), TRANS_WEB);

  adapter = new NodeContentDbAdapter();
  await adapter.attachPack('core_bsb', join(tmpRoot, 'core_bsb.sqlite'));
  await adapter.attachPack('trans_web', join(tmpRoot, 'trans_web.sqlite'));
  reader = new ReaderRepository(adapter);
});

afterAll(() => adapter.close());

describe('FR-101 Structured Verse Renderer', () => {
  it('returns a chapter ordered by verse with parsed spans and footnotes', async () => {
    const chapter = await reader.getChapter('core_bsb', 'BSB', 19, 23);

    expect(chapter.verses.map((verse) => verse.verse)).toEqual([1, 2]);
    const [first] = chapter.verses;
    expect(first?.canonicalVerseId).toBe(PSALM_23_1);
    expect(first?.spans.map((span) => span.type)).toEqual([
      'heading',
      'poetry',
      'red_letter',
      'footnote',
    ]);
    expect(first?.spans[1]?.indentLevel).toBe(1);
    expect(first?.spans[3]?.footnoteId).toBe('BSB:19023001:a');

    expect(chapter.footnotes).toHaveLength(1);
    expect(chapter.footnotes[0]?.marker).toBe('a');
    expect(chapter.footnotes[0]?.bodyText).toBe('Or "I shall not lack."');
  });
});

describe('FR-102 Multi-Translation & Parallel Reader', () => {
  it('reads a single verse by canonical id and returns null when absent', async () => {
    const verse = await reader.getVerse('core_bsb', 'BSB', PSALM_23_1);
    expect(verse?.plainText).toContain('my shepherd');

    expect(await reader.getVerse('core_bsb', 'BSB', 19_023_999)).toBeNull();
  });

  it('loads the same chapter across packs in the requested column order', async () => {
    const refs: TranslationRef[] = [
      { packId: 'core_bsb', translationCode: 'BSB' },
      { packId: 'trans_web', translationCode: 'WEB' },
    ];
    const columns = await reader.compareChapters(refs, 45, 8);

    expect(columns.map((column) => column.translationCode)).toEqual(['BSB', 'WEB']);
    expect(columns[0]?.verses[0]?.canonicalVerseId).toBe(ROMANS_8_28);
  });

  it('aligns chapter verses onto one row-per-verse grid across columns', async () => {
    const refs: TranslationRef[] = [
      { packId: 'core_bsb', translationCode: 'BSB' },
      { packId: 'trans_web', translationCode: 'WEB' },
    ];
    const columns = await reader.compareChapters(refs, 45, 8);
    const rows = alignChapterVerses(columns);

    expect(rows.map((row) => row.canonicalVerseId)).toEqual([ROMANS_8_28]);
    expect(rows[0]?.verse).toBe(28);
    expect(rows[0]?.cells.map((cell) => cell?.translationCode)).toEqual(['BSB', 'WEB']);
  });
});

describe('FR-103 Offline FTS5 Search', () => {
  it('finds a verse by terms and returns a highlighted snippet', async () => {
    const hits = await reader.search({ packId: 'core_bsb', text: 'work together for good' });

    expect(hits[0]?.canonicalVerseId).toBe(ROMANS_8_28);
    expect(hits[0]?.snippet).toContain('[[');
    expect(hits[0]?.snippet).toContain(']]');
  });

  it('supports phrase queries', async () => {
    const hits = await reader.search({ packId: 'core_bsb', text: '"work together for good"' });
    expect(hits.map((hit) => hit.canonicalVerseId)).toContain(ROMANS_8_28);
  });

  it('filters by book number', async () => {
    const hits = await reader.search({ packId: 'core_bsb', text: 'shepherd OR good', bookNumber: 45 });
    expect(hits.map((hit) => hit.canonicalVerseId)).toEqual([ROMANS_8_28]);
  });

  it('filters by translation code', async () => {
    const hits = await reader.search({ packId: 'core_bsb', text: 'work', translationCode: 'WEB' });
    expect(hits).toHaveLength(0);
  });

  it('filters by testament across the whole canon', async () => {
    // "shepherd OR good" matches Psalm 23:1 (OT, book 19) and Romans 8:28 (NT, book 45).
    const all = await reader.search({ packId: 'core_bsb', text: 'shepherd OR good' });
    expect(all.map((hit) => hit.canonicalVerseId).sort()).toEqual(
      [PSALM_23_1, ROMANS_8_28].sort(),
    );

    const ot = await reader.search({ packId: 'core_bsb', text: 'shepherd OR good', testament: 'OT' });
    expect(ot.map((hit) => hit.canonicalVerseId)).toEqual([PSALM_23_1]);

    const nt = await reader.search({ packId: 'core_bsb', text: 'shepherd OR good', testament: 'NT' });
    expect(nt.map((hit) => hit.canonicalVerseId)).toEqual([ROMANS_8_28]);
  });

  it('honours the result limit', async () => {
    const all = await reader.search({ packId: 'core_bsb', text: 'He' });
    expect(all.length).toBeGreaterThan(1);

    const limited = await reader.search({ packId: 'core_bsb', text: 'He', limit: 1 });
    expect(limited).toHaveLength(1);
  });
});

describe('Repository error contract', () => {
  it('throws DB_CONTENT_PACK_NOT_ATTACHED for a pack that is not installed', async () => {
    await expect(reader.getChapter('trans_kjv', 'KJV', 45, 8)).rejects.toMatchObject({
      code: 'DB_CONTENT_PACK_NOT_ATTACHED',
      domain: 'DB',
      retryPolicy: 'USER_ACTION',
    });

    await expect(reader.search({ packId: 'trans_kjv', text: 'grace' })).rejects.toMatchObject({
      code: 'DB_CONTENT_PACK_NOT_ATTACHED',
    });
  });
});

describe('FR-101 / FR-105 installed translations', () => {
  it('lists every attached translation pack by name', async () => {
    const translations = await reader.listTranslations();
    expect(translations.map((t) => [t.packId, t.translationCode, t.name])).toEqual([
      ['core_bsb', 'BSB', 'Berean Standard Bible'],
      ['trans_web', 'WEB', 'World English Bible'],
    ]);
    expect(translations.every((t) => t.hasWordAlignments === false)).toBe(true);
  });
});
