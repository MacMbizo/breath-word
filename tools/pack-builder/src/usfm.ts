// tools/pack-builder — USFM -> PackSource upstream parser (B4 §4.6, B5 §4.1).
//
// `build-pack.ts` consumes a normalized `PackSource`; this module is the "separate upstream step"
// its header references. It turns a public-domain USFM source (BSB / WEB / KJV / ASV) into that
// normalized shape, preserving red-letter (`\wj`), poetry line breaks (`\q*`) and section headings
// (`\s*`) as structured `VerseSpan`s for the FR-101 reader. No network access and no API keys are
// required (B5 §4.1: these texts are public domain).
//
// The parser is milestone-driven rather than line-driven: real sources (e.g. the BSB's
// `\p \v 1 … \v 2 … \v 3 …` and `\d \v 1 …`) pack several `\v` milestones into one physical line,
// so verses are located by scanning for `\v` anywhere in the text, not per line.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AppError,
  BOOKS,
  toCanonicalVerseId,
  type BookMeta,
  type PackType,
  type VerseSpan,
} from '@breath-and-word/core';

import type { PackBookInput, PackFootnoteInput, PackSource, PackVerseInput } from './build-pack';

/** USFM `\id` book codes in Protestant canonical order (index + 1 = `book_number`). */
const USFM_BOOK_CODES = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH',
  'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS',
  'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK',
  'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT',
  'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
] as const;

const BOOK_BY_USFM_CODE = new Map<string, BookMeta>();
USFM_BOOK_CODES.forEach((code, index) => {
  const book = BOOKS[index];
  if (book !== undefined) BOOK_BY_USFM_CODE.set(code, book);
});

/**
 * USFM codes outside the Protestant 66-book canon: front/back matter and the deuterocanon.
 * Real public-domain sources ship these (the WEB package carries `FRT`, `GLO` and 15 apocryphal
 * books). Phase 1 is Protestant-only (A3 §4.1), so such a book is **skipped**, while a code that is
 * neither canonical nor listed here is still a hard `PACK_PARSE_FAILED` (typos must not pass quietly).
 */
const NON_CANONICAL_BOOK_CODES = new Set([
  // Front matter, back matter and navigation apparatus.
  'FRT', 'BAK', 'GLO', 'INT', 'CNT', 'TDX', 'NDX', 'OTH', 'XXA', 'XXB', 'XXC',
  // Deuterocanonical / apocryphal books.
  'TOB', 'JDT', 'ESG', '1MA', '2MA', '3MA', '4MA', '1ES', '2ES', 'SIR', 'WIS', 'BAR',
  'LJE', 'MAN', 'PS2', 'DAG', 'SUS', 'BEL', 'S3Y', 'DNT', 'ADE',
]);

/** Line markers whose text is a title / heading / superscription (`\s`, `\d`, `\r`, `\ms`, `\qa`…). */
const HEADING_MARKER = /^(?:s[1-4]?|r|d|ms[1-3]?|mr|qa|sp|is[1-3]?|ip|iot|io|imt[1-3]?|mt[1-3]?|mte[1-3]?)$/;
/** Line markers that continue a verse as poetry (`\q1`, `\qr`, …). */
const POETRY_MARKER = /^(?:q[1-4]?|qr|qc|qm[1-3]?)$/;
/** Line markers that continue a verse as running prose (`\p`, `\m`, `\li`, `\pc`…). */
const PARAGRAPH_MARKER =
  /^(?:p|m|pmo|pm|pmi|pmc|pmr|ph[1-3]?|pi[1-4]?|mi|pc|pr|cls|li[1-4]?|litl|liv[1-4]?|ili)$/;
/** Blank-line markers carry no text. */
const BLANK_MARKER = /^(?:b|nb)$/;
/** Inline character markers whose entire contents are dropped (cross-references and figures). */
const INLINE_SKIP = new Set(['x', 'ex', 'fx', 'fe', 'fig']);
/** Inline note markers (`\f`/`\ef`) whose body is preserved as a tappable footnote (FR-101). */
const INLINE_NOTE = new Set(['f', 'ef']);
/** Inline markers carrying a `surface|attribute` body: keep only the surface text. */
const INLINE_PIPE = new Set(['w', 'wh', 'ref', '+w', '+wh']);
/** A physical line that opens directly with a verse milestone. */
const VERSE_LINE = /^\\v\s/;
/** A verse milestone anywhere in a line: `\v 12`, `\v 12a`, `\v 12-14`, `\v 12–14`. */
const VERSE_AT = /^\\v\s+(\d+)([a-c]?)(?:[-\u2013]\d+[a-c]?)?\s*/;

