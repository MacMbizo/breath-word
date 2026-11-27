// tools/pack-builder — EXEGESIS pack ETL (`exegesis_step`; B4 §4.1/§4.2, B5, plan unit P3-09).
//
// Input is a normalized `ExegesisPackSource` produced by a dataset parser (STEPBible TAHOT /
// TAGNT TSVs, BDB / Thayer / Abbott-Smith lexicons). This builder:
//   1. validates metadata, including the B5 licence / attribution rules (`assertPackMetadata`);
//   2. normalizes every Strong's ID to unpadded uppercase (`G0026` -> `G26`, AGENTS.md rule 4)
//      and rejects malformed IDs, mismatched languages and duplicates instead of dropping them;
//   3. derives lexicon OT/NT/total occurrence counts from the tokens actually shipped;
//   4. bulk-inserts into `EXEGESIS_PACK_DDL` in one transaction;
//   5. runs the shared integrity checks plus exegesis-specific ones, and deletes the file on failure.

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { DatabaseSync } from './node-sqlite';
import {
  assertPackMetadata,
  closeAndDiscard,
  closeQuietly,
  insertPackMetadata,
  isStrictCanonicalVerseId,
  packIntegrityFailed,
  packSourceInvalid,
  packageArtifacts,
  verifyPackDatabase,
  type PackBuildArtifacts,
  type PackBuildOptions,
  type PackMetadataInput,
} from './pack-common';

import {
  EXEGESIS_PACK_DDL,
  normalizeStrongsId,
  type LexiconSection,
  type OriginalLanguage,
  type SourceVersification,
  type VersificationMappingType,
} from '@breath-and-word/core';

/** The runtime's default exegesis pack id (`ExegesisRepository`). */
export const EXEGESIS_PACK_ID = 'exegesis_step';

/** First canonical id of the New Testament (Matthew 1:1). OT/NT split for occurrence counts. */
const NT_FIRST_VERSE_ID = 40_001_001;

const SOURCE_VERSIFICATIONS: readonly SourceVersification[] = ['hebrew_mt', 'lxx', 'na28'];
const MAPPING_TYPES: readonly VersificationMappingType[] = ['EXACT', 'OFFSET', 'SPLIT', 'MERGE'];
const LANGUAGES: readonly OriginalLanguage[] = ['hebrew', 'aramaic', 'greek'];

export interface ExegesisVersificationInput {
  sourceVersification: SourceVersification;
  /** Verse id in the source versification, BBCCCVVV-encoded (e.g. MT Mal 3:19 = 39003019). */
  sourceVerseId: number;
  /** Protestant BBCCCVVV id the source verse maps to. */
  canonicalVerseId: number;
  /** Defaults to `EXACT`. */
  mappingType?: VersificationMappingType;
}

export interface ExegesisTokenInput {
  canonicalVerseId: number;
  /** Original-versification verse id; defaults to `canonicalVerseId` when versifications agree. */
  sourceVerseId?: number;
  /** 1-based word order within the verse. */
  wordPosition: number;
  originalWord: string;
  transliteration?: string;
  englishGloss?: string;
  /** Raw Strong's id as the dataset ships it (`H0430`, `g26`); normalized at build time. */
  strongsId?: string;
  lemma?: string;
  morphologyCode?: string;
  morphologyHuman?: string;
}

export interface ExegesisLexiconInput {
  /** Raw Strong's id; normalized at build time. Must agree with `language` (G = Greek, H = Hebrew/Aramaic). */
  strongsId: string;
  language: OriginalLanguage;
  lemma: string;
  transliteration?: string;
  pronunciation?: string;
  shortDefinition: string;
  /** Structured BDB / Thayer / Abbott-Smith sections, stored as `full_entry_json`. */
  sections: LexiconSection[];
}

/** Normalized, dependency-free input to the exegesis pack builder. */
export interface ExegesisPackSource {
  metadata: PackMetadataInput;
  versificationMaps: ExegesisVersificationInput[];
  tokens: ExegesisTokenInput[];
  lexicon: ExegesisLexiconInput[];
}

