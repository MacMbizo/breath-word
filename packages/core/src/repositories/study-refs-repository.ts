// FR-303 Automated Passage Guide & Factbook (B4 §4.2 `study_refs` pack).
//
// Compiles weighted TSK cross-references (`cross_references`), literary genre (`books.literary_genre`),
// and Theographic Factbook entity dossiers (`factbook_entities` + `factbook_verse_links`).
// Per AGENTS.md rule 1, all SQL lives here in packages/core; UI apps never write raw SQL.

import type { ContentDbAdapter } from '../adapters';
import { formatCanonicalRange, fromCanonicalVerseId } from '../domain/bbcccvvv';
import type {
  CrossReference,
  FactbookDossier,
  FactbookEntity,
  FactbookEntityType,
  PassageGuide,
} from '../domain/types';
import { AppError } from '../errors/AppError';

const DEFAULT_STUDY_REFS_PACK = 'study_refs';
const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;

interface CrossRefRow {
  id: number;
  from_verse_id: number;
  to_start_verse_id: number;
  to_end_verse_id: number;
  votes: number;
  source: string;
}

interface EntityRow {
  entity_id: string;
  entity_type: string;
  name: string;
  aliases_json: string;
  summary: string;
  latitude: number | null;
  longitude: number | null;
  era_label: string | null;
  metadata_json: string;
}

export interface StudyRefsRepositoryOptions {
  readonly contentDb: ContentDbAdapter;
  readonly studyRefsPackId?: string;
}

export interface PassageGuideOptions {
  readonly translationPackId?: string;
  readonly crossRefLimit?: number;
}

export class StudyRefsRepository {
  private readonly contentDb: ContentDbAdapter;
  private readonly studyRefsPackId: string;

  constructor(options: StudyRefsRepositoryOptions) {
    this.contentDb = options.contentDb;
    this.studyRefsPackId = options.studyRefsPackId ?? DEFAULT_STUDY_REFS_PACK;
  }

  /** True if `study_refs` is currently attached. */
  async isAvailable(): Promise<boolean> {
    const attached = await this.contentDb.getAttachedPacks();
    return attached.includes(this.studyRefsPackId);
  }

  /** FR-303 — Weighted TSK cross-references for a verse or passage range, ordered by `votes DESC`. */
  async getCrossReferences(
    startVerseId: number,
    endVerseId: number = startVerseId,
    limit = 30,
  ): Promise<CrossReference[]> {
    const pack = await this.requirePack(this.studyRefsPackId);
    const boundedLimit = Math.max(1, Math.min(200, limit));
    const { rows } = await this.contentDb.query<CrossRefRow>(
      `SELECT id, from_verse_id, to_start_verse_id, to_end_verse_id, votes, source
         FROM ${pack}.cross_references
        WHERE from_verse_id >= ? AND from_verse_id <= ?
        ORDER BY votes DESC, id ASC
        LIMIT ?`,
      [startVerseId, endVerseId, boundedLimit],
    );
    return rows.map(mapCrossRefRow);
  }

  /** FR-303 — Entities linked to a single verse or passage range. */
  async getEntitiesForPassage(
    startVerseId: number,
    endVerseId: number = startVerseId,
  ): Promise<FactbookEntity[]> {
    const pack = await this.requirePack(this.studyRefsPackId);
    const { rows } = await this.contentDb.query<EntityRow>(
      `SELECT DISTINCT e.entity_id, e.entity_type, e.name, e.aliases_json, e.summary,
              e.latitude, e.longitude, e.era_label, e.metadata_json
         FROM ${pack}.factbook_entities e
         JOIN ${pack}.factbook_verse_links l ON l.entity_id = e.entity_id
        WHERE l.canonical_verse_id >= ? AND l.canonical_verse_id <= ?
        ORDER BY e.entity_type ASC, e.name ASC`,
      [startVerseId, endVerseId],
    );
    return rows.map(mapEntityRow);
  }

