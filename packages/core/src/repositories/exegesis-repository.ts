// FR-301 Clickable Strong's, Interlinear & Morphology + FR-302 Lexicon & Word Frequency Suite
// + FR-103 Strong's ID Search (B4 §4.2 `exegesis_step` pack + translation `verse_word_alignments`).
//
// Per AGENTS.md rule 1, all exegesis SQL lives here in packages/core; UI apps never write raw SQL.
// Strong's IDs are normalized to unpadded uppercase (`G26`, `H430`) on every boundary (rule 4).

import type { ContentDbAdapter } from '../adapters';
import { formatCanonicalRange, fromCanonicalVerseId } from '../domain/bbcccvvv';
import { BOOKS } from '../domain/books';
import { normalizeStrongsId } from '../domain/strongs';
import type {
  InterlinearToken,
  LexiconEntry,
  LexiconSection,
  OriginalLanguage,
  SourceVersification,
  StrongsOccurrence,
  VerseWordAlignment,
  VersificationMapping,
  VersificationMappingType,
  WordBookFrequency,
  WordFrequencySummary,
  WordInspection,
} from '../domain/types';
import { AppError } from '../errors/AppError';

const DEFAULT_EXEGESIS_PACK = 'exegesis_step';
const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;

interface AlignmentRow {
  id: number;
  translation_code: string;
  canonical_verse_id: number;
  span_index: number;
  char_start: number;
  char_end: number;
  strongs_id: string | null;
  interlinear_word_pos: number | null;
}

interface TokenRow {
  token_id: number;
  canonical_verse_id: number;
  source_verse_id: number;
  word_position: number;
  original_word: string;
  transliteration: string | null;
  english_gloss: string | null;
  strongs_id: string | null;
  lemma: string | null;
  morphology_code: string | null;
  morphology_human: string | null;
}

interface LexiconRow {
  strongs_id: string;
  language: string;
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  short_definition: string;
  full_entry_json: string;
  ot_occurrences: number;
  nt_occurrences: number;
  total_occurrences: number;
}

interface VersificationRow {
  source_versification: string;
  source_verse_id: number;
  canonical_verse_id: number;
  mapping_type: string;
}

export interface ExegesisRepositoryOptions {
  readonly contentDb: ContentDbAdapter;
  readonly exegesisPackId?: string;
}

export interface StrongsSearchOptions {
  readonly testament?: 'OT' | 'NT';
  readonly bookNumber?: number;
  readonly limit?: number;
  readonly offset?: number;
}

export class ExegesisRepository {
  private readonly contentDb: ContentDbAdapter;
  private readonly exegesisPackId: string;

  constructor(options: ExegesisRepositoryOptions) {
    this.contentDb = options.contentDb;
    this.exegesisPackId = options.exegesisPackId ?? DEFAULT_EXEGESIS_PACK;
  }

  /** True if the `exegesis_step` pack is currently attached. */
  async isAvailable(): Promise<boolean> {
    const attached = await this.contentDb.getAttachedPacks();
    return attached.includes(this.exegesisPackId);
  }

  /** FR-301 — Return all interlinear tokens for a canonical verse in word-position order. */
  async getVerseInterlinear(canonicalVerseId: number): Promise<InterlinearToken[]> {
    const pack = await this.requirePack(this.exegesisPackId);
    const { rows } = await this.contentDb.query<TokenRow>(
      `SELECT token_id, canonical_verse_id, source_verse_id, word_position, original_word,
              transliteration, english_gloss, strongs_id, lemma, morphology_code, morphology_human
         FROM ${pack}.interlinear_tokens
        WHERE canonical_verse_id = ?
        ORDER BY word_position ASC`,
      [canonicalVerseId],
    );
    return rows.map(mapTokenRow);
  }

