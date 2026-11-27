// tools/pack-builder — Content Pack ETL (B3 §4.1, B4 §4.2/§4.6).
//
// Pipeline: normalized `PackSource` -> SQLite (+ FTS5 rebuild, ANALYZE, VACUUM)
//            -> gzip -> SHA-256 -> `manifest.json`.
//
// Raw open-dataset parsers (BSB XML, STEPBible TAHOT/TAGNT, TSK) normalize INTO a
// `PackSource`; Protestant BBCCCVVV mapping happens during that parse step, so this
// builder only enforces the canonical id derived from book/chapter/verse.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DatabaseSync } from './node-sqlite';
import {
  EXEGESIS_PACK_ID,
  buildExegesisPackArtifacts,
  createSampleExegesisPackSource,
  isExegesisPackSource,
  type ExegesisPackSource,
} from './exegesis-pack';
import {
  STUDY_REFS_PACK_ID,
  buildStudyRefsPackArtifacts,
  createSampleStudyRefsPackSource,
  isStudyRefsPackSource,
  type StudyRefsPackSource,
} from './study-refs-pack';
import {
  assertPackMetadata,
  closeAndDiscard,
  closeQuietly,
  insertPackMetadata,
  packageArtifacts,
  verifyPackDatabase,
  type PackBuildArtifacts,
  type PackBuildOptions,
  type PackMetadataInput,
} from './pack-common';

import {
  BOOKS,
  MANIFEST_VERSION,
  TRANSLATION_PACK_DDL,
  toCanonicalVerseId,
  type ManifestPackEntry,
  type PackManifest,
  type VerseSpan,
} from '@breath-and-word/core';

export type { PackBuildArtifacts, PackBuildOptions, PackMetadataInput } from './pack-common';

/** Content packs scheduled for the Phase 1 Core Local Reader MVP (A3 §4.1). */
export const PHASE1_PACK_IDS = ['core_bsb', 'trans_web', 'trans_kjv'] as const;

export type Phase1PackId = (typeof PHASE1_PACK_IDS)[number];

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
  /** Inline footnotes (`\f … \f*`) attached to this verse (FR-101 clickable markers). */
  footnotes?: PackFootnoteInput[];
}