  /** FR-303 — Search Factbook entities by name or alias (offline). */
  async searchEntities(
    query: string,
    entityType?: FactbookEntityType,
    limit = 25,
  ): Promise<FactbookEntity[]> {
    const pack = await this.requirePack(this.studyRefsPackId);
    const trimmed = query.trim();
    const boundedLimit = Math.max(1, Math.min(100, limit));

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (trimmed.length > 0) {
      const pattern = `%${trimmed}%`;
      clauses.push('(name LIKE ? COLLATE NOCASE OR aliases_json LIKE ? COLLATE NOCASE)');
      params.push(pattern, pattern);
    }
    if (entityType !== undefined) {
      clauses.push('entity_type = ?');
      params.push(entityType);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(boundedLimit);

    const { rows } = await this.contentDb.query<EntityRow>(
      `SELECT entity_id, entity_type, name, aliases_json, summary,
              latitude, longitude, era_label, metadata_json
         FROM ${pack}.factbook_entities
        ${where}
        ORDER BY name ASC
        LIMIT ?`,
      params,
    );
    return rows.map(mapEntityRow);
  }

  /** FR-303 — Load a complete Factbook dossier (metadata, coordinates, era, all verse links). */
  async getFactbookDossier(entityId: string): Promise<FactbookDossier | null> {
    const pack = await this.requirePack(this.studyRefsPackId);
    const { rows } = await this.contentDb.query<EntityRow>(
      `SELECT entity_id, entity_type, name, aliases_json, summary,
              latitude, longitude, era_label, metadata_json
         FROM ${pack}.factbook_entities
        WHERE entity_id = ?
        LIMIT 1`,
      [entityId],
    );
    if (rows[0] === undefined) return null;

    const { rows: linkRows } = await this.contentDb.query<{ canonical_verse_id: number }>(
      `SELECT canonical_verse_id
         FROM ${pack}.factbook_verse_links
        WHERE entity_id = ?
        ORDER BY canonical_verse_id ASC`,
      [entityId],
    );
    const verseIds = linkRows.map((r) => r.canonical_verse_id);
    return {
      entity: mapEntityRow(rows[0]),
      verseIds,
      references: verseIds.map((id) => formatCanonicalRange(id, id)),
    };
  }

  /**
   * FR-303 — Automated Passage Guide for a verse or passage range:
   * compiles weighted TSK cross-references, literary genre, and Factbook entities.
   */
  async getPassageGuide(
    startVerseId: number,
    endVerseId: number = startVerseId,
    options: PassageGuideOptions = {},
  ): Promise<PassageGuide> {
    const bookNumber = fromCanonicalVerseId(startVerseId).book;
    const [crossReferences, entities, literaryGenre] = await Promise.all([
      this.getCrossReferences(startVerseId, endVerseId, options.crossRefLimit ?? 25),
      this.getEntitiesForPassage(startVerseId, endVerseId),
      this.lookupLiteraryGenre(options.translationPackId, bookNumber),
    ]);

    return {
      startVerseId,
      endVerseId,
      passageReference: formatCanonicalRange(startVerseId, endVerseId),
      bookNumber,
      ...(literaryGenre !== undefined ? { literaryGenre } : {}),
      crossReferences,
      entities,
    };
  }

  private async lookupLiteraryGenre(
    translationPackId: string | undefined,
    bookNumber: number,
  ): Promise<string | undefined> {
    if (translationPackId === undefined || !SAFE_PACK_ID.test(translationPackId)) return undefined;
    const attached = await this.contentDb.getAttachedPacks();
    if (!attached.includes(translationPackId)) return undefined;
    const { rows } = await this.contentDb.query<{ literary_genre: string }>(
      `SELECT literary_genre FROM ${translationPackId}.books WHERE book_number = ? LIMIT 1`,
      [bookNumber],
    );
    return rows[0]?.literary_genre;
  }

  private async requirePack(packId: string): Promise<string> {
    if (!SAFE_PACK_ID.test(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Download the Study References pack from Library to open Passage Guide and Factbook.',
        internalDetail: `Invalid pack identifier "${packId}".`,
      });
    }
    const attached = await this.contentDb.getAttachedPacks();
    if (!attached.includes(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Download the Study References pack from Library to open Passage Guide and Factbook.',
        internalDetail: `Content pack "${packId}" is not attached.`,
      });
    }
    return packId;
  }
}

function mapCrossRefRow(row: CrossRefRow): CrossReference {
  return {
    id: row.id,
    fromVerseId: row.from_verse_id,
    toStartVerseId: row.to_start_verse_id,
    toEndVerseId: row.to_end_verse_id,
    passageReference: formatCanonicalRange(row.to_start_verse_id, row.to_end_verse_id),
    votes: row.votes,
    source: row.source,
  };
}

function mapEntityRow(row: EntityRow): FactbookEntity {
  return {
    entityId: row.entity_id,
    entityType: row.entity_type as FactbookEntityType,
    name: row.name,
    aliases: parseStringArray(row.aliases_json),
    summary: row.summary,
    ...(row.latitude !== null ? { latitude: row.latitude } : {}),
    ...(row.longitude !== null ? { longitude: row.longitude } : {}),
    ...(row.era_label !== null ? { eraLabel: row.era_label } : {}),
    metadata: parseRecord(row.metadata_json),
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseRecord(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