  /** FR-301 — Return word-level alignments stored in a translation pack for one verse. */
  async getVerseWordAlignments(
    translationPackId: string,
    translationCode: string,
    canonicalVerseId: number,
  ): Promise<VerseWordAlignment[]> {
    const pack = await this.requirePack(translationPackId);
    const { rows } = await this.contentDb.query<AlignmentRow>(
      `SELECT id, translation_code, canonical_verse_id, span_index, char_start, char_end,
              strongs_id, interlinear_word_pos
         FROM ${pack}.verse_word_alignments
        WHERE translation_code = ? AND canonical_verse_id = ?
        ORDER BY span_index ASC, char_start ASC`,
      [translationCode, canonicalVerseId],
    );
    return rows.map(mapAlignmentRow);
  }

  /**
   * FR-301 — Inspect a tapped word in a verse by span index (or character offset).
   * Joins `verse_word_alignments` -> `interlinear_tokens` -> `lexicon_entries`.
   */
  async inspectAlignedWord(
    translationPackId: string,
    translationCode: string,
    canonicalVerseId: number,
    wordPositionOrSpanIndex: { readonly spanIndex?: number; readonly charOffset?: number; readonly wordPosition?: number },
  ): Promise<WordInspection> {
    const exegesisPack = await this.requirePack(this.exegesisPackId);
    let alignment: VerseWordAlignment | undefined;

    if (wordPositionOrSpanIndex.spanIndex !== undefined || wordPositionOrSpanIndex.charOffset !== undefined) {
      const alignments = await this.getVerseWordAlignments(translationPackId, translationCode, canonicalVerseId);
      const { spanIndex, charOffset } = wordPositionOrSpanIndex;
      // Offsets are relative to one span's text, so an offset only matches inside its own span.
      const inSpan = spanIndex === undefined ? alignments : alignments.filter((a) => a.spanIndex === spanIndex);
      if (charOffset !== undefined) {
        alignment = inSpan.find((a) => charOffset >= a.charStart && charOffset < a.charEnd);
      } else {
        alignment = inSpan[0];
      }
      if (alignment !== undefined && alignment.interlinearWordPos === undefined && alignment.strongsId !== undefined) {
        // Packs leave the cross-pack word position NULL; resolve it by Strong's occurrence instead.
        const strongs = alignment.strongsId;
        const rank = alignments.filter(
          (a) =>
            a.strongsId === strongs &&
            (a.spanIndex < alignment!.spanIndex || (a.spanIndex === alignment!.spanIndex && a.charStart < alignment!.charStart)),
        ).length;
        const resolved = await this.resolveWordPositionByStrongs(canonicalVerseId, strongs, rank);
        if (resolved !== undefined) alignment = { ...alignment, interlinearWordPos: resolved };
      }
    }

    const targetWordPos = wordPositionOrSpanIndex.wordPosition ?? alignment?.interlinearWordPos;
    let token: InterlinearToken | undefined;

    if (targetWordPos !== undefined) {
      const { rows } = await this.contentDb.query<TokenRow>(
        `SELECT token_id, canonical_verse_id, source_verse_id, word_position, original_word,
                transliteration, english_gloss, strongs_id, lemma, morphology_code, morphology_human
           FROM ${exegesisPack}.interlinear_tokens
          WHERE canonical_verse_id = ? AND word_position = ?
          LIMIT 1`,
        [canonicalVerseId, targetWordPos],
      );
      if (rows[0] !== undefined) token = mapTokenRow(rows[0]);
    }

    const strongsId = token?.strongsId ?? alignment?.strongsId;
    const lexicon = strongsId !== undefined ? (await this.getLexiconEntry(strongsId)) ?? undefined : undefined;

    return {
      canonicalVerseId,
      passageReference: formatCanonicalRange(canonicalVerseId, canonicalVerseId),
      ...(alignment !== undefined ? { alignment } : {}),
      ...(token !== undefined ? { token } : {}),
      ...(lexicon !== undefined ? { lexicon } : {}),
    };
  }

