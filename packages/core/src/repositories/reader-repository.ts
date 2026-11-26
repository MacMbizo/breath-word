// B3 §4.3 / AGENTS.md rule 1 — the ONLY place content-pack SQL is allowed to live.
//
// Phase 1 Core Local Reader MVP (A3 §4.1):
//   FR-101 Structured Verse Renderer  -> getChapter (spans + footnotes)
//   FR-102 Multi-Translation Reader   -> compareChapters (pack per translation, aligned in the UI)
//   FR-103 Offline FTS5 Search        -> search (verses_fts + snippet)

import type { ContentDbAdapter } from '../adapters';
import { chapterVerseRange } from '../domain/bbcccvvv';
import type { Verse, VerseSpan } from '../domain/types';
import { AppError } from '../errors/AppError';

/** Attached schema names are used as SQL identifiers, so they must be boring. */
const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;
const SPAN_TYPES: ReadonlySet<string> = new Set([
  'text',
  'heading',
  'poetry',
  'red_letter',
  'footnote',
  'paragraph_break',
]);
const DEFAULT_SEARCH_LIMIT = 50;
const VERSES_PER_BOOK = 1_000_000;

/**
 * Inclusive BBCCCVVV bounds per Protestant testament (FR-103 "testament filters"). The OT is
 * books 1–39 and the NT is books 40–66, so the bounds are whole-book multiples of `1_000_000`.
 */
const TESTAMENT_RANGES: Record<'OT' | 'NT', { readonly start: number; readonly end: number }> = {
  OT: { start: 1 * VERSES_PER_BOOK, end: 40 * VERSES_PER_BOOK - 1 },
  NT: { start: 40 * VERSES_PER_BOOK, end: 67 * VERSES_PER_BOOK - 1 },
};

interface VerseRow {
  translation_code: string;
  canonical_verse_id: number;
  book_number: number;
  chapter: number;
  verse: number;
  plain_text: string;
  content_json: string;
}

interface FootnoteRow {
  footnote_id: string;
  canonical_verse_id: number;
  marker: string;
  category: string;
  body_text: string;
}

interface SearchRow extends VerseRow {
  snippet: string;
  score: number;
}

interface BookRow {
  book_number: number;
  name: string;
  testament: string;
  chapter_count: number;
}

/** One navigable book of a translation, with its chapter count (FR-101 canon-wide navigation). */
export interface BookSummary {
  readonly bookNumber: number;
  readonly name: string;
  readonly testament: 'OT' | 'NT';
  readonly chapterCount: number;
}

/** A pack + translation pair, used to line up parallel columns (FR-102). */
export interface TranslationRef {
  readonly packId: string;
  readonly translationCode: string;
}

export interface Footnote {
  readonly footnoteId: string;
  readonly canonicalVerseId: number;
  readonly marker: string;
  readonly category: string;
  readonly bodyText: string;
}

export interface Chapter {
  readonly packId: string;
  readonly translationCode: string;
  readonly bookNumber: number;
  readonly chapter: number;
  readonly verses: Verse[];
  readonly footnotes: Footnote[];
}

export interface SearchQuery {
  readonly packId: string;
  /**
   * A raw FTS5 `MATCH` expression — supports phrases (`"living water"`), boolean
   * operators (`shepherd AND valley`), `NEAR(...)`, and prefixes (`stead*`). The search
   * UI is responsible for producing a valid expression from user input.
   */
  readonly text: string;
  readonly translationCode?: string;
  readonly bookNumber?: number;
  /** Restrict hits to one testament (`OT` books 1–39, `NT` books 40–66) — FR-103. */
  readonly testament?: 'OT' | 'NT';
  readonly limit?: number;
}

export interface SearchHit {
  readonly translationCode: string;
  readonly canonicalVerseId: number;
  readonly bookNumber: number;
  readonly chapter: number;
  readonly verse: number;
  readonly plainText: string;
  /** FTS5 snippet with the matched terms wrapped in `[[…]]` (FR-103 highlighting). */
  readonly snippet: string;
  /** FTS5 `bm25()` relevance; lower is a better match. */
  readonly score: number;
}

/**
 * Read-only access to installed content packs through `ContentDbAdapter`.
 * One instance is reused for the whole session; each call targets a specific attached pack.
 */
export class ReaderRepository {
  constructor(private readonly contentDb: ContentDbAdapter) {}

  /** FR-101 — every verse of a chapter, in order, with its structured spans and footnotes. */
  async getChapter(
    packId: string,
    translationCode: string,
    bookNumber: number,
    chapter: number,
  ): Promise<Chapter> {
    await this.assertPackAvailable(packId);
    const { start, end } = chapterVerseRange(bookNumber, chapter);

    const verseRows = await this.contentDb.query<VerseRow>(
      `SELECT translation_code, canonical_verse_id, book_number, chapter, verse, plain_text, content_json
         FROM "${packId}".verses
        WHERE translation_code = ? AND canonical_verse_id BETWEEN ? AND ?
        ORDER BY verse ASC`,
      [translationCode, start, end],
    );

    const footnoteRows = await this.contentDb.query<FootnoteRow>(
      `SELECT footnote_id, canonical_verse_id, marker, category, body_text
         FROM "${packId}".footnotes
        WHERE translation_code = ? AND canonical_verse_id BETWEEN ? AND ?
        ORDER BY canonical_verse_id ASC, marker ASC`,
      [translationCode, start, end],
    );

    return {
      packId,
      translationCode,
      bookNumber,
      chapter,
      verses: verseRows.rows.map(toVerse),
      footnotes: footnoteRows.rows.map(toFootnote),
    };
  }