/** One inline footnote; `footnote_id` is derived at build time as `<canonicalVerseId>:<ordinal>`. */
export interface PackFootnoteInput {
  /** Visible caller marker shown in the text (a source marker like `a`, or an auto letter). */
  marker: string;
  /** USFM note category; Phase 1 emits `NOTE`. */
  category: string;
  /** The note body text, with USFM note markers stripped. */
  bodyText: string;
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

/** Build the pack `.sqlite` with the canonical schema and populated FTS5 index (B4 §4.2/§4.6). */
export function buildPackDatabase(source: PackSource, sqlitePath: string): PackBuildStats {
  // B5 §4.3: refuse to build a pack with a blank licence or attribution before touching disk.
  assertPackMetadata(source.metadata, 'TRANSLATION');

  // Rebuilds must be idempotent: start from a clean file so the DDL never collides with a prior run.
  rmSync(sqlitePath, { force: true });
  const db = new DatabaseSync(sqlitePath);
  try {
    db.exec(TRANSLATION_PACK_DDL);

    // Bulk-load the whole corpus inside one write transaction: 30k+ rows autocommitted
    // individually is orders of magnitude slower than a single transaction.
    db.exec('BEGIN');

    const { metadata, translation } = source;
    insertPackMetadata(db, metadata);

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
    const insertFootnote = db.prepare(
      `INSERT INTO footnotes (footnote_id, translation_code, canonical_verse_id, marker, category, body_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
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
      const footnotes = verse.footnotes ?? [];
      footnotes.forEach((note, index) => {
        insertFootnote.run(
          `${canonicalVerseId}:${index + 1}`,
          translation.code,
          canonicalVerseId,
          note.marker,
          note.category,
          note.bodyText,
        );
      });
    }

    db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild');");
    db.exec('COMMIT');

    verifyPackDatabase(db, metadata);

    return { bookCount: source.books.length, verseCount: source.verses.length };
  } catch (error) {
    // Never leave a half-built or unverified pack where a later step could publish it.
    closeAndDiscard(db, sqlitePath);
    throw error;
  } finally {
    closeQuietly(db);
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
  return packageArtifacts(sqlitePath, metadata, options);
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

export type AnyPackSource = PackSource | ExegesisPackSource | StudyRefsPackSource;

/** Load any normalized source JSON; the builder is chosen by `metadata.packType`. */
export function loadAnyPackSource(jsonPath: string): AnyPackSource {
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as AnyPackSource;
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
/**
 * Psalm 23 and Matthew 5 carry the fixture's FR-101 styling (poetry heading + red-letter + footnote)
 * so the on-device reader can exercise heading / poetry-indent / red-letter / footnote rendering
 * without shipping real scripture. Every other verse is a single plain `text` span.
 */
const SAMPLE_PSALM_BOOK = 19;
const SAMPLE_PSALM_CHAPTER = 23;
const SAMPLE_SERMON_BOOK = 40;
const SAMPLE_SERMON_CHAPTER = 5;
/** Matthew 5 verse that carries the fixture's footnote marker. */
const SAMPLE_FOOTNOTE_VERSE = 3;

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
export interface SamplePackProfile {
  /** Pack id to emit (default `core_bsb`). */
  packId?: string;
  /** Translation code recorded in the pack (default `BSB`). */
  translationCode?: string;
  /** Translation display name (default `Synthetic Spike Fixture`). */
  translationName?: string;
  /** Pack display name (default `Synthetic Spike Fixture (NOT scripture)`). */
  displayName?: string;
}

/** FR-101 content for one fixture verse (heading / poetry / red-letter / footnote, else plain text). */
function sampleVerseContent(
  badge: string,
  book: number,
  chapter: number,
  verse: number,
  plainText: string,
): Pick<PackVerseInput, 'plainText' | 'spans' | 'footnotes'> {
  const text = `${badge}${plainText}`;

  if (book === SAMPLE_PSALM_BOOK && chapter === SAMPLE_PSALM_CHAPTER) {
    const spans: VerseSpan[] = [];
    // A superscription is a heading; headings stay out of `plain_text` so they never reach FTS5.
    if (verse === 1) spans.push({ type: 'heading', text: 'A Psalm of David.' });
    spans.push({ type: 'poetry', text, indentLevel: verse === 1 ? 1 : 2 });
    return { plainText: text, spans };
  }

  if (book === SAMPLE_SERMON_BOOK && chapter === SAMPLE_SERMON_CHAPTER) {
    if (verse === SAMPLE_FOOTNOTE_VERSE) {
      const words = text.split(' ');
      // The footnote marker is a `footnote` span only — deliberately absent from `plain_text`.
      return {
        plainText: text,
        spans: [
          { type: 'red_letter', text: `${words.slice(0, 4).join(' ')} ` },
          {
            type: 'footnote',
            text: 'a',
            footnoteId: `${toCanonicalVerseId({ book, chapter, verse })}:1`,
          },
          { type: 'red_letter', text: words.slice(4).join(' ') },
        ],
        footnotes: [
          {
            marker: 'a',
            category: 'NOTE',
            bodyText: 'Synthetic fixture footnote — verifies the FR-101 footnote sheet (NOT scripture).',
          },
        ],
      };
    }
    return { plainText: text, spans: [{ type: 'red_letter', text }] };
  }

  return { plainText: text, spans: [{ type: 'text', text }] };
}

export function createSamplePackSource(profile: SamplePackProfile = {}): PackSource {
  const packId = profile.packId ?? 'core_bsb';
  const translationCode = profile.translationCode ?? 'BSB';
  // A second fixture translation must be *visually* distinguishable in the FR-102 compare view while
  // still carrying the FTS probe phrase, so its bodies get a `[CODE]` prefix. The default BSB
  // fixture is byte-identical to before this parameterisation.
  const badge = translationCode === 'BSB' ? '' : `[${translationCode}] `;

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
        const content = sampleVerseContent(
          badge,
          book.number,
          chapter,
          verse,
          isMarker ? SAMPLE_MARKER_TEXT : SAMPLE_FILLER,
        );
        verses.push({
          book: book.number,
          chapter,
          verse,
          plainText: content.plainText,
          spans: content.spans,
          ...(content.footnotes !== undefined ? { footnotes: content.footnotes } : {}),
        });
      }
    }
  }

  return {
    metadata: {
      packId,
      packType: 'TRANSLATION',
      contentVersion: '1.0.0',
      displayName: profile.displayName ?? 'Synthetic Spike Fixture (NOT scripture)',
      licenseSpdx: 'CC0-1.0',
      attributionText: 'Generated filler text, produced by pack-builder --sample for Gate-1 device spike timing only.',
      builtAt: '2026-11-25T00:00:00Z',
    },
    translation: {
      code: translationCode,
      name: profile.translationName ?? 'Synthetic Spike Fixture',
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
       pack-builder --sample --out <dir> [--pack-id <id>] [--code <CODE>] [--name <text>]
       pack-builder --sample-exegesis --out <dir>
       pack-builder --sample-study-refs --out <dir>

Builds a modular static content pack (.sqlite + .sqlite.gz + manifest.json, B4 §4.6).

  --source <file>          Normalized source JSON (produced by a dataset parser). A source whose
                           metadata.packType is EXEGESIS or STUDY_REFS is built by that pack's builder.
  --sample-exegesis        Build the tiny ${EXEGESIS_PACK_ID} sample fixture (Gen 1:1, 1 John 4:8; NOT a
                           release pack) for FR-301/302 device testing.
  --sample-study-refs      Build the tiny ${STUDY_REFS_PACK_ID} sample fixture (Romans 8 cross-refs, Ephesus
                           dossier, one reading plan; NOT a release pack) for FR-303/FR-104 testing.
  --sample                 Build the synthetic Gate-1 spike fixture instead of a parsed source
                           (generated filler text — NOT scripture; ~31k verses for latency timing).
  --pack-id <id>           Sample fixture pack id (default: core_bsb).
  --code <CODE>            Sample fixture translation code (default: BSB).
  --name <text>            Sample fixture pack display name.
  --out <dir>              Output directory for the built pack artifacts.
  --base-url <url>         CDN prefix recorded in the manifest (default: https://packs.breathandword.app/v1).
  --min-app-version <v>    Minimum compatible app version (default: 0.1.0).

Packs built into the same --out directory accumulate in ONE manifest.json, so the local Gate-1
server can offer more than one translation (FR-102 compare / FR-103 search).

Raw-dataset parsing (BSB/WEB/KJV/ASV USFM -> PackSource) is the upstream "parse:usfm" step:
  parse-usfm --in <book.usfm|dir> --out <pack-source.json> --pack-id <id> --code <CODE>
`;

interface ParsedArgs {
  source?: string;
  sample: boolean;
  sampleExegesis: boolean;
  sampleStudyRefs: boolean;
  out?: string;
  baseUrl: string;
  minAppVersion: string;
  /** `--sample` fixture overrides, so a second translation can be built for FR-102/FR-103. */
  packId?: string;
  code?: string;
  name?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    sample: false,
    sampleExegesis: false,
    sampleStudyRefs: false,
    baseUrl: 'https://packs.breathandword.app/v1',
    minAppVersion: '0.1.0',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--source' && value !== undefined) parsed.source = value;
    else if (flag === '--sample') parsed.sample = true;
    else if (flag === '--sample-exegesis') parsed.sampleExegesis = true;
    else if (flag === '--sample-study-refs') parsed.sampleStudyRefs = true;
    else if (flag === '--out' && value !== undefined) parsed.out = value;
    else if (flag === '--base-url' && value !== undefined) parsed.baseUrl = value;
    else if (flag === '--min-app-version' && value !== undefined) parsed.minAppVersion = value;
    else if (flag === '--pack-id' && value !== undefined) parsed.packId = value;
    else if (flag === '--code' && value !== undefined) parsed.code = value;
    else if (flag === '--name' && value !== undefined) parsed.name = value;
  }
  return parsed;
}

/** Existing manifest entries in `outDir` (minus this pack), so repeated builds accumulate. */
function mergeManifestEntries(outDir: string, entry: ManifestPackEntry): ManifestPackEntry[] {
  const manifestPath = join(outDir, 'manifest.json');
  let existing: ManifestPackEntry[] = [];
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<PackManifest>;
      if (Array.isArray(parsed.packs)) existing = parsed.packs;
    } catch {
      existing = [];
    }
  }
  return [...existing.filter((candidate) => candidate.packId !== entry.packId), entry].sort((a, b) =>
    a.packId.localeCompare(b.packId),
  );
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);