  /**
   * FR-301 — Alignments for a run of verses (a chapter) in one query, grouped by verse, so the
   * reader can mark tappable English words without a round trip per verse (B7 < 30 ms tap budget).
   * Returns an empty map when the translation pack carries no alignments.
   */
  async getWordAlignmentsForRange(
    translationPackId: string,
    translationCode: string,
    firstVerseId: number,
    lastVerseId: number,
  ): Promise<Map<number, VerseWordAlignment[]>> {
    const pack = await this.requirePack(translationPackId);
    const { rows } = await this.contentDb.query<AlignmentRow>(
      `SELECT id, translation_code, canonical_verse_id, span_index, char_start, char_end,
              strongs_id, interlinear_word_pos
         FROM ${pack}.verse_word_alignments
        WHERE translation_code = ? AND canonical_verse_id BETWEEN ? AND ?
        ORDER BY canonical_verse_id ASC, span_index ASC, char_start ASC`,
      [translationCode, firstVerseId, lastVerseId],
    );
    const byVerse = new Map<number, VerseWordAlignment[]>();
    for (const row of rows) {
      const alignment = mapAlignmentRow(row);
      const list = byVerse.get(alignment.canonicalVerseId);
      if (list === undefined) byVerse.set(alignment.canonicalVerseId, [alignment]);
      else list.push(alignment);
    }
    return byVerse;
  }

  /** The `rank`-th (0-based) interlinear token in a verse carrying `strongsId`, by word order. */
  private async resolveWordPositionByStrongs(
    canonicalVerseId: number,
    strongsId: string,
    rank: number,
  ): Promise<number | undefined> {
    const pack = await this.requirePack(this.exegesisPackId);
    const { rows } = await this.contentDb.query<{ word_position: number }>(
      `SELECT word_position FROM ${pack}.interlinear_tokens
        WHERE canonical_verse_id = ? AND strongs_id = ?
        ORDER BY word_position ASC`,
      [canonicalVerseId, strongsId],
    );
    if (rows.length === 0) return undefined;
    // An English translation may repeat a word the original says once: clamp to the last token.
    return (rows[Math.min(rank, rows.length - 1)] ?? rows[0])?.word_position;
  }

  /** FR-301 / FR-302 — Load the full BDB / Thayer / Abbott-Smith lexicon entry for a Strong's ID. */
  async getLexiconEntry(rawStrongsId: string): Promise<LexiconEntry | null> {
    const pack = await this.requirePack(this.exegesisPackId);
    const strongsId = normalizeStrongsId(rawStrongsId);
    if (strongsId === null) return null;

    const { rows } = await this.contentDb.query<LexiconRow>(
      `SELECT strongs_id, language, lemma, transliteration, pronunciation,
              short_definition, full_entry_json, ot_occurrences, nt_occurrences, total_occurrences
         FROM ${pack}.lexicon_entries
        WHERE strongs_id = ?
        LIMIT 1`,
      [strongsId],
    );
    return rows[0] !== undefined ? mapLexiconRow(rows[0]) : null;
  }