export interface UsfmPackProfile {
  readonly packId: string;
  readonly packType?: PackType;
  readonly contentVersion: string;
  readonly displayName: string;
  readonly licenseSpdx: string;
  readonly attributionText: string;
  readonly translationCode: string;
  readonly translationName: string;
  readonly translationLicenseType?: string;
  /** ISO-8601 UTC; defaults to build time. */
  readonly builtAt?: string;
}

interface Segment {
  readonly style: VerseSpan['type'];
  readonly spans: VerseSpan[];
  /** Poetry nesting depth (`\q1`→1 … `\q4`→4); FR-101 poetic indents. */
  readonly indentLevel?: number;
}

interface VerseAccumulator {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly segments: Segment[];
  readonly footnotes: PackFootnoteInput[];
  /** Footnotes seen so far in this verse; the next `footnote_id` ordinal (1-based). */
  footnoteCount: number;
}

type ContentEvent =
  | { readonly kind: 'verse'; readonly number: number }
  | { readonly kind: 'span'; readonly span: VerseSpan }
  | { readonly kind: 'footnote'; readonly marker: string; readonly text: string };

function parseFailure(internalDetail: string): AppError {
  return new AppError({
    code: 'PACK_PARSE_FAILED',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'This Bible source file could not be read.',
    internalDetail,
  });
}

/**
 * Literary genre for a book, drawn from the vocabulary in B4 §4.2
 * (`LAW · HISTORY · POETRY_WISDOM · PROPHECY · GOSPEL · ACTS · EPISTLE · APOCALYPTIC`).
 */
function literaryGenre(bookNumber: number): string {
  if (bookNumber <= 5) return 'LAW';
  if (bookNumber <= 17) return 'HISTORY';
  if (bookNumber <= 22) return 'POETRY_WISDOM';
  if (bookNumber === 25) return 'POETRY_WISDOM'; // Lamentations is acrostic poetry.
  if (bookNumber <= 39) return 'PROPHECY';
  if (bookNumber <= 43) return 'GOSPEL';
  if (bookNumber === 44) return 'ACTS';
  if (bookNumber <= 65) return 'EPISTLE';
  return 'APOCALYPTIC';
}

/** Poetry nesting depth: `\q`/`\q1`→1 … `\q4`→4; `\qr`/`\qc`/`\qm*` (Selah, centred, embedded) → 1. */
function poetryIndentLevel(name: string): number {
  const match = /^q([1-4])$/.exec(name);
  return match === null ? 1 : Number.parseInt(match[1] ?? '1', 10);
}

/**
 * The visible caller marker for a note. USFM's `+` means "let the renderer number it", so it is
 * mapped to a per-verse letter (a, b, c…) to give the FR-101 marker something tappable to show.
 */
function visibleFootnoteMarker(caller: string, ordinal: number): string {
  return caller === '+' ? String.fromCharCode(96 + (((ordinal - 1) % 26) + 1)) : caller;
}

/**
 * Split a `\f … \f*` body into its caller marker (often `+`) and note text.
 *
 * A body reads like `+ \fr 1:3 \ft In Hebrew… \fk elohim\fk*`, so the leading non-marker token is
 * the caller, `\fr` is the source reference (dropped — the verse already carries the reference),
 * and every other note marker (`\ft`, `\fk`, `\fq`, `\fqa`, `\fl`, `\fp`) only wraps note text.
 */