export interface ExegesisPackBuildStats {
  versificationMapCount: number;
  tokenCount: number;
  lexiconEntryCount: number;
  /** Distinct normalized Strong's ids used by tokens that have no lexicon entry (reported, not fatal). */
  unresolvedStrongsIds: string[];
}

interface NormalizedToken {
  canonicalVerseId: number;
  sourceVerseId: number;
  wordPosition: number;
  originalWord: string;
  transliteration: string | null;
  englishGloss: string | null;
  strongsId: string | null;
  lemma: string | null;
  morphologyCode: string | null;
  morphologyHuman: string | null;
}

interface NormalizedLexiconEntry {
  strongsId: string;
  language: OriginalLanguage;
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  shortDefinition: string;
  fullEntryJson: string;
}

interface NormalizedExegesisSource {
  maps: Required<ExegesisVersificationInput>[];
  tokens: NormalizedToken[];
  lexicon: NormalizedLexiconEntry[];
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireText(value: unknown, where: string): string {
  const text = optionalText(value);
  if (text === null) throw packSourceInvalid(`${where} must be a non-empty string.`);
  return text;
}

function requireArray<T>(value: unknown, where: string): T[] {
  if (!Array.isArray(value)) throw packSourceInvalid(`${where} must be an array.`);
  return value as T[];
}

/**
 * Normalize a raw Strong's id, or throw. A present-but-unparseable id is a dataset error and must
 * fail the build — silently storing `NULL` would hide broken tap-to-Strong's links (FR-301).
 */
function normalizeStrongsOrThrow(raw: unknown, where: string): string {
  const normalized = typeof raw === 'string' ? normalizeStrongsId(raw) : null;
  if (normalized === null) {
    throw packSourceInvalid(`${where}: "${String(raw)}" is not a valid Strong's id (expected G<n> or H<n>).`);
  }
  return normalized;
}

function languageMatchesPrefix(strongsId: string, language: OriginalLanguage): boolean {
  return strongsId.startsWith('G') ? language === 'greek' : language === 'hebrew' || language === 'aramaic';
}

function normalizeSections(value: unknown, where: string): string {
  const sections = requireArray<unknown>(value, `${where}.sections`);
  const normalized: LexiconSection[] = sections.map((item, index) => {
    const at = `${where}.sections[${index}]`;
    if (typeof item !== 'object' || item === null) throw packSourceInvalid(`${at} must be an object.`);
    const rec = item as Record<string, unknown>;
    const source = optionalText(rec.source);
    let subEntries: string[] | undefined;
    if (rec.subEntries !== undefined) {
      subEntries = requireArray<unknown>(rec.subEntries, `${at}.subEntries`).map((entry, i) =>
        requireText(entry, `${at}.subEntries[${i}]`),
      );
    }
    return {
      heading: requireText(rec.heading, `${at}.heading`),
      body: requireText(rec.body, `${at}.body`),
      ...(source !== null ? { source } : {}),
      ...(subEntries !== undefined ? { subEntries } : {}),
    };
  });
  return JSON.stringify(normalized);
}

/** Validate and normalize a source before any row is written. Throws `PACK_PARSE_FAILED`. */
function normalizeExegesisSource(source: ExegesisPackSource): NormalizedExegesisSource {
  const maps = requireArray<ExegesisVersificationInput>(source.versificationMaps, 'versificationMaps').map(
    (map, index) => {
      const at = `versificationMaps[${index}]`;
      if (!SOURCE_VERSIFICATIONS.includes(map.sourceVersification)) {
        throw packSourceInvalid(`${at}.sourceVersification "${String(map.sourceVersification)}" is not one of ${SOURCE_VERSIFICATIONS.join(', ')}.`);
      }
      const mappingType = map.mappingType ?? 'EXACT';
      if (!MAPPING_TYPES.includes(mappingType)) {
        throw packSourceInvalid(`${at}.mappingType "${String(mappingType)}" is not one of ${MAPPING_TYPES.join(', ')}.`);
      }
      if (!Number.isSafeInteger(map.sourceVerseId) || map.sourceVerseId <= 0) {
        throw packSourceInvalid(`${at}.sourceVerseId must be a positive integer.`);
      }
      if (!isStrictCanonicalVerseId(map.canonicalVerseId)) {
        throw packSourceInvalid(`${at}.canonicalVerseId ${String(map.canonicalVerseId)} is not a Protestant BBCCCVVV id.`);
      }
      return { ...map, mappingType };
    },
  );

  const seenPositions = new Set<string>();
  const tokens = requireArray<ExegesisTokenInput>(source.tokens, 'tokens').map((token, index): NormalizedToken => {
    const at = `tokens[${index}]`;
    if (!isStrictCanonicalVerseId(token.canonicalVerseId)) {
      throw packSourceInvalid(`${at}.canonicalVerseId ${String(token.canonicalVerseId)} is not a Protestant BBCCCVVV id.`);
    }
    const sourceVerseId = token.sourceVerseId ?? token.canonicalVerseId;
    if (!Number.isSafeInteger(sourceVerseId) || sourceVerseId <= 0) {
      throw packSourceInvalid(`${at}.sourceVerseId must be a positive integer.`);
    }
    if (!Number.isSafeInteger(token.wordPosition) || token.wordPosition < 1) {
      throw packSourceInvalid(`${at}.wordPosition must be an integer >= 1.`);
    }
    const key = `${token.canonicalVerseId}:${token.wordPosition}`;
    if (seenPositions.has(key)) {
      throw packSourceInvalid(`${at} duplicates word ${token.wordPosition} of verse ${token.canonicalVerseId}.`);
    }
    seenPositions.add(key);

    const rawStrongs = optionalText(token.strongsId);
    return {
      canonicalVerseId: token.canonicalVerseId,
      sourceVerseId,
      wordPosition: token.wordPosition,
      originalWord: requireText(token.originalWord, `${at}.originalWord`),
      transliteration: optionalText(token.transliteration),
      englishGloss: optionalText(token.englishGloss),
      strongsId: rawStrongs !== null ? normalizeStrongsOrThrow(rawStrongs, `${at}.strongsId`) : null,
      lemma: optionalText(token.lemma),
      morphologyCode: optionalText(token.morphologyCode),
      morphologyHuman: optionalText(token.morphologyHuman),
    };
  });

  const seenStrongs = new Map<string, number>();
  const lexicon = requireArray<ExegesisLexiconInput>(source.lexicon, 'lexicon').map(
    (entry, index): NormalizedLexiconEntry => {
      const at = `lexicon[${index}]`;
      const strongsId = normalizeStrongsOrThrow(entry.strongsId, `${at}.strongsId`);
      const previous = seenStrongs.get(strongsId);
      if (previous !== undefined) {
        // `G0026` and `G26` collapse to the same key; two entries would make lookups ambiguous.
        throw packSourceInvalid(`${at}.strongsId "${entry.strongsId}" duplicates lexicon[${previous}] (both normalize to ${strongsId}).`);
      }
      seenStrongs.set(strongsId, index);
      if (!LANGUAGES.includes(entry.language)) {
        throw packSourceInvalid(`${at}.language "${String(entry.language)}" is not one of ${LANGUAGES.join(', ')}.`);
      }
      if (!languageMatchesPrefix(strongsId, entry.language)) {
        throw packSourceInvalid(`${at}: ${strongsId} cannot be ${entry.language} (G = Greek, H = Hebrew/Aramaic).`);
      }
      return {
        strongsId,
        language: entry.language,
        lemma: requireText(entry.lemma, `${at}.lemma`),
        transliteration: optionalText(entry.transliteration),
        pronunciation: optionalText(entry.pronunciation),
        shortDefinition: requireText(entry.shortDefinition, `${at}.shortDefinition`),
        fullEntryJson: normalizeSections(entry.sections, at),
      };
    },
  );

  return { maps, tokens, lexicon };
}

/** Count of rows matching `sql` (a `SELECT COUNT(*) AS n …`). */
function count(db: DatabaseSync, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

/**
 * Exegesis-specific post-insert checks (B4 §4.1/§4.2). Every Strong's id stored must be canonical
 * (`[GH]` + digits, no leading zero), every verse id a Protestant BBCCCVVV id, and lexicon
 * occurrence counts must agree with the shipped tokens.
 */
function verifyExegesisContent(db: DatabaseSync, metadata: PackMetadataInput): void {
  const nonCanonicalStrongs = (table: string): string =>
    `SELECT COUNT(*) AS n FROM ${table}
      WHERE strongs_id IS NOT NULL
        AND (strongs_id NOT GLOB '[GH][1-9]*' OR substr(strongs_id, 2) GLOB '*[^0-9]*')`;

  const checks: [string, string][] = [
    ['interlinear_tokens.strongs_id is not unpadded uppercase', nonCanonicalStrongs('interlinear_tokens')],
    ['lexicon_entries.strongs_id is not unpadded uppercase', nonCanonicalStrongs('lexicon_entries')],
    [
      'interlinear_tokens.canonical_verse_id is outside BBCCCVVV bounds',
      `SELECT COUNT(*) AS n FROM interlinear_tokens
        WHERE canonical_verse_id < 1001001 OR canonical_verse_id > 66999999`,
    ],
    [
      'versification_maps.canonical_verse_id is outside BBCCCVVV bounds',
      `SELECT COUNT(*) AS n FROM versification_maps
        WHERE canonical_verse_id < 1001001 OR canonical_verse_id > 66999999`,
    ],
    [
      'lexicon_entries occurrence counts disagree with interlinear_tokens',
      `SELECT COUNT(*) AS n FROM lexicon_entries l
        WHERE l.total_occurrences != l.ot_occurrences + l.nt_occurrences
           OR l.total_occurrences != (SELECT COUNT(*) FROM interlinear_tokens t WHERE t.strongs_id = l.strongs_id)`,
    ],
  ];

  for (const [label, sql] of checks) {
    const n = count(db, sql);
    if (n > 0) throw packIntegrityFailed(metadata.packId, `${n} row(s): ${label}.`);
  }
}

/** Build `exegesis_step.sqlite` from a normalized source (B4 §4.2 pack type 2). */
export function buildExegesisPackDatabase(source: ExegesisPackSource, sqlitePath: string): ExegesisPackBuildStats {
  assertPackMetadata(source.metadata, 'EXEGESIS');
  const normalized = normalizeExegesisSource(source);

  // Occurrence counts come from the tokens this pack ships, so FR-302 frequency totals always
  // agree with the verse list a user can tap through.
  const occurrences = new Map<string, { ot: number; nt: number }>();
  for (const token of normalized.tokens) {
    if (token.strongsId === null) continue;
    const tally = occurrences.get(token.strongsId) ?? { ot: 0, nt: 0 };
    if (token.canonicalVerseId < NT_FIRST_VERSE_ID) tally.ot += 1;
    else tally.nt += 1;
    occurrences.set(token.strongsId, tally);
  }
  const lexiconIds = new Set(normalized.lexicon.map((entry) => entry.strongsId));
  const unresolvedStrongsIds = [...occurrences.keys()].filter((id) => !lexiconIds.has(id)).sort();

  rmSync(sqlitePath, { force: true });
  const db = new DatabaseSync(sqlitePath);
  try {
    db.exec(EXEGESIS_PACK_DDL);
    db.exec('BEGIN');

    insertPackMetadata(db, source.metadata);

    const insertMap = db.prepare(
      `INSERT INTO versification_maps (source_versification, source_verse_id, canonical_verse_id, mapping_type)
       VALUES (?, ?, ?, ?)`,
    );
    for (const map of normalized.maps) {
      insertMap.run(map.sourceVersification, map.sourceVerseId, map.canonicalVerseId, map.mappingType);
    }

    const insertToken = db.prepare(
      `INSERT INTO interlinear_tokens
         (canonical_verse_id, source_verse_id, word_position, original_word, transliteration,
          english_gloss, strongs_id, lemma, morphology_code, morphology_human)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const token of normalized.tokens) {
      insertToken.run(
        token.canonicalVerseId,
        token.sourceVerseId,
        token.wordPosition,
        token.originalWord,
        token.transliteration,
        token.englishGloss,
        token.strongsId,
        token.lemma,
        token.morphologyCode,
        token.morphologyHuman,
      );
    }

    const insertLexicon = db.prepare(
      `INSERT INTO lexicon_entries
         (strongs_id, language, lemma, transliteration, pronunciation, short_definition,
          full_entry_json, ot_occurrences, nt_occurrences, total_occurrences)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const entry of normalized.lexicon) {
      const tally = occurrences.get(entry.strongsId) ?? { ot: 0, nt: 0 };
      insertLexicon.run(
        entry.strongsId,
        entry.language,
        entry.lemma,
        entry.transliteration,
        entry.pronunciation,
        entry.shortDefinition,
        entry.fullEntryJson,
        tally.ot,
        tally.nt,
        tally.ot + tally.nt,
      );
    }

    db.exec('COMMIT');

    verifyPackDatabase(db, source.metadata);
    verifyExegesisContent(db, source.metadata);

    return {
      versificationMapCount: normalized.maps.length,
      tokenCount: normalized.tokens.length,
      lexiconEntryCount: normalized.lexicon.length,
      unresolvedStrongsIds,
    };
  } catch (error) {
    closeAndDiscard(db, sqlitePath);
    throw error;
  } finally {
    closeQuietly(db);
  }
}

/** Build the exegesis `.sqlite`, gzip it, and describe it as a manifest entry. */
export function buildExegesisPackArtifacts(
  source: ExegesisPackSource,
  outDir: string,
  options: PackBuildOptions,
): PackBuildArtifacts & { stats: ExegesisPackBuildStats } {
  mkdirSync(outDir, { recursive: true });
  const { metadata } = source;
  const sqlitePath = join(outDir, `${metadata.packId}-${metadata.contentVersion.trim()}.sqlite`);
  const stats = buildExegesisPackDatabase(source, sqlitePath);
  return { ...packageArtifacts(sqlitePath, metadata, options), stats };
}

/**
 * A tiny **sample** exegesis source for local device testing of FR-301/302 (tap-to-Strong's,
 * lexicon sheet, word frequency). It is NOT a release pack: it covers Genesis 1:1 and
 * 1 John 4:8 only, and its lexicon sections are short summaries written for this fixture.
 * Strong's ids are deliberately zero-padded the way STEPBible TSVs ship them, so the fixture
 * exercises the normalization path (`H0430` -> `H430`, `G0026` -> `G26`).
 */
export function createSampleExegesisPackSource(): ExegesisPackSource {
  const gen = 1_001_001;
  const john = 62_004_008;
  const hebrew = (
    position: number,
    word: string,
    translit: string,
    gloss: string,
    strongs: string,
    morph: string,
    human: string,
  ): ExegesisTokenInput => ({
    canonicalVerseId: gen,
    wordPosition: position,
    originalWord: word,
    transliteration: translit,
    englishGloss: gloss,
    strongsId: strongs,
    morphologyCode: morph,
    morphologyHuman: human,
  });
  const greek = (
    position: number,
    word: string,
    translit: string,
    gloss: string,
    strongs: string,
  ): ExegesisTokenInput => ({
    canonicalVerseId: john,
    wordPosition: position,
    originalWord: word,
    transliteration: translit,
    englishGloss: gloss,
    strongsId: strongs,
  });

  return {
    metadata: {
      packId: EXEGESIS_PACK_ID,
      packType: 'EXEGESIS',
      contentVersion: '0.0.1-sample',
      displayName: 'Exegesis Sample Fixture (NOT a release pack)',
      licenseSpdx: 'CC-BY-4.0',
      attributionText:
        'Sample fixture shaped like STEPBible.org data (Tyndale House, Cambridge), CC BY 4.0 — ' +
        'https://creativecommons.org/licenses/by/4.0/. For local testing only.',
      builtAt: '2026-11-27T00:00:00Z',
    },
    versificationMaps: [
      // Hebrew MT numbers Malachi 4 as 3:19-24, so MT Mal 3:19 is English Mal 4:1.
      { sourceVersification: 'hebrew_mt', sourceVerseId: 39_003_019, canonicalVerseId: 39_004_001, mappingType: 'OFFSET' },
      { sourceVersification: 'hebrew_mt', sourceVerseId: 1_001_001, canonicalVerseId: gen },
    ],
    tokens: [
      hebrew(1, 'בְּרֵאשִׁית', 'bereshit', 'in the beginning', 'H7225', 'HRd/Ncfsa', 'preposition + noun, feminine singular'),
      hebrew(2, 'בָּרָא', 'bara', 'created', 'H1254', 'HVqp3ms', 'verb, qal perfect, 3rd masculine singular'),
      hebrew(3, 'אֱלֹהִים', 'elohim', 'God', 'H0430', 'HNcmpa', 'noun, masculine plural'),
      hebrew(4, 'אֵת', 'et', '(object marker)', 'H0853', 'HTo', 'direct object marker'),
      hebrew(5, 'הַשָּׁמַיִם', 'hashamayim', 'the heavens', 'H8064', 'HTd/Ncmpa', 'article + noun, masculine plural'),
      hebrew(6, 'וְאֵת', 'veet', 'and', 'H0853', 'HC/To', 'conjunction + direct object marker'),
      hebrew(7, 'הָאָרֶץ', 'haarets', 'the earth', 'H0776', 'HTd/Ncbsa', 'article + noun, singular'),
      greek(1, 'ὁ', 'ho', 'the one', 'G3588'),
      greek(2, 'μὴ', 'mē', 'not', 'G3361'),
      greek(3, 'ἀγαπῶν', 'agapōn', 'loving', 'G0025'),
      greek(4, 'οὐκ', 'ouk', 'not', 'G3756'),
      greek(5, 'ἔγνω', 'egnō', 'has known', 'G1097'),
      greek(6, 'τὸν', 'ton', 'the', 'G3588'),
      greek(7, 'θεόν', 'theon', 'God', 'G2316'),
      greek(8, 'ὅτι', 'hoti', 'because', 'G3754'),
      greek(9, 'ὁ', 'ho', 'the', 'G3588'),
      greek(10, 'θεὸς', 'theos', 'God', 'G2316'),
      greek(11, 'ἀγάπη', 'agapē', 'love', 'G0026'),
      greek(12, 'ἐστίν', 'estin', 'is', 'G2076'),
    ],
    lexicon: [
      {
        strongsId: 'G0026',
        language: 'greek',
        lemma: 'ἀγάπη',
        transliteration: 'agapē',
        pronunciation: 'ag-ah-pay',
        shortDefinition: 'love, goodwill',
        sections: [
          { heading: 'Definition', body: 'Love: self-giving goodwill and esteem.', source: 'Sample fixture' },
        ],
      },
      {
        strongsId: 'H0430',
        language: 'hebrew',
        lemma: 'אֱלֹהִים',
        transliteration: 'elohim',
        pronunciation: 'el-o-heem',
        shortDefinition: 'God; gods',
        sections: [
          { heading: 'Definition', body: 'God (the one true God); also gods or mighty ones.', source: 'Sample fixture' },
        ],
      },
    ],
  };
}

/** Narrow a loaded JSON source to an exegesis source by its declared pack type. */
export function isExegesisPackSource(value: { metadata?: { packType?: unknown } }): value is ExegesisPackSource {
  return value.metadata?.packType === 'EXEGESIS';
}
