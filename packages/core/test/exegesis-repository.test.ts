// FR-301 Clickable Strong's, Interlinear & Morphology + FR-302 Lexicon & Word Frequency Suite
// + FR-103 Strong's ID Search (B4 §4.2 `exegesis_step` pack).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EXEGESIS_PACK_DDL, TRANSLATION_PACK_DDL } from '../src/content/pack-schema';
import {
  isRtlOriginalLanguage,
  isRtlStrongsId,
  isValidStrongsId,
  normalizeStrongsId,
} from '../src/domain/strongs';
import { isAppError } from '../src/errors/AppError';
import { ExegesisRepository } from '../src/repositories/exegesis-repository';

import { NodeContentDbAdapter } from './helpers/node-content-db';
import { DatabaseSync } from './helpers/node-sqlite';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-exegesis-'));
const exegesisPath = join(tmpRoot, 'exegesis_step.sqlite');
const bsbPath = join(tmpRoot, 'core_bsb.sqlite');

beforeAll(() => {
  // Build minimal schema-faithful `exegesis_step.sqlite`
  const exDb = new DatabaseSync(exegesisPath);
  try {
    exDb.exec(EXEGESIS_PACK_DDL);
    exDb
      .prepare(
        `INSERT INTO pack_metadata
           (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
         VALUES ('exegesis_step', 'EXEGESIS', 1, '1.0.0', 'STEPBible Exegesis', 'CC-BY-4.0', 'STEPBible.org / Tyndale House, Cambridge', '2026-11-27T00:00:00Z')`,
      )
      .run();

    // Versification map: Psalm 51:1-2 MT -> Psalm 51:0/1 Eng (B4 §4.1)
    exDb
      .prepare(
        `INSERT INTO versification_maps (source_versification, source_verse_id, canonical_verse_id, mapping_type)
         VALUES ('hebrew_mt', 19051003, 19051001, 'OFFSET')`,
      )
      .run();

    // Lexicon entries: G26 (agape) and H430 (Elohim)
    const insertLex = exDb.prepare(
      `INSERT INTO lexicon_entries
         (strongs_id, language, lemma, transliteration, pronunciation, short_definition, full_entry_json,
          ot_occurrences, nt_occurrences, total_occurrences)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertLex.run(
      'G26',
      'greek',
      'ἀγάπη',
      'agapē',
      'ag-ah-pay',
      'love, goodwill, benevolence',
      JSON.stringify([
        {
          heading: 'Thayer Definition',
          body: 'Affection, goodwill, love, benevolence; brotherly love.',
          source: 'Thayer',
          subEntries: ['1. of love to God and Christ', '2. of love to fellow believers'],
        },
      ]),
      0,
      116,
      116,
    );
    insertLex.run(
      'H430',
      'hebrew',
      'אֱלֹהִים',
      'elohim',
      'el-o-heem',
      'God, gods, judges',
      JSON.stringify([
        {
          heading: 'BDB Definition',
          body: 'Rulers, judges; divine ones; the true God.',
          source: 'BDB',
        },
      ]),
      2606,
      0,
      2606,
    );

    // Interlinear tokens: 1 Cor 13:4 (46013004), John 3:16 (43003016), Gen 1:1 (1001001)
    const insertTok = exDb.prepare(
      `INSERT INTO interlinear_tokens
         (canonical_verse_id, source_verse_id, word_position, original_word, transliteration,
          english_gloss, strongs_id, lemma, morphology_code, morphology_human)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertTok.run(
      46013004,
      46013004,
      1,
      'Ἡ',
      'Hē',
      'The',
      'G3588',
      'ὁ',
      'T-NSF',
      'Article - Nominative Singular Feminine',
    );
    insertTok.run(
      46013004,
      46013004,
      2,
      'ἀγάπη',
      'agapē',
      'love',
      'G26',
      'ἀγάπη',
      'N-NSF',
      'Noun - Nominative Feminine Singular',
    );
    insertTok.run(
      46013004,
      46013004,
      3,
      'μακροθυμεῖ',
      'makrothymei',
      'is patient',
      'G3114',
      'μακροθυμέω',
      'V-PAI-3S',
      'Verb - Present Active Indicative - 3rd Person Singular',
    );
    insertTok.run(
      43003016,
      43003016,
      5,
      'ἀγάπη',
      'agapē',
      'love',
      'G26',
      'ἀγάπη',
      'N-NSF',
      'Noun - Nominative Feminine Singular',
    );
    insertTok.run(
      1001001,
      1001001,
      3,
      'אֱלֹהִים',
      'elohim',
      'God',
      'H430',
      'אֱלֹהִים',
      'HNcmpa',
      'Noun - masculine plural absolute',
    );
  } finally {
    exDb.close();
  }

  // Build minimal `core_bsb.sqlite` carrying `verse_word_alignments` for 1 Cor 13:4
  const trDb = new DatabaseSync(bsbPath);
  try {
    trDb.exec(TRANSLATION_PACK_DDL);
    trDb
      .prepare(
        `INSERT INTO pack_metadata
           (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
         VALUES ('core_bsb', 'TRANSLATION', 1, '1.0.0', 'BSB', 'CC0-1.0', 'Public domain', '2026-11-27T00:00:00Z')`,
      )
      .run();
    trDb
      .prepare(
        `INSERT INTO verse_word_alignments
           (translation_code, canonical_verse_id, span_index, char_start, char_end, strongs_id, interlinear_word_pos)
         VALUES ('BSB', 46013004, 0, 0, 4, 'G0026', 2)`,
      )
      .run();
  } finally {
    trDb.close();
  }
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let contentDb: NodeContentDbAdapter;
let repo: ExegesisRepository;

beforeEach(async () => {
  contentDb = new NodeContentDbAdapter();
  await contentDb.attachPack('core_bsb', bsbPath);
  await contentDb.attachPack('exegesis_step', exegesisPath);
  repo = new ExegesisRepository({ contentDb });
});

afterEach(() => {
  contentDb.close();
});

describe('Strong’s normalization & RTL helpers (AGENTS.md rules 4 & 6)', () => {
  it('normalizes padded/lowercase Strong’s IDs to unpadded uppercase', () => {
    expect(normalizeStrongsId('g0026')).toBe('G26');
    expect(normalizeStrongsId('  H0430 ')).toBe('H430');
    expect(normalizeStrongsId('G0')).toBeNull();
    expect(normalizeStrongsId('X12')).toBeNull();
    expect(isValidStrongsId('G26')).toBe(true);
    expect(isValidStrongsId('bad')).toBe(false);
  });

  it('identifies RTL languages and Hebrew Strong’s IDs for bidi isolation', () => {
    expect(isRtlOriginalLanguage('hebrew')).toBe(true);
    expect(isRtlOriginalLanguage('aramaic')).toBe(true);
    expect(isRtlOriginalLanguage('greek')).toBe(false);
    expect(isRtlStrongsId('H430')).toBe(true);
    expect(isRtlStrongsId('G26')).toBe(false);
  });
});

describe('ExegesisRepository (FR-301, FR-302, FR-103 Strong’s)', () => {
  it('FR-301: tapping "love" in 1 Cor 13:4 returns G26 (agapē), lexicon, and full morphology', async () => {
    const inspection = await repo.inspectAlignedWord('core_bsb', 'BSB', 46013004, { charOffset: 1 });
    expect(inspection.passageReference).toBe('1 Corinthians 13:4');
    expect(inspection.alignment?.strongsId).toBe('G26');
    expect(inspection.token?.originalWord).toBe('ἀγάπη');
    expect(inspection.token?.transliteration).toBe('agapē');
    expect(inspection.token?.morphologyHuman).toBe('Noun - Nominative Feminine Singular');
    expect(inspection.lexicon?.strongsId).toBe('G26');
    expect(inspection.lexicon?.sections[0]?.heading).toBe('Thayer Definition');
  });

  it('FR-301: returns ordered interlinear tokens for a verse', async () => {
    const tokens = await repo.getVerseInterlinear(46013004);
    expect(tokens.map((t) => t.wordPosition)).toEqual([1, 2, 3]);
    expect(tokens[1]?.strongsId).toBe('G26');
  });

  it('FR-302: returns structured lexicon + OT/NT counts and per-book distribution for G26', async () => {
    const freq = await repo.getWordFrequency('g0026');
    expect(freq.strongsId).toBe('G26');
    expect(freq.otOccurrences).toBe(0);
    expect(freq.ntOccurrences).toBe(116);
    expect(freq.totalOccurrences).toBe(116);
    expect(freq.byBook).toEqual([
      { bookNumber: 43, bookName: 'John', testament: 'NT', occurrences: 1 },
      { bookNumber: 46, bookName: '1 Corinthians', testament: 'NT', occurrences: 1 },
    ]);
    expect(freq.occurrences.map((o) => o.canonicalVerseId)).toEqual([43003016, 46013004]);
  });

  it('FR-103: filters Strong’s search by testament and bookNumber', async () => {
    const ntOnly = await repo.searchByStrongs('G26', { testament: 'NT', bookNumber: 46 });
    expect(ntOnly).toHaveLength(1);
    expect(ntOnly[0]?.passageReference).toBe('1 Corinthians 13:4');

    const otHebrew = await repo.searchByStrongs('H0430', { testament: 'OT' });
    expect(otHebrew).toHaveLength(1);
    expect(otHebrew[0]?.originalWord).toBe('אֱלֹהִים');
  });

  it('B4 §4.1: resolves MT versification offset (Ps 51:3 MT -> Ps 51:1 Protestant)', async () => {
    const maps = await repo.resolveVersification('hebrew_mt', 19051003);
    expect(maps).toEqual([
      {
        sourceVersification: 'hebrew_mt',
        sourceVerseId: 19051003,
        canonicalVerseId: 19051001,
        mappingType: 'OFFSET',
      },
    ]);
  });

  it('throws canonical DB_CONTENT_PACK_NOT_ATTACHED when exegesis_step is absent', async () => {
    await contentDb.detachPack('exegesis_step');
    expect(await repo.isAvailable()).toBe(false);
    try {
      await repo.getLexiconEntry('G26');
      expect.unreachable('Expected DB_CONTENT_PACK_NOT_ATTACHED');
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) {
        expect(err.code).toBe('DB_CONTENT_PACK_NOT_ATTACHED');
        expect(err.domain).toBe('DB');
      }
    }
  });
});