function parseFootnoteBody(rawBody: string): { marker: string; text: string } {
  const body = rawBody.trim();
  const caller = /^([^\s\\])/.exec(body);
  const marker = caller?.[1] ?? '+';
  const withoutCaller = caller === null ? body : body.slice(1);
  const text = withoutCaller
    .replace(/\\fr\s[^\\]*/g, ' ')
    .replace(/\\[+a-z0-9]+\*?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { marker, text };
}

/**
 * Split one line body into an ordered stream of `\v` milestones and text spans.
 *
 * Word-level attributes (`\w God|strong="H430"\w*`) keep only the surface word; cross-references
 * (`\x … \x*`) are dropped whole while footnotes (`\f … \f*`) become `footnote` events (FR-101);
 * red-letter runs (`\wj … \wj*`) are tracked across span *and* verse boundaries via `redLetter`;
 * every other inline marker (`\add`, `\nd`, `\qt`, `\em`, `\k`, `\qs`, …) is stripped but its
 * contents are kept.
 */
function tokenizeContent(raw: string, redLetter: { value: boolean }): ContentEvent[] {
  const events: ContentEvent[] = [];
  let buffer = '';
  let index = 0;

  const flush = (): void => {
    if (buffer === '') return;
    events.push({ kind: 'span', span: { type: redLetter.value ? 'red_letter' : 'text', text: buffer } });
    buffer = '';
  };

  while (index < raw.length) {
    const char = raw[index];
    if (char !== '\\') {
      buffer += char;
      index += 1;
      continue;
    }

    const rest = raw.slice(index);

    const verse = VERSE_AT.exec(rest);
    if (verse !== null) {
      flush();
      events.push({ kind: 'verse', number: Number.parseInt(verse[1] ?? '', 10) });
      index += verse[0].length;
      continue;
    }

    const marker = /^\\(\+?)([a-z0-9]+)(\*?)/.exec(rest);
    if (marker === null) {
      buffer += char;
      index += 1;
      continue;
    }

    const full = `${marker[1] ?? ''}${marker[2] ?? ''}`;
    const name = marker[2] ?? '';
    const closing = marker[3] === '*';
    const consumed = marker[0].length;

    if (full === 'wj') {
      flush();
      redLetter.value = !closing;
      index += consumed;
      continue;
    }

    if (!closing && INLINE_PIPE.has(full)) {
      const close = `\\${full}*`;
      const end = raw.indexOf(close, index + consumed);
      const body = end === -1 ? raw.slice(index + consumed) : raw.slice(index + consumed, end);
      const pipe = body.indexOf('|');
      buffer += (pipe === -1 ? body : body.slice(0, pipe)).trim();
      index = end === -1 ? raw.length : end + close.length;
      continue;
    }

    if (!closing && INLINE_NOTE.has(full)) {
      flush();
      const close = `\\${full}*`;
      const end = raw.indexOf(close, index + consumed);
      const body = end === -1 ? raw.slice(index + consumed) : raw.slice(index + consumed, end);
      const note = parseFootnoteBody(body);
      if (note.text !== '') events.push({ kind: 'footnote', marker: note.marker, text: note.text });
      index = end === -1 ? raw.length : end + close.length;
      continue;
    }

    if (INLINE_SKIP.has(name)) {
      flush();
      const close = `\\${full}*`;
      const end = raw.indexOf(close, index + consumed);
      index = end === -1 ? raw.length : end + close.length;
      continue;
    }

    index += consumed;
  }

  flush();
  return events;
}

/**
 * Collapse the accumulated segments into canonical `spans` + searchable `plain_text`.
 *
 * Heading text is kept in `content_json` but excluded from `plain_text` so section titles never
 * leak into the FTS5 index; footnote marker spans are excluded too (the note body lives in the
 * `footnotes` table, not the searchable verse text). Whitespace is normalised and segments are
 * joined with a single space.
 */
function finalizeSegments(segments: readonly Segment[]): { plainText: string; spans: VerseSpan[] } {
  const spans: VerseSpan[] = [];
  const plainPieces: string[] = [];

  for (const segment of segments) {
    const runs: { type: VerseSpan['type']; text: string; footnoteId?: string }[] = [];
    for (const span of segment.spans) {
      const text = span.text.replace(/\s+/g, ' ');
      if (text === '') continue;
      const previous = runs[runs.length - 1];
      // Footnote markers are distinct callers (each links to its own note), so never merge them.
      if (previous !== undefined && previous.type === span.type && span.type !== 'footnote') {
        previous.text = `${previous.text}${text}`.replace(/\s+/g, ' ');
      } else {
        runs.push({ type: span.type, text, footnoteId: span.footnoteId });
      }
    }
    if (runs.length === 0) continue;

    const first = runs[0];
    if (first !== undefined) first.text = first.text.replace(/^ /, '');
    const last = runs[runs.length - 1];
    if (last !== undefined) last.text = last.text.replace(/ $/, '');

    const isHeading = segment.style === 'heading';
    if (!isHeading && plainPieces.length > 0) {
      const head = runs[0];
      if (head !== undefined) head.text = ` ${head.text}`;
    }

    for (const run of runs) {
      if (run.text === '') continue;
      const type =
        run.type === 'footnote' ? 'footnote' : segment.style === 'text' ? run.type : segment.style;
      const span: VerseSpan = { type, text: run.text };
      if (run.footnoteId !== undefined) span.footnoteId = run.footnoteId;
      if (type === 'poetry' && segment.indentLevel !== undefined) span.indentLevel = segment.indentLevel;
      spans.push(span);
      if (!isHeading && run.type !== 'footnote') plainPieces.push(run.text);
    }
  }

  // Collapse run-boundary artefacts: a note removed between two words can leave a lone-space run
  // next to a space-led run, so normalise the joined searchable text to single spacing.
  return { plainText: plainPieces.join('').replace(/\s+/g, ' ').trim(), spans };
}

/**
 * Parse a USFM source (one or more books) into the normalized `PackSource` the pack builder reads.
 *
 * @throws AppError `PACK_PARSE_FAILED` on an unknown `\id` book code, a verse before any `\id`,
 *   or a source that yields no books/verses.
 */
export function parseUsfmToPackSource(usfm: string, profile: UsfmPackProfile): PackSource {
  const books = new Map<number, PackBookInput>();
  const verses: PackVerseInput[] = [];
  const pendingChrome: Segment[] = [];
  const redLetter = { value: false };

  let bookMeta: BookMeta | undefined;
  let chapter = 0;
  let chapterCount = 0;
  let style: VerseSpan['type'] = 'text';
  let accumulator: VerseAccumulator | null = null;
  /** True while inside a non-canonical book (front matter or deuterocanon) that Phase 1 skips. */
  let skipping = false;

  const flushVerse = (): void => {
    if (accumulator === null) return;
    const current = accumulator;
    accumulator = null;
    const { plainText, spans } = finalizeSegments(current.segments);
    if (spans.length === 0) return;
    verses.push({
      book: current.book,
      chapter: current.chapter,
      verse: current.verse,
      plainText,
      spans,
      ...(current.footnotes.length > 0 ? { footnotes: current.footnotes } : {}),
    });
  };

  const startVerse = (number: number, line: string): void => {
    if (bookMeta === undefined) {
      throw parseFailure(`Verse encountered before any \\id book code in line "${line}".`);
    }
    if (chapter === 0) {
      throw parseFailure(`Verse encountered before any \\c chapter marker in line "${line}".`);
    }
    flushVerse();
    accumulator = {
      book: bookMeta.number,
      chapter,
      verse: number,
      segments: [],
      footnotes: [],
      footnoteCount: 0,
    };
    if (pendingChrome.length > 0) {
      accumulator.segments.push(...pendingChrome);
      pendingChrome.length = 0;
    }
  };

  const consume = (
    content: string,
    kind: VerseSpan['type'],
    line: string,
    indentLevel?: number,
  ): void => {
    // A heading opens a new section, so it belongs to the *next* verse, not the one in flight.
    if (kind === 'heading') flushVerse();

    let spanStyle: VerseSpan['type'] = kind === 'heading' ? 'heading' : kind;
    let bucket: VerseSpan[] = [];

    const flushBucket = (): void => {
      if (bucket.length === 0) return;
      const spans = bucket;
      bucket = [];
      if (!spans.some((span) => span.text.trim() !== '')) return;
      const target: Segment[] = spanStyle === 'heading' ? pendingChrome : accumulator?.segments ?? pendingChrome;
      target.push({ style: spanStyle, spans, ...(indentLevel !== undefined ? { indentLevel } : {}) });
    };

    for (const event of tokenizeContent(content, redLetter)) {
      if (event.kind === 'verse') {
        flushBucket();
        startVerse(event.number, line);
        spanStyle = kind === 'heading' ? 'text' : kind;
        continue;
      }
      if (event.kind === 'footnote') {
        // A note attaches to the verse in flight; a caller seen before any `\v` has no verse to hang on.
        const current = accumulator;
        if (current === null) continue;
        current.footnoteCount += 1;
        const marker = visibleFootnoteMarker(event.marker, current.footnoteCount);
        const footnoteId = `${toCanonicalVerseId(current)}:${current.footnoteCount}`;
        current.footnotes.push({ marker, category: 'NOTE', bodyText: event.text });
        bucket.push({ type: 'footnote', text: marker, footnoteId });
        continue;
      }
      bucket.push(event.span);
    }
    flushBucket();
  };

  for (const rawLine of usfm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    // Inside a skipped non-canonical book, only the next `\id` matters (note `\id\s` never matches `\ide`).
    if (skipping && !/^\\id\s/.test(line)) continue;

    if (VERSE_LINE.test(line)) {
      consume(line, style, line);
      continue;
    }

    const lineMatch = /^\\([+a-z0-9]+)(\*?)(?:\s(.*))?$/.exec(line);
    if (lineMatch === null) {
      // A bare continuation line with no marker: treat it as prose in the current style.
      consume(line, style, line);
      continue;
    }

    const name = lineMatch[1] ?? '';
    const rest = lineMatch[3] ?? '';

    if (name === 'id') {
      flushVerse();
      const code = (rest.trim().split(/\s+/)[0] ?? '').toUpperCase();
      const resolved = BOOK_BY_USFM_CODE.get(code);
      if (resolved === undefined) {
        if (NON_CANONICAL_BOOK_CODES.has(code)) {
          // Front matter and deuterocanonical books are outside Phase-1 scope (A3 §4.1): skip them.
          bookMeta = undefined;
          skipping = true;
          chapter = 0;
          chapterCount = 0;
          pendingChrome.length = 0;
          continue;
        }
        throw parseFailure(`Unknown USFM \\id book code "${code}" in line "${line}".`);
      }
      skipping = false;
      bookMeta = resolved;
      chapter = 0;
      chapterCount = 0;
      pendingChrome.length = 0;
      books.set(resolved.number, {
        number: resolved.number,
        osis: resolved.osis,
        name: resolved.name,
        testament: resolved.testament,
        chapterCount: 0,
        literaryGenre: literaryGenre(resolved.number),
      });
      continue;
    }

    if (name === 'c') {
      flushVerse();
      const parsed = Number.parseInt(rest.trim(), 10);
      chapter = Number.isFinite(parsed) && parsed > 0 ? parsed : chapter + 1;
      chapterCount = Math.max(chapterCount, chapter);
      if (bookMeta !== undefined) {
        books.set(bookMeta.number, {
          number: bookMeta.number,
          osis: bookMeta.osis,
          name: bookMeta.name,
          testament: bookMeta.testament,
          chapterCount,
          literaryGenre: literaryGenre(bookMeta.number),
        });
      }
      style = 'text';
      pendingChrome.length = 0;
      continue;
    }

    if (BLANK_MARKER.test(name)) continue;

    if (HEADING_MARKER.test(name)) {
      consume(rest, 'heading', line);
      continue;
    }

    if (POETRY_MARKER.test(name)) {
      style = 'poetry';
      consume(rest, 'poetry', line, poetryIndentLevel(name));
      continue;
    }

    if (PARAGRAPH_MARKER.test(name)) {
      style = 'text';
      consume(rest, 'text', line);
      continue;
    }

    // Any other line marker (\ide, \h, \toc1, \usfm, \cl, \cp, …) is front matter or publishing metadata.
  }

  flushVerse();

  const bookList = [...books.values()].sort((a, b) => a.number - b.number);
  if (bookList.length === 0 || verses.length === 0) {
    throw parseFailure('USFM source produced no books or verses.');
  }

  return {
    metadata: {
      packId: profile.packId,
      packType: profile.packType ?? 'TRANSLATION',
      contentVersion: profile.contentVersion,
      displayName: profile.displayName,
      licenseSpdx: profile.licenseSpdx,
      attributionText: profile.attributionText,
      builtAt: profile.builtAt ?? new Date().toISOString(),
    },
    translation: {
      code: profile.translationCode,
      name: profile.translationName,
      licenseType: profile.translationLicenseType ?? profile.licenseSpdx,
      version: profile.contentVersion,
    },
    books: bookList,
    verses,
  };
}

const USAGE = `Usage: parse-usfm --in <book.usfm|dir> --out <pack-source.json> --pack-id <id> --code <CODE> [options]

Turns a public-domain USFM source (BSB / WEB / KJV / ASV) into the normalized PackSource JSON the
pack builder consumes (B4 §4.6; B5 §4.1). Preserves red-letter (\\wj), poetry (\\q*) and section
headings (\\s*) as structured spans for the FR-101 reader. No API keys are required.

  --in <path>              A single USFM file, or a directory of per-book .usfm/.sfm files.
  --out <file>             Destination PackSource JSON.
  --pack-id <id>           Target pack id (e.g. core_bsb, trans_web, trans_kjv).
  --code <CODE>            Translation code recorded in the pack (e.g. BSB).
  --name <text>            Pack display name (default: the translation code).
  --translation-name <t>   Translation display name (default: --name).
  --license <spdx>         SPDX license id for pack_metadata (default: CC0-1.0).
  --attribution <text>     Attribution string (default: "<name> (<license>)").
  --version <v>            Content version (default: 1.0.0).

The built pack is produced by the pack builder:
  pack-builder --source <pack-source.json> --out <dir>
`;

interface ParsedArgs {
  input?: string;
  out?: string;
  packId?: string;
  code?: string;
  name?: string;
  translationName?: string;
  license?: string;
  attribution?: string;
  version?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--in' && value !== undefined) parsed.input = value;
    else if (flag === '--out' && value !== undefined) parsed.out = value;
    else if (flag === '--pack-id' && value !== undefined) parsed.packId = value;
    else if (flag === '--code' && value !== undefined) parsed.code = value;
    else if (flag === '--name' && value !== undefined) parsed.name = value;
    else if (flag === '--translation-name' && value !== undefined) parsed.translationName = value;
    else if (flag === '--license' && value !== undefined) parsed.license = value;
    else if (flag === '--attribution' && value !== undefined) parsed.attribution = value;
    else if (flag === '--version' && value !== undefined) parsed.version = value;
  }
  return parsed;
}

