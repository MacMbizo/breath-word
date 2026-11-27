// Gate-1 Spike 1 / B4 §4.6 — USFM -> PackSource upstream parser verification.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DatabaseSync } from '../src/node-sqlite';

import { afterAll, describe, expect, it } from 'vitest';

import { AppError } from '@breath-and-word/core';

import { buildPackArtifacts, loadPackSource } from '../src/build-pack';
import { main as usfmMain, parseUsfmToPackSource, type UsfmPackProfile } from '../src/usfm';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-usfm-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const GENESIS_USFM = [
  '\\id GEN Berean Standard Bible',
  '\\ide UTF-8',
  '\\h Genesis',
  '\\toc1 Genesis',
  '\\mt Genesis',
  '\\c 1',
  '\\s Creation Account',
  '\\p',
  '\\v 1 In the beginning \\w God|strong="H430"\\w* created the heavens and the earth.',
  '\\v 2 Now the earth was formless and void,',
  '\\q1 and darkness was over the surface of the deep,',
  '\\q2 and the Spirit of God was hovering over the waters.',
  '\\c 2',
  '\\p',
  '\\v 1 Thus the heavens and the earth were completed in all their vast array.',
].join('\n');

const MATTHEW_USFM = [
  '\\id MAT',
  '\\c 5',
  '\\s The Beatitudes',
  '\\p',
  '\\v 3 \\wj Blessed are the poor in spirit, for theirs is the kingdom of heaven.\\wj*',
  '\\v 4 Blessed are those who mourn, for they will be comforted.',
].join('\n');

const PROFILE: UsfmPackProfile = {
  packId: 'core_bsb',
  contentVersion: '1.0.0',
  displayName: 'Berean Standard Bible',
  licenseSpdx: 'CC0-1.0',
  attributionText: 'Berean Standard Bible (public domain).',
  translationCode: 'BSB',
  translationName: 'Berean Standard Bible',
  builtAt: '2026-11-26T00:00:00Z',
};

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof AppError ? error.code : `not-app-error:${String(error)}`;
  }
  return 'no-error';
}