  /**
   * FR-302 — Word Frequency Suite: OT/NT/total counts, per-book distribution, and tappable
   * verse occurrences queried offline from `interlinear_tokens`.
   */
  async getWordFrequency(
    rawStrongsId: string,
    options: StrongsSearchOptions = {},
  ): Promise<WordFrequencySummary> {
    const pack = await this.requirePack(this.exegesisPackId);
    const strongsId = normalizeStrongsId(rawStrongsId);
    if (strongsId === null) {
      return {
        strongsId: rawStrongsId.trim().toUpperCase(),
        otOccurrences: 0,
        ntOccurrences: 0,
        totalOccurrences: 0,
        byBook: [],
        occurrences: [],
      };
    }

    const { rows: bookRows } = await this.contentDb.query<{ book_number: number; cnt: number }>(
      `SELECT CAST(canonical_verse_id / 1000000 AS INTEGER) AS book_number,
              COUNT(*) AS cnt
         FROM ${pack}.interlinear_tokens
        WHERE strongs_id = ?
        GROUP BY book_number
        ORDER BY book_number ASC`,
      [strongsId],
    );

    const byBook: WordBookFrequency[] = [];
    let computedOt = 0;
    let computedNt = 0;

    for (const row of bookRows) {
      const meta = BOOKS[row.book_number - 1];
      const testament: 'OT' | 'NT' = meta?.testament ?? (row.book_number <= 39 ? 'OT' : 'NT');
      if (testament === 'OT') computedOt += row.cnt;
      else computedNt += row.cnt;
      byBook.push({
        bookNumber: row.book_number,
        bookName: meta?.name ?? `Book ${row.book_number}`,
        testament,
        occurrences: row.cnt,
      });
    }

    const lexicon = await this.getLexiconEntry(strongsId);
    const occurrences = await this.searchByStrongs(strongsId, options);

    const otOccurrences = lexicon !== null && lexicon.totalOccurrences > 0 ? lexicon.otOccurrences : computedOt;
    const ntOccurrences = lexicon !== null && lexicon.totalOccurrences > 0 ? lexicon.ntOccurrences : computedNt;
    const totalOccurrences =
      lexicon !== null && lexicon.totalOccurrences > 0
        ? lexicon.totalOccurrences
        : computedOt + computedNt;

    return {
      strongsId,
      otOccurrences,
      ntOccurrences,
      totalOccurrences,
      byBook,
      occurrences,
    };
  }

  /** FR-103 / FR-302 — Offline Strong's ID verse search (`G26`, `H430`) with optional filters. */
  async searchByStrongs(
    rawStrongsId: string,
    options: StrongsSearchOptions = {},
  ): Promise<StrongsOccurrence[]> {
    const pack = await this.requirePack(this.exegesisPackId);
    const strongsId = normalizeStrongsId(rawStrongsId);
    if (strongsId === null) return [];

    const clauses: string[] = ['strongs_id = ?'];
    const params: unknown[] = [strongsId];

    if (options.testament === 'OT') {
      clauses.push('canonical_verse_id < 40000000');
    } else if (options.testament === 'NT') {
      clauses.push('canonical_verse_id >= 40000000');
    }

    if (options.bookNumber !== undefined) {
      const start = options.bookNumber * 1_000_000;
      clauses.push('canonical_verse_id >= ? AND canonical_verse_id < ?');
      params.push(start, start + 1_000_000);
    }

    const limit = Math.max(1, Math.min(500, options.limit ?? 100));
    const offset = Math.max(0, options.offset ?? 0);
    params.push(limit, offset);

    const { rows } = await this.contentDb.query<TokenRow>(
      `SELECT token_id, canonical_verse_id, source_verse_id, word_position, original_word,
              transliteration, english_gloss, strongs_id, lemma, morphology_code, morphology_human
         FROM ${pack}.interlinear_tokens
        WHERE ${clauses.join(' AND ')}
        ORDER BY canonical_verse_id ASC, word_position ASC
        LIMIT ? OFFSET ?`,
      params,
    );

    return rows.map((row) => ({
      canonicalVerseId: row.canonical_verse_id,
      passageReference: formatCanonicalRange(row.canonical_verse_id, row.canonical_verse_id),
      bookNumber: fromCanonicalVerseId(row.canonical_verse_id).book,
      wordPosition: row.word_position,
      originalWord: row.original_word,
      ...(row.transliteration !== null ? { transliteration: row.transliteration } : {}),
      ...(row.english_gloss !== null ? { englishGloss: row.english_gloss } : {}),
      ...(row.morphology_human !== null ? { morphologyHuman: row.morphology_human } : {}),
    }));
  }

  /** B4 §4.1 — Map an original-versification verse ID (MT / LXX / NA28) to Protestant BBCCCVVV. */
  async resolveVersification(
    sourceVersification: SourceVersification,
    sourceVerseId: number,
  ): Promise<VersificationMapping[]> {
    const pack = await this.requirePack(this.exegesisPackId);
    const { rows } = await this.contentDb.query<VersificationRow>(
      `SELECT source_versification, source_verse_id, canonical_verse_id, mapping_type
         FROM ${pack}.versification_maps
        WHERE source_versification = ? AND source_verse_id = ?
        ORDER BY canonical_verse_id ASC`,
      [sourceVersification, sourceVerseId],
    );
    return rows.map((row) => ({
      sourceVersification: row.source_versification as SourceVersification,
      sourceVerseId: row.source_verse_id,
      canonicalVerseId: row.canonical_verse_id,
      mappingType: row.mapping_type as VersificationMappingType,
    }));
  }

