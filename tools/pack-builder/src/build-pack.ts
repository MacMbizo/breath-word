// tools/pack-builder — Content Pack ETL (B3 §4.1, B4 §4.2/§4.6).
//
// Pipeline: normalized `PackSource` -> SQLite (+ FTS5 rebuild, ANALYZE, VACUUM)
//            -> gzip -> SHA-256 -> `manifest.json`.
//
// Raw open-dataset parsers (BSB XML, STEPBible TAHOT/TAGNT, TSK) normalize INTO a
// `PackSource`; Protestant BBCCCVVV mapping happens during that parse step, so this
// builder only enforces the canonical id derived from book/chapter/verse.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

import { DatabaseSync } from './node-sqlite';

import {
  AppError,
  BOOKS,
  MANIFEST_VERSION,
  PACK_SCHEMA_VERSION,
  TRANSLATION_PACK_DDL,
  toCanonicalVerseId,
  type ManifestPackEntry,
  type PackManifest,
  type PackType,
  type VerseSpan,
} from '@breath-and-word/core';

/** Content packs scheduled for the Phase 1 Core Local Reader MVP (A3 §4.1). */
export const PHASE1_PACK_IDS = ['core_bsb', 'trans_web', 'trans_kjv'] as const;

export type Phase1PackId = (typeof PHASE1_PACK_IDS)[number];

export interface PackMetadataInput {
  packId: string;
  packType: PackType;
  contentVersion: string;
  displayName: string;
  licenseSpdx: string;
  attributionText: string;
  /** ISO-8601 UTC. */
  builtAt: string;
}

export interface PackTranslationInput {
  code: string;
  name: string;
  language?: string;
  licenseType: string;
  versification?: string;
  hasAudio?: boolean;
  hasWordAlignments?: boolean;
  version: string;
}

export interface PackBookInput {
  number: number;
  osis: string;
  name: string;
  testament: 'OT' | 'NT';
  chapterCount: number;
  literaryGenre: string;
}

export interface PackVerseInput {
  book: number;
  chapter: number;
  verse: number;
  plainText: string;
  spans: VerseSpan[];
}

/** Normalized, dependency-free input to the pack builder. */
export interface PackSource {
  metadata: PackMetadataInput;
  translation: PackTranslationInput;
  books: PackBookInput[];
  verses: PackVerseInput[];
}

export interface PackBuildStats {
  bookCount: number;
  verseCount: number;
}

export interface PackBuildOptions {
  /** Base URL the `*.sqlite.gz` files are hosted under (Cloudflare R2 prefix). */
  baseUrl: string;
  minAppVersion: string;
}