  /**
   * FR-101 — the books a pack carries for one translation, with chapter counts, so the reader can
   * navigate the whole canon (Genesis..Revelation) instead of a single fixed passage. Only books
   * that actually contain verses for `translationCode` are returned.
   */
  async listBooks(packId: string, translationCode: string): Promise<BookSummary[]> {
    await this.assertPackAvailable(packId);

    const { rows } = await this.contentDb.query<BookRow>(
      `SELECT b.book_number, b.name, b.testament, b.chapter_count
         FROM "${packId}".books b
        WHERE EXISTS (
          SELECT 1 FROM "${packId}".verses v
           WHERE v.book_number = b.book_number AND v.translation_code = ?
        )
        ORDER BY b.book_number ASC`,
      [translationCode],
    );

    return rows.map(toBookSummary);
  }

  /** FR-102 — a single canonical verse from one translation, or `null` when absent. */
  async getVerse(
    packId: string,
    translationCode: string,
    canonicalVerseId: number,
  ): Promise<Verse | null> {
    await this.assertPackAvailable(packId);
    const result = await this.contentDb.query<VerseRow>(
      `SELECT translation_code, canonical_verse_id, book_number, chapter, verse, plain_text, content_json
         FROM "${packId}".verses
        WHERE translation_code = ? AND canonical_verse_id = ?`,
      [translationCode, canonicalVerseId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toVerse(row);
  }

  /**
   * FR-102 — the same chapter across several translations, in the order requested, for
   * verse-synchronized parallel columns. Alignment into a row-per-verse grid is a pure projection
   * (`alignChapterVerses`), so it lives in the domain, not here.
   */
  async compareChapters(
    refs: readonly TranslationRef[],
    bookNumber: number,
    chapter: number,
  ): Promise<Chapter[]> {
    return Promise.all(
      refs.map((ref) => this.getChapter(ref.packId, ref.translationCode, bookNumber, chapter)),
    );
  }

  /** FR-103 — offline full-text search ranked by relevance. */
  async search({
    packId,
    text,
    translationCode,
    bookNumber,
    testament,
    limit = DEFAULT_SEARCH_LIMIT,
  }: SearchQuery): Promise<SearchHit[]> {
    await this.assertPackAvailable(packId);

    const conditions = ['verses_fts MATCH ?'];
    const params: unknown[] = [text];
    if (translationCode !== undefined) {
      conditions.push('v.translation_code = ?');
      params.push(translationCode);
    }
    if (testament !== undefined) {
      const range = TESTAMENT_RANGES[testament];
      conditions.push('v.canonical_verse_id BETWEEN ? AND ?');
      params.push(range.start, range.end);
    }
    if (bookNumber !== undefined) {
      const start = bookNumber * VERSES_PER_BOOK;
      conditions.push('v.canonical_verse_id BETWEEN ? AND ?');
      params.push(start, start + VERSES_PER_BOOK - 1);
    }
    params.push(limit);

    const result = await this.contentDb.query<SearchRow>(
      `SELECT v.translation_code, v.canonical_verse_id, v.book_number, v.chapter, v.verse,
              v.plain_text, v.content_json,
              snippet(verses_fts, 2, '[[', ']]', '…', 12) AS snippet,
              bm25(verses_fts) AS score
         FROM "${packId}".verses_fts
         JOIN "${packId}".verses AS v ON v.id = verses_fts.rowid
        WHERE ${conditions.join(' AND ')}
        ORDER BY score ASC
        LIMIT ?`,
      params,
    );

    return result.rows.map((row) => ({
      translationCode: row.translation_code,
      canonicalVerseId: row.canonical_verse_id,
      bookNumber: row.book_number,
      chapter: row.chapter,
      verse: row.verse,
      plainText: row.plain_text,
      snippet: row.snippet,
      score: row.score,
    }));
  }

  private async assertPackAvailable(packId: string): Promise<void> {
    const attached = SAFE_PACK_ID.test(packId) ? await this.contentDb.getAttachedPacks() : [];
    if (!attached.includes(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'This content pack is not installed yet.',
        internalDetail: `Content pack "${packId}" is not attached.`,
      });
    }
  }
}

function toVerse(row: VerseRow): Verse {
  return {
    translationCode: row.translation_code,
    canonicalVerseId: row.canonical_verse_id,
    bookNumber: row.book_number,
    chapter: row.chapter,
    verse: row.verse,
    plainText: row.plain_text,
    spans: parseSpans(row.content_json, row.canonical_verse_id),
  };
}

function toBookSummary(row: BookRow): BookSummary {
  return {
    bookNumber: row.book_number,
    name: row.name,
    testament: row.testament === 'NT' ? 'NT' : 'OT',
    chapterCount: row.chapter_count,
  };
}

function toFootnote(row: FootnoteRow): Footnote {
  return {
    footnoteId: row.footnote_id,
    canonicalVerseId: row.canonical_verse_id,
    marker: row.marker,
    category: row.category,
    bodyText: row.body_text,
  };
}

function parseSpans(contentJson: string, canonicalVerseId: number): VerseSpan[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch (cause) {
    throw packCorrupt(canonicalVerseId, cause);
  }
  if (!Array.isArray(parsed) || !parsed.every(isVerseSpan)) {
    throw packCorrupt(canonicalVerseId);
  }
  return parsed;
}

function isVerseSpan(value: unknown): value is VerseSpan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const span = value as Record<string, unknown>;
  return typeof span.text === 'string' && typeof span.type === 'string' && SPAN_TYPES.has(span.type);
}

function packCorrupt(canonicalVerseId: number, cause?: unknown): AppError {
  return new AppError({
    code: 'PACK_INTEGRITY_FAILED',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'A content pack entry is unreadable.',
    internalDetail: `Unparseable content_json for canonical verse ${canonicalVerseId}.`,
    cause,
  });
}