  let source: AnyPackSource;
  if (args.sampleExegesis) {
    source = createSampleExegesisPackSource();
  } else if (args.sampleStudyRefs) {
    source = createSampleStudyRefsPackSource();
  } else if (args.sample) {
    source = createSamplePackSource({
      ...(args.packId !== undefined ? { packId: args.packId } : {}),
      ...(args.code !== undefined ? { translationCode: args.code } : {}),
      ...(args.name !== undefined ? { displayName: args.name } : {}),
    });
  } else if (args.source !== undefined) {
    source = loadAnyPackSource(args.source);
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

  const options = { baseUrl: args.baseUrl, minAppVersion: args.minAppVersion };
  let artifacts: PackBuildArtifacts;
  let summary: string;
  if (isExegesisPackSource(source)) {
    const built = buildExegesisPackArtifacts(source, args.out, options);
    artifacts = built;
    const { stats } = built;
    summary =
      `${stats.tokenCount} tokens, ${stats.lexiconEntryCount} lexicon entries, ` +
      `${stats.versificationMapCount} versification maps`;
    if (stats.unresolvedStrongsIds.length > 0) {
      process.stdout.write(
        `pack-builder: note — ${stats.unresolvedStrongsIds.length} Strong's id(s) used by tokens have no lexicon entry ` +
          `(e.g. ${stats.unresolvedStrongsIds.slice(0, 5).join(', ')})
`,
      );
    }
  } else if (isStudyRefsPackSource(source)) {
    const built = buildStudyRefsPackArtifacts(source, args.out, options);
    artifacts = built;
    const { stats } = built;
    summary =
      `${stats.crossReferenceCount} cross-references, ${stats.entityCount} factbook entities, ` +
      `${stats.readingPlanCount} reading plans`;
  } else {
    artifacts = buildPackArtifacts(source, args.out, options);
    summary = `${source.verses.length} verses`;
  }

  // Merge into any manifest already in the output directory: the local Gate-1 server hosts several
  // fixture packs at once (FR-102 compare / FR-103 search need more than one translation installed),
  // so a build must not clobber the entries written by the previous one.
  const entries = mergeManifestEntries(args.out, artifacts.entry);
  const manifestPath = writeManifest(args.out, entries, source.metadata.builtAt);

  process.stdout.write(
    `pack-builder: built ${artifacts.sqlitePath} (${summary}, ${artifacts.entry.uncompressedBytes} bytes)
`,
  );
  process.stdout.write(
    `pack-builder: wrote ${artifacts.gzPath} and ${manifestPath} (${entries.length} pack(s))
`,
  );
}

// Only run the CLI when invoked directly (not when imported by tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