export interface PackBuildArtifacts {
  sqlitePath: string;
  gzPath: string;
  entry: ManifestPackEntry;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Build the pack `.sqlite` with the canonical schema and populated FTS5 index (B4 §4.2/§4.6). */
export function buildPackDatabase(source: PackSource, sqlitePath: string): PackBuildStats {
  // Rebuilds must be idempotent: start from a clean file so the DDL never collides with a prior run.
  rmSync(sqlitePath, { force: true });
  const db = new DatabaseSync(sqlitePath);
  try {
    db.exec(TRANSLATION_PACK_DDL);

    // Bulk-load the whole corpus inside one write transaction: 30k+ rows autocommitted
    // individually is orders of magnitude slower than a single transaction.
    db.exec('BEGIN');

    const { metadata, translation } = source;
    db.prepare(
      `INSERT INTO pack_metadata
         (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      metadata.packId,
      metadata.packType,
      PACK_SCHEMA_VERSION,
      metadata.contentVersion,
      metadata.displayName,
      metadata.licenseSpdx,
      metadata.attributionText,
      metadata.builtAt,
    );

    db.prepare(
      `INSERT INTO translations
         (translation_code, name, language, license_type, versification, has_audio, has_word_alignments, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      translation.code,
      translation.name,
      translation.language ?? 'en',
      translation.licenseType,
      translation.versification ?? 'protestant',
      translation.hasAudio ? 1 : 0,
      translation.hasWordAlignments ? 1 : 0,
      translation.version,
    );

    const insertBook = db.prepare(
      `INSERT INTO books (book_number, osis_code, name, testament, chapter_count, literary_genre)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const book of source.books) {
      insertBook.run(book.number, book.osis, book.name, book.testament, book.chapterCount, book.literaryGenre);
    }

    const insertVerse = db.prepare(
      `INSERT INTO verses (translation_code, canonical_verse_id, book_number, chapter, verse, plain_text, content_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const verse of source.verses) {
      const canonicalVerseId = toCanonicalVerseId(verse);
      insertVerse.run(
        translation.code,
        canonicalVerseId,
        verse.book,
        verse.chapter,
        verse.verse,
        verse.plainText,
        JSON.stringify(verse.spans),
      );
    }

    db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild');");
    db.exec('COMMIT');

    db.exec('ANALYZE;');
    db.exec('VACUUM;');

    const integrity = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
    if (integrity.integrity_check !== 'ok') {
      throw new AppError({
        code: 'PACK_INTEGRITY_FAILED',
        domain: 'PACK',
        retryPolicy: 'USER_ACTION',
        userMessage: 'The downloaded Bible pack could not be verified.',
        internalDetail: `PRAGMA integrity_check returned "${integrity.integrity_check}" for ${metadata.packId}.`,
      });
    }

    return { bookCount: source.books.length, verseCount: source.verses.length };
  } finally {
    db.close();
  }
}

/** Build the `.sqlite`, gzip it, and compute hashes for the manifest entry. */
export function buildPackArtifacts(
  source: PackSource,
  outDir: string,
  options: PackBuildOptions,
): PackBuildArtifacts {
  mkdirSync(outDir, { recursive: true });

  const { metadata } = source;
  const sqlitePath = join(outDir, `${metadata.packId}-${metadata.contentVersion}.sqlite`);
  buildPackDatabase(source, sqlitePath);

  const uncompressed = readFileSync(sqlitePath);
  const compressed = gzipSync(uncompressed);
  const gzPath = `${sqlitePath}.gz`;
  writeFileSync(gzPath, compressed);

  return {
    sqlitePath,
    gzPath,
    entry: {
      packId: metadata.packId,
      packType: metadata.packType,
      contentVersion: metadata.contentVersion,
      schemaVersion: PACK_SCHEMA_VERSION,
      minAppVersion: options.minAppVersion,
      downloadUrl: `${options.baseUrl.replace(/\/$/, '')}/${basename(gzPath)}`,
      compressedBytes: compressed.byteLength,
      uncompressedBytes: uncompressed.byteLength,
      sha256Compressed: sha256Hex(compressed),
      sha256Uncompressed: sha256Hex(uncompressed),
      licenseSpdx: metadata.licenseSpdx,
    },
  };
}

/** Write the R2 `manifest.json` contract (B4 §4.6) for the given pack entries. */
export function writeManifest(outDir: string, entries: ManifestPackEntry[], generatedAt: string): string {
  const manifest: PackManifest = { manifestVersion: MANIFEST_VERSION, generatedAt, packs: entries };
  const manifestPath = join(outDir, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

/** Load a normalized `PackSource` from a JSON file produced by a dataset parser. */
export function loadPackSource(jsonPath: string): PackSource {
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as PackSource;
}

/** Synthetic chapter/verse shape used only by `createSamplePackSource` (see below). */
const SAMPLE_CHAPTERS_PER_BOOK = 40;
const SAMPLE_VERSES_PER_CHAPTER = 12;
/** Romans 8 is emitted at its real length so the Rom 8:28 marker (`45008028`) exists in the corpus. */
const SAMPLE_MARKER_BOOK = 45;
const SAMPLE_MARKER_CHAPTER = 8;
const SAMPLE_MARKER_VERSE = 28;
const SAMPLE_MARKER_CHAPTER_VERSES = 39;
const SAMPLE_FILLER =
  'And it came to pass in those days that the congregation assembled at the gate, and the elders spoke to the people concerning the statutes and the ordinances thereof.';
const SAMPLE_MARKER_TEXT =
  'And we know that all things work together for good to those who love God, to those who are called according to His purpose.';

/** Deterministic verse total produced by `createSamplePackSource` (harness assertions). */
export const SAMPLE_VERSE_COUNT =
  BOOKS.length * SAMPLE_CHAPTERS_PER_BOOK * SAMPLE_VERSES_PER_CHAPTER +
  (SAMPLE_MARKER_CHAPTER_VERSES - SAMPLE_VERSES_PER_CHAPTER);

/**
 * Build a deterministic **synthetic** `PackSource` for Gate-1 device-spike timing (Spikes 1 & 2).
 *
 * The verse bodies are generated filler — this is **NOT scripture** and must never ship. Its only
 * purpose is to produce a structurally canonical pack (`core_bsb`, schema v1, populated FTS5) at
 * roughly the real corpus size (~31k verses) so on-device `ATTACH DATABASE` + FTS5 latency is
 * measured against a realistic database instead of a handful of rows. Book metadata (order, OSIS
 * code, testament) is the real Protestant canon from `packages/core`; only the text is synthetic.
 * Exactly one verse (Romans 8:28, canonical id `45008028`) carries a distinctive phrase so the
 * FTS5 probe returns a small, stable result set.
 */
export function createSamplePackSource(): PackSource {
  const books: PackBookInput[] = BOOKS.map((book) => ({
    number: book.number,
    osis: book.osis,
    name: book.name,
    testament: book.testament,
    chapterCount: SAMPLE_CHAPTERS_PER_BOOK,
    literaryGenre: book.testament === 'OT' ? 'POETRY' : 'EPISTLE',
  }));

  const verses: PackVerseInput[] = [];
  for (const book of BOOKS) {
    for (let chapter = 1; chapter <= SAMPLE_CHAPTERS_PER_BOOK; chapter += 1) {
      const isMarkerChapter = book.number === SAMPLE_MARKER_BOOK && chapter === SAMPLE_MARKER_CHAPTER;
      const verseCount = isMarkerChapter ? SAMPLE_MARKER_CHAPTER_VERSES : SAMPLE_VERSES_PER_CHAPTER;
      for (let verse = 1; verse <= verseCount; verse += 1) {
        const isMarker = isMarkerChapter && verse === SAMPLE_MARKER_VERSE;
        const text = isMarker ? SAMPLE_MARKER_TEXT : SAMPLE_FILLER;
        verses.push({
          book: book.number,
          chapter,
          verse,
          plainText: text,
          spans: [{ type: 'text', text }],
        });
      }
    }
  }

  return {
    metadata: {
      packId: 'core_bsb',
      packType: 'TRANSLATION',
      contentVersion: '1.0.0',
      displayName: 'Synthetic Spike Fixture (NOT scripture)',
      licenseSpdx: 'CC0-1.0',
      attributionText: 'Generated filler text, produced by pack-builder --sample for Gate-1 device spike timing only.',
      builtAt: '2026-11-25T00:00:00Z',
    },
    translation: {
      code: 'BSB',
      name: 'Synthetic Spike Fixture',
      licenseType: 'CC0-1.0',
      version: '1.0.0',
    },
    books,
    verses,
  };
}

/** The `MATCH` expression the mobile/desktop spike harness times against a sample pack. */
export const SAMPLE_SEARCH_QUERY = 'work together for good';

const USAGE = `Usage: pack-builder --source <pack-source.json> --out <dir> [--base-url <url>] [--min-app-version <v>]
       pack-builder --sample --out <dir> [--base-url <url>] [--min-app-version <v>]

Builds a modular static content pack (.sqlite + .sqlite.gz + manifest.json, B4 §4.6).

  --source <file>          Normalized PackSource JSON (produced by a dataset parser).
  --sample                 Build the synthetic Gate-1 spike fixture instead of a parsed source
                           (generated filler text — NOT scripture; ~31k verses for latency timing).
  --out <dir>              Output directory for the built pack artifacts.
  --base-url <url>         CDN prefix recorded in the manifest (default: https://packs.breathandword.app/v1).
  --min-app-version <v>    Minimum compatible app version (default: 0.1.0).

Raw-dataset parsing (BSB/STEPBible/TSK -> PackSource) is a separate upstream step.
`;

interface ParsedArgs {
  source?: string;
  sample: boolean;
  out?: string;
  baseUrl: string;
  minAppVersion: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    sample: false,
    baseUrl: 'https://packs.breathandword.app/v1',
    minAppVersion: '0.1.0',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--source' && value !== undefined) parsed.source = value;
    else if (flag === '--sample') parsed.sample = true;
    else if (flag === '--out' && value !== undefined) parsed.out = value;
    else if (flag === '--base-url' && value !== undefined) parsed.baseUrl = value;
    else if (flag === '--min-app-version' && value !== undefined) parsed.minAppVersion = value;
  }
  return parsed;
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);

  let source: PackSource;
  if (args.sample) {
    source = createSamplePackSource();
  } else if (args.source !== undefined) {
    source = loadPackSource(args.source);
  } else {
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.out === undefined) {
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  const artifacts = buildPackArtifacts(source, args.out, {
    baseUrl: args.baseUrl,
    minAppVersion: args.minAppVersion,
  });
  const manifestPath = writeManifest(args.out, [artifacts.entry], source.metadata.builtAt);

  process.stdout.write(
    `pack-builder: built ${artifacts.sqlitePath} (${source.verses.length} verses, ` +
      `${artifacts.entry.uncompressedBytes} bytes)\n`,
  );
  process.stdout.write(`pack-builder: wrote ${artifacts.gzPath} and ${manifestPath}\n`);
}

// Only run the CLI when invoked directly (not when imported by tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