/** Read a USFM file, or concatenate the per-book `.usfm`/`.sfm` files of a directory. */
function readUsfmInput(inputPath: string): string {
  if (!statSync(inputPath).isDirectory()) return readFileSync(inputPath, 'utf8');
  const files = readdirSync(inputPath)
    .filter((name) => ['.usfm', '.sfm'].includes(extname(name).toLowerCase()))
    .sort();
  if (files.length === 0) {
    throw parseFailure(`No .usfm/.sfm files found in directory "${inputPath}".`);
  }
  return files.map((name) => readFileSync(join(inputPath, name), 'utf8')).join('\n');
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);
  if (args.input === undefined || args.out === undefined || args.packId === undefined || args.code === undefined) {
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  const license = args.license ?? 'CC0-1.0';
  const name = args.name ?? args.code;
  const source = parseUsfmToPackSource(readUsfmInput(args.input), {
    packId: args.packId,
    contentVersion: args.version ?? '1.0.0',
    displayName: name,
    licenseSpdx: license,
    attributionText: args.attribution ?? `${name} (${license}).`,
    translationCode: args.code,
    translationName: args.translationName ?? name,
  });

  writeFileSync(args.out, `${JSON.stringify(source, null, 2)}\n`);
  process.stdout.write(
    `parse-usfm: ${source.books.length} book(s), ${source.verses.length} verses -> ${args.out}\n`,
  );
}

// Only run the CLI when invoked directly (not when imported by tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