  private async requirePack(packId: string): Promise<string> {
    if (!SAFE_PACK_ID.test(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Download the Exegesis pack from Library to inspect original-language study notes.',
        internalDetail: `Invalid pack identifier "${packId}".`,
      });
    }
    const attached = await this.contentDb.getAttachedPacks();
    if (!attached.includes(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Download the Exegesis pack from Library to view Strong’s numbers, interlinear, and lexicons.',
        internalDetail: `Content pack "${packId}" is not attached.`,
      });
    }
    return packId;
  }
}

function mapAlignmentRow(row: AlignmentRow): VerseWordAlignment {
  const normalized = row.strongs_id !== null ? normalizeStrongsId(row.strongs_id) : null;
  return {
    id: row.id,
    translationCode: row.translation_code,
    canonicalVerseId: row.canonical_verse_id,
    spanIndex: row.span_index,
    charStart: row.char_start,
    charEnd: row.char_end,
    ...(normalized !== null ? { strongsId: normalized } : {}),
    ...(row.interlinear_word_pos !== null ? { interlinearWordPos: row.interlinear_word_pos } : {}),
  };
}

function mapTokenRow(row: TokenRow): InterlinearToken {
  const normalized = row.strongs_id !== null ? normalizeStrongsId(row.strongs_id) : null;
  return {
    tokenId: row.token_id,
    canonicalVerseId: row.canonical_verse_id,
    sourceVerseId: row.source_verse_id,
    wordPosition: row.word_position,
    originalWord: row.original_word,
    ...(row.transliteration !== null ? { transliteration: row.transliteration } : {}),
    ...(row.english_gloss !== null ? { englishGloss: row.english_gloss } : {}),
    ...(normalized !== null ? { strongsId: normalized } : {}),
    ...(row.lemma !== null ? { lemma: row.lemma } : {}),
    ...(row.morphology_code !== null ? { morphologyCode: row.morphology_code } : {}),
    ...(row.morphology_human !== null ? { morphologyHuman: row.morphology_human } : {}),
  };
}

function mapLexiconRow(row: LexiconRow): LexiconEntry {
  return {
    strongsId: normalizeStrongsId(row.strongs_id) ?? row.strongs_id.toUpperCase(),
    language: row.language as OriginalLanguage,
    lemma: row.lemma,
    ...(row.transliteration !== null ? { transliteration: row.transliteration } : {}),
    ...(row.pronunciation !== null ? { pronunciation: row.pronunciation } : {}),
    shortDefinition: row.short_definition,
    sections: parseLexiconSections(row.full_entry_json),
    otOccurrences: row.ot_occurrences,
    ntOccurrences: row.nt_occurrences,
    totalOccurrences: row.total_occurrences,
  };
}

function parseLexiconSections(raw: string): LexiconSection[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sections: LexiconSection[] = [];
    for (const item of parsed) {
      if (typeof item === 'object' && item !== null) {
        const rec = item as Record<string, unknown>;
        const heading = typeof rec.heading === 'string' ? rec.heading : '';
        const body = typeof rec.body === 'string' ? rec.body : '';
        const source = typeof rec.source === 'string' ? rec.source : undefined;
        const subEntries = Array.isArray(rec.subEntries)
          ? rec.subEntries.filter((s): s is string => typeof s === 'string')
          : undefined;
        sections.push({
          heading,
          body,
          ...(source !== undefined ? { source } : {}),
          ...(subEntries !== undefined ? { subEntries } : {}),
        });
      }
    }
    return sections;
  } catch {
    return [];
  }
}