describe('USFM -> PackSource parser (B4 §4.6)', () => {
  const source = parseUsfmToPackSource(`${GENESIS_USFM}\n${MATTHEW_USFM}`, PROFILE);
  const verse = (book: number, chapter: number, number: number) =>
    source.verses.find((v) => v.book === book && v.chapter === chapter && v.verse === number);

  it('emits canonical book metadata for each \\id, in canonical order', () => {
    expect(source.books).toEqual([
      { number: 1, osis: 'Gen', name: 'Genesis', testament: 'OT', chapterCount: 2, literaryGenre: 'LAW' },
      { number: 40, osis: 'Matt', name: 'Matthew', testament: 'NT', chapterCount: 5, literaryGenre: 'GOSPEL' },
    ]);
  });

  it('keeps the section heading in content_json but out of searchable plain_text', () => {
    const gen11 = verse(1, 1, 1);
    expect(gen11?.plainText).toBe('In the beginning God created the heavens and the earth.');
    expect(gen11?.spans[0]).toEqual({ type: 'heading', text: 'Creation Account' });
    expect(gen11?.plainText.includes('Creation')).toBe(false);
  });

  it('joins poetry lines (\\q1/\\q2) onto the verse as poetry spans', () => {
    const gen12 = verse(1, 1, 2);
    expect(gen12?.spans.map((span) => span.type)).toEqual(['text', 'poetry', 'poetry']);
    expect(gen12?.plainText).toBe(
      'Now the earth was formless and void, and darkness was over the surface of the deep, ' +
        'and the Spirit of God was hovering over the waters.',
    );
  });

  it('records poetry nesting depth as indentLevel on \\q1/\\q2 spans', () => {
    const poetry = verse(1, 1, 2)?.spans.filter((span) => span.type === 'poetry');
    expect(poetry?.map((span) => span.indentLevel)).toEqual([1, 2]);
  });

  it('strips \\w word attributes and preserves the surface word', () => {
    expect(verse(1, 1, 1)?.plainText.includes('strong')).toBe(false);
    expect(verse(1, 1, 1)?.spans.some((span) => span.text.includes('God'))).toBe(true);
  });

  it('renders \\wj ... \\wj* as a red-letter run and leaves narrator text plain', () => {
    const matt53 = verse(40, 5, 3);
    expect(matt53?.spans).toEqual([
      { type: 'heading', text: 'The Beatitudes' },
      { type: 'red_letter', text: 'Blessed are the poor in spirit, for theirs is the kingdom of heaven.' },
    ]);
    expect(matt53?.plainText).toBe('Blessed are the poor in spirit, for theirs is the kingdom of heaven.');
    expect(verse(40, 5, 4)?.spans.every((span) => span.type === 'text')).toBe(true);
  });

  it('preserves inline footnotes as tappable markers and note records', () => {
    const withNote = parseUsfmToPackSource(
      '\\id GEN\n\\c 1\n\\p\n\\v 1 Light \\f + \\fr 1:3 \\ft A translator note.\\f* and darkness.\n',
      PROFILE,
    );
    const gen11 = withNote.verses[0];
    expect(gen11?.plainText).toBe('Light and darkness.');
    expect(gen11?.plainText.includes('translator')).toBe(false);
    expect(gen11?.spans.find((span) => span.type === 'footnote')).toEqual({
      type: 'footnote',
      text: 'a',
      footnoteId: '1001001:1',
    });
    expect(gen11?.footnotes).toEqual([{ marker: 'a', category: 'NOTE', bodyText: 'A translator note.' }]);
  });

  it('writes preserved footnotes into the built pack', () => {
    const withNote = parseUsfmToPackSource(
      '\\id MAT\n\\c 5\n\\p\n\\v 3 Blessed \\f + \\fr 5:3 \\ft A note.\\f* are the poor.\n',
      PROFILE,
    );
    const artifacts = buildPackArtifacts(withNote, join(tmpRoot, 'pack-footnotes'), {
      baseUrl: 'https://packs.breathandword.app/v1',
      minAppVersion: '0.1.0',
    });
    const db = new DatabaseSync(artifacts.sqlitePath);
    try {
      const rows = db
        .prepare('SELECT footnote_id, canonical_verse_id, marker, category, body_text FROM footnotes;')
        .all() as {
        footnote_id: string;
        canonical_verse_id: number;
        marker: string;
        category: string;
        body_text: string;
      }[];
      expect(rows).toEqual([
        {
          footnote_id: '40005003:1',
          canonical_verse_id: 40005003,
          marker: 'a',
          category: 'NOTE',
          body_text: 'A note.',
        },
      ]);
    } finally {
      db.close();
    }
  });

  it('fails loudly on an unknown \\id book code', () => {
    expect(codeOf(() => parseUsfmToPackSource('\\id XYZ\n\\c 1\n\\v 1 Hi.\n', PROFILE))).toBe(
      'PACK_PARSE_FAILED',
    );
  });

  it('fails loudly on a verse before any \\id', () => {
    expect(codeOf(() => parseUsfmToPackSource('\\c 1\n\\v 1 Hi.\n', PROFILE))).toBe('PACK_PARSE_FAILED');
  });

  it('round-trips through the pack builder into an integrity-clean, searchable pack', () => {
    const artifacts = buildPackArtifacts(source, join(tmpRoot, 'pack'), {
      baseUrl: 'https://packs.breathandword.app/v1',
      minAppVersion: '0.1.0',
    });
    const db = new DatabaseSync(artifacts.sqlitePath);
    try {
      const integrity = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
      expect(integrity.integrity_check).toBe('ok');

      const hits = db
        .prepare('SELECT canonical_verse_id FROM verses_fts WHERE verses_fts MATCH ?;')
        .all('beginning') as { canonical_verse_id: number }[];
      expect(hits.map((hit) => hit.canonical_verse_id)).toContain(1001001); // Genesis 1:1

      // Heading text stays out of the FTS index.
      const headingHits = db
        .prepare('SELECT canonical_verse_id FROM verses_fts WHERE verses_fts MATCH ?;')
        .all('Creation') as { canonical_verse_id: number }[];
      expect(headingHits).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('runs end-to-end from a USFM file via the CLI', () => {
    const inPath = join(tmpRoot, 'genesis.usfm');
    const outPath = join(tmpRoot, 'core_bsb.source.json');
    writeFileSync(inPath, GENESIS_USFM);

    usfmMain(['--in', inPath, '--out', outPath, '--pack-id', 'core_bsb', '--code', 'BSB', '--name', 'Berean Standard Bible']);

    const reloaded = loadPackSource(outPath);
    expect(reloaded.metadata.packId).toBe('core_bsb');
    expect(reloaded.metadata.licenseSpdx).toBe('CC0-1.0');
    expect(reloaded.translation.code).toBe('BSB');
    expect(reloaded.verses).toHaveLength(3);
    expect(JSON.parse(readFileSync(outPath, 'utf8'))).toMatchObject({ metadata: { packId: 'core_bsb' } });
  });
});

// Real upstream dialects: the BSB packs several `\v` milestones into one physical line and carries
// psalm superscriptions on heading markers, while the WEB wraps nearly every word in `\w`.
describe('USFM -> PackSource parser: real BSB/WEB dialects (B4 §4.6)', () => {
  const verseIn = (source: ReturnType<typeof parseUsfmToPackSource>, book: number, chapter: number, number: number) =>
    source.verses.find((v) => v.book === book && v.chapter === chapter && v.verse === number);

  it('splits several \\v milestones packed into one physical line (BSB)', () => {
    const source = parseUsfmToPackSource(
      ['\\id PSA', '\\c 1', '\\p \\v 1 Blessed is the man \\v 2 who walks not \\v 3 in the counsel'].join('\n'),
      PROFILE,
    );
    expect(source.verses.map((v) => v.verse)).toEqual([1, 2, 3]);
    expect(verseIn(source, 19, 1, 1)?.plainText).toBe('Blessed is the man');
    expect(verseIn(source, 19, 1, 2)?.plainText).toBe('who walks not');
    expect(verseIn(source, 19, 1, 3)?.plainText).toBe('in the counsel');
  });

  it('appends a marker-only continuation line to the verse in flight (BSB \\pmo)', () => {
    const source = parseUsfmToPackSource(
      [
        '\\id GEN',
        '\\c 1',
        '\\p \\v 1 And God said, "Let there be light." \\v 2 And God saw the light.',
        '\\pmo And there was evening, and there was morning — the first day.',
      ].join('\n'),
      PROFILE,
    );
    expect(verseIn(source, 1, 1, 2)?.plainText).toBe(
      'And God saw the light. And there was evening, and there was morning — the first day.',
    );
  });

  it('reads a verse carried on a heading marker as verse text, not a heading (BSB \\d)', () => {
    const source = parseUsfmToPackSource(
      [
        '\\id PSA',
        '\\c 3',
        '\\s1 Deliver Me, O LORD!',
        '\\d \\v 1 A Psalm of David, when he fled from his son Absalom.',
      ].join('\n'),
      PROFILE,
    );
    const psalm3v1 = verseIn(source, 19, 3, 1);
    expect(psalm3v1?.spans[0]).toEqual({ type: 'heading', text: 'Deliver Me, O LORD!' });
    expect(psalm3v1?.spans[1]).toEqual({ type: 'text', text: 'A Psalm of David, when he fled from his son Absalom.' });
    expect(psalm3v1?.plainText).toBe('A Psalm of David, when he fled from his son Absalom.');
  });

  it('attaches a section heading to the following verse, not the preceding one', () => {
    const source = parseUsfmToPackSource(
      [
        '\\id GEN',
        '\\c 1',
        '\\p \\v 1 In the beginning God created the heavens and the earth.',
        '\\p \\v 2 Now the earth was formless and void.',
        '\\s2 The First Day',
        '\\pmo \\v 3 And God said, "Let there be light."',
      ].join('\n'),
      PROFILE,
    );
    expect(verseIn(source, 1, 1, 2)?.spans.some((span) => span.text.includes('The First Day'))).toBe(false);
    expect(verseIn(source, 1, 1, 3)?.spans[0]).toEqual({ type: 'heading', text: 'The First Day' });
  });

  it('strips WEB \\w attributes and keeps note text out of the searchable verse', () => {
    const source = parseUsfmToPackSource(
      [
        '\\id GEN',
        '\\c 1',
        '\\p',
        '\\v 1 \\w In|strong="H8064"\\w* \\w the|strong="H1254"\\w* \\w beginning|strong="H7225"\\w*, ' +
          '\\w God|strong="H430"\\w*\\f + \\fr 1:1 \\ft The Hebrew word rendered "God" is "\\+wh elohim\\+wh*" (Elohim).\\f* ' +
          '\\w created|strong="H1254"\\w* \\w the|strong="H1254"\\w* \\w heavens|strong="H8064"\\w* ' +
          '\\w and|strong="H8064"\\w* \\w the|strong="H1254"\\w* \\w earth|strong="H8064"\\w*.',
      ].join('\n'),
      PROFILE,
    );
    const gen11 = verseIn(source, 1, 1, 1);
    expect(gen11?.plainText).toBe('In the beginning, God created the heavens and the earth.');
    expect(gen11?.plainText.includes('strong')).toBe(false);
    expect(gen11?.plainText.includes('Elohim')).toBe(false);
    expect(gen11?.plainText.includes('elohim')).toBe(false);
    expect(gen11?.spans.some((span) => span.type === 'footnote')).toBe(true);
    expect(gen11?.footnotes?.[0]?.bodyText).toContain('Elohim');
  });

  it('carries a red-letter run opened before \\v across the verse boundary (BSB \\wj)', () => {
    const source = parseUsfmToPackSource(
      ['\\id MAT', '\\c 3', '\\p \\wj \\v 15 "Let it be so now,"\\wj* Jesus replied.'].join('\n'),
      PROFILE,
    );
    const matt3v15 = verseIn(source, 40, 3, 15);
    expect(matt3v15?.spans[0]).toEqual({ type: 'red_letter', text: '"Let it be so now,"' });
    expect(matt3v15?.plainText).toBe('"Let it be so now," Jesus replied.');
  });

  it('skips front matter and deuterocanonical books, keeping the Protestant canon (WEB/KJV)', () => {
    const source = parseUsfmToPackSource(
      [
        '\\id FRT Preface to the World English Bible',
        '\\is1 What is the Holy Bible?',
        '\\ip The Holy Bible is a collection of books and letters.',
        '\\id TOB Tobit',
        '\\c 1',
        '\\p \\v 1 The book of the words of Tobit.',
        '\\id S3Y The Song of the Three Young Men',
        '\\c 1',
        '\\p \\v 1 And they walked in the midst of the fire.',
        '\\id GEN',
        '\\c 1',
        '\\p \\v 1 In the beginning God created the heavens and the earth.',
      ].join('\n'),
      PROFILE,
    );
    expect(source.books.map((book) => book.number)).toEqual([1]);
    expect(source.verses).toHaveLength(1);
    expect(source.verses[0]?.book).toBe(1);
    expect(source.verses[0]?.plainText).toBe('In the beginning God created the heavens and the earth.');
  });

  it('normalises spacing where a footnote splits a red-letter run (WEB \\wj)', () => {
    const source = parseUsfmToPackSource(
      [
        '\\id JHN',
        '\\c 3',
        '\\p \\v 16 \\wj For God so loved the world, that he gave his ' +
          '\\+w only|strong="G3439"\\+w* born\\wj*\\f + \\fr 3:16 \\ft A note.\\f* ' +
          '\\wj Son, that whoever believes\\wj*.',
      ].join('\n'),
      PROFILE,
    );
    const jhn316 = verseIn(source, 43, 3, 16);
    expect(jhn316?.plainText).toBe(
      'For God so loved the world, that he gave his only born Son, that whoever believes.',
    );
    expect(jhn316?.plainText.includes('  ')).toBe(false);
  });
});

describe('USFM word-level Strong\'s alignments (FR-301)', () => {
  const ALIGNED_USFM = [
    '\\id JHN',
    '\\c 1',
    '\\s The Word',
    '\\p',
    '\\v 16 \\w From|strong="G1537"\\w* \\w his|strong="G0846"\\w*  \\w fullness|strong="G4138"\\w* we all received \\w grace|strong="G5485"\\w*.',
    '\\c 3',
    '\\p',
    '\\v 16 \\wj “For \\+w God|strong="G2316"\\+w* so \\+w loved|strong="G0025"\\+w* the world.\\wj*',
    '\\q1 \\w Selah|lemma="x"\\w* \\w ok|strong="H9999z"\\w*',
  ].join('\n');

  it('records exact span offsets for every tagged word and strips the markers from the text', () => {
    const source = parseUsfmToPackSource(ALIGNED_USFM, PROFILE);
    const v116 = source.verses.find((v) => v.chapter === 1 && v.verse === 16);
    const v316 = source.verses.find((v) => v.chapter === 3 && v.verse === 16);
    expect(v116?.alignments?.map((a) => a.strongsId)).toEqual(['G1537', 'G846', 'G4138', 'G5485']);
    for (const verse of [v116, v316]) {
      for (const span of verse?.spans ?? []) expect(span.text).not.toMatch(/[\uE000-\uE002]/);
      expect(verse?.plainText).not.toMatch(/[\uE000-\uE002]/);
    }
    const words = (v: typeof v116): string[] =>
      (v?.alignments ?? []).map((a) => v?.spans[a.spanIndex]?.text.slice(a.charStart, a.charEnd) ?? '');
    expect(words(v116)).toEqual(['From', 'his', 'fullness', 'grace']);
    // Red-letter words are aligned inside their red_letter span; "Selah" has no strong tag.
    expect(words(v316)).toEqual(['God', 'loved', 'ok']);
    expect(v316?.alignments?.[0] && v316.spans[v316.alignments[0].spanIndex]?.type).toBe('red_letter');
    expect(v316?.alignments?.map((a) => a.strongsId)).toEqual(['G2316', 'G25', 'H9999']);
  });

  it('builds verse_word_alignments rows and sets has_word_alignments', () => {
    const source = parseUsfmToPackSource(ALIGNED_USFM, PROFILE);
    const outDir = join(tmpRoot, 'aligned-out');
    buildPackArtifacts(source, outDir, { minAppVersion: '0.1.0', baseUrl: 'https://example.invalid' });
    const db = new DatabaseSync(join(outDir, 'core_bsb-1.0.0.sqlite'));
    try {
      const flag = db.prepare('SELECT has_word_alignments AS f FROM translations').get() as { f: number };
      expect(flag.f).toBe(1);
      const rows = db
        .prepare(
          'SELECT canonical_verse_id AS v, strongs_id AS s, interlinear_word_pos AS p FROM verse_word_alignments ORDER BY id',
        )
        .all() as { v: number; s: string; p: number | null }[];
      expect(rows).toHaveLength(7);
      expect(rows[0]).toEqual({ v: 43001016, s: 'G1537', p: null });
    } finally {
      db.close();
    }
  });

  it('rejects an alignment whose range falls outside its span', () => {
    const source = parseUsfmToPackSource(ALIGNED_USFM, PROFILE);
    const verse = source.verses[0]!;
    verse.alignments = [{ spanIndex: 0, charStart: 0, charEnd: 9999, strongsId: 'G1537' }];
    expect(
      codeOf(() =>
        buildPackArtifacts(source, join(tmpRoot, 'bad-align'), {
          minAppVersion: '0.1.0',
          baseUrl: 'https://example.invalid',
        }),
      ),
    ).toBe('PACK_INTEGRITY_FAILED');
  });
});
