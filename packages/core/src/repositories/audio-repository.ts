// FR-106 Synchronized Audio & Ambient Mixer (B4 §4.2 `audio_*`, B4 §4.4 `audio_cache_entries`, B7 §4.2).
//
// Reads narration editions, chapter MP3 metadata, and verse-level sync timestamps from an
// attached translation pack (`ContentDbAdapter`), resolves the active verse in O(log n) time
// (well inside the ±250ms sync budget), and enforces the local-only LRU audio cache cap
// (`100 MB`..`4 GB`, default `250 MB`, respecting `is_pinned = 1`).

import type { ContentDbAdapter, LocalDeviceAdapter } from '../adapters';
import { chapterVerseRange } from '../domain/bbcccvvv';
import type {
  AudioCacheEntry,
  AudioChapter,
  AudioEdition,
  AudioStyle,
  AudioVerseTimestamp,
} from '../domain/types';
import { AppError } from '../errors/AppError';

const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;

export const AUDIO_CACHE_MIN_BYTES = 100 * 1024 * 1024; // 100 MB
export const AUDIO_CACHE_DEFAULT_BYTES = 250 * 1024 * 1024; // 250 MB
export const AUDIO_CACHE_MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

interface EditionRow {
  edition_id: string;
  translation_code: string;
  narrator_name: string;
  style: string;
  base_url: string;
  format: string;
}

interface ChapterRow {
  id: number;
  edition_id: string;
  book_number: number;
  chapter: number;
  relative_path: string;
  duration_ms: number;
  file_size_bytes: number;
  sha256: string | null;
}

interface TimestampRow {
  edition_id: string;
  canonical_verse_id: number;
  start_ms: number;
  end_ms: number;
}

interface CacheRow {
  cache_key: string;
  file_path: string;
  file_size_bytes: number;
  is_pinned: number;
  last_accessed_at: string;
}

export interface AudioRepositoryOptions {
  readonly contentDb: ContentDbAdapter;
  readonly localDevice: LocalDeviceAdapter;
  readonly now?: () => number;
}

/** Clamp a configured audio cache cap to the B7 §4.2 bounds (`100 MB`..`4 GB`). */
export function clampAudioCacheCapBytes(capBytes: number): number {
  if (!Number.isFinite(capBytes)) return AUDIO_CACHE_DEFAULT_BYTES;
  return Math.max(AUDIO_CACHE_MIN_BYTES, Math.min(AUDIO_CACHE_MAX_BYTES, Math.floor(capBytes)));
}

/** Build a stable `audio_cache_entries.cache_key` for an edition + book + chapter. */
export function buildAudioCacheKey(editionId: string, bookNumber: number, chapter: number): string {
  return `${editionId}:${bookNumber}:${chapter}`;
}

/** Join an edition's `baseUrl` and a chapter's `relativePath` without duplicate slashes. */
export function buildChapterStreamUrl(edition: Pick<AudioEdition, 'baseUrl'>, chapter: Pick<AudioChapter, 'relativePath'>): string {
  const base = edition.baseUrl.replace(/\/+$/, '');
  const rel = chapter.relativePath.replace(/^\/+/, '');
  return `${base}/${rel}`;
}

/**
 * FR-106 — O(log n) binary search over `startMs`-sorted timestamps returning the active
 * `canonicalVerseId` at `positionMs`, or `null` if before the first verse or empty.
 */
export function resolveActiveVerseAtMs(
  timestamps: readonly AudioVerseTimestamp[],
  positionMs: number,
): number | null {
  if (timestamps.length === 0 || !Number.isFinite(positionMs) || positionMs < 0) {
    return null;
  }
  if (positionMs < timestamps[0]!.startMs) {
    return null;
  }

  let lo = 0;
  let hi = timestamps.length - 1;
  let candidate = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const item = timestamps[mid]!;
    if (item.startMs <= positionMs) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate < 0) return null;
  const hit = timestamps[candidate]!;
  // If playback sits within [startMs, endMs] or between verses before the next startMs, keep it highlighted.
  return positionMs <= hit.endMs || candidate < timestamps.length - 1
    ? hit.canonicalVerseId
    : hit.canonicalVerseId;
}

export class AudioRepository {
  private readonly contentDb: ContentDbAdapter;
  private readonly localDevice: LocalDeviceAdapter;
  private readonly now: () => number;

  constructor(options: AudioRepositoryOptions) {
    this.contentDb = options.contentDb;
    this.localDevice = options.localDevice;
    this.now = options.now ?? Date.now;
  }

  /** List audio editions embedded in an attached translation pack. */
  async listEditions(translationPackId: string, translationCode?: string): Promise<AudioEdition[]> {
    const pack = await this.requirePack(translationPackId);
    const params: unknown[] = [];
    let where = '';
    if (translationCode !== undefined) {
      where = 'WHERE translation_code = ?';
      params.push(translationCode);
    }
    const { rows } = await this.contentDb.query<EditionRow>(
      `SELECT edition_id, translation_code, narrator_name, style, base_url, format
         FROM ${pack}.audio_editions
        ${where}
        ORDER BY edition_id ASC`,
      params,
    );
    return rows.map((row) => ({
      editionId: row.edition_id,
      translationCode: row.translation_code,
      narratorName: row.narrator_name,
      style: row.style as AudioStyle,
      baseUrl: row.base_url,
      format: row.format,
    }));
  }

  /** Look up one audio chapter (book + chapter) for an edition. */
  async getChapterAudio(
    translationPackId: string,
    editionId: string,
    bookNumber: number,
    chapter: number,
  ): Promise<AudioChapter | null> {
    const pack = await this.requirePack(translationPackId);
    const { rows } = await this.contentDb.query<ChapterRow>(
      `SELECT id, edition_id, book_number, chapter, relative_path, duration_ms, file_size_bytes, sha256
         FROM ${pack}.audio_chapters
        WHERE edition_id = ? AND book_number = ? AND chapter = ?
        LIMIT 1`,
      [editionId, bookNumber, chapter],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      editionId: row.edition_id,
      bookNumber: row.book_number,
      chapter: row.chapter,
      relativePath: row.relative_path,
      durationMs: row.duration_ms,
      fileSizeBytes: row.file_size_bytes,
      ...(row.sha256 !== null ? { sha256: row.sha256 } : {}),
    };
  }

  /** Fetch all verse-level sync timestamps for one chapter sorted by `start_ms ASC`. */
  async getChapterTimestamps(
    translationPackId: string,
    editionId: string,
    bookNumber: number,
    chapter: number,
  ): Promise<AudioVerseTimestamp[]> {
    const pack = await this.requirePack(translationPackId);
    const { start, end } = chapterVerseRange(bookNumber, chapter);
    const { rows } = await this.contentDb.query<TimestampRow>(
      `SELECT edition_id, canonical_verse_id, start_ms, end_ms
         FROM ${pack}.audio_verse_timestamps
        WHERE edition_id = ? AND canonical_verse_id >= ? AND canonical_verse_id <= ?
        ORDER BY start_ms ASC, canonical_verse_id ASC`,
      [editionId, start, end],
    );
    return rows.map((row) => ({
      editionId: row.edition_id,
      canonicalVerseId: row.canonical_verse_id,
      startMs: row.start_ms,
      endMs: row.end_ms,
    }));
  }

  // --------------------------------------------------------------------------
  // Local-only LRU Audio Cache (`local_device.sqlite -> audio_cache_entries`)
  // --------------------------------------------------------------------------

  async recordCachedChapter(input: {
    readonly cacheKey: string;
    readonly filePath: string;
    readonly fileSizeBytes: number;
    readonly isPinned?: boolean;
    readonly capBytes?: number;
  }): Promise<{ entry: AudioCacheEntry; evicted: AudioCacheEntry[] }> {
    const ts = this.timestamp();
    const isPinned = input.isPinned === true ? 1 : 0;

    await this.localDevice.execute(
      `INSERT INTO audio_cache_entries
         (cache_key, file_path, file_size_bytes, is_pinned, last_accessed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         file_path = excluded.file_path,
         file_size_bytes = excluded.file_size_bytes,
         is_pinned = excluded.is_pinned,
         last_accessed_at = excluded.last_accessed_at`,
      [input.cacheKey, input.filePath, Math.max(0, input.fileSizeBytes), isPinned, ts],
    );

    const evicted = await this.evictToCap(
      input.capBytes ?? AUDIO_CACHE_DEFAULT_BYTES,
      input.cacheKey,
    );

    return {
      entry: {
        cacheKey: input.cacheKey,
        filePath: input.filePath,
        fileSizeBytes: Math.max(0, input.fileSizeBytes),
        isPinned: isPinned === 1,
        lastAccessedAt: ts,
      },
      evicted,
    };
  }

  async getCachedChapter(cacheKey: string): Promise<AudioCacheEntry | null> {
    const { rows } = await this.localDevice.query<CacheRow>(
      `SELECT cache_key, file_path, file_size_bytes, is_pinned, last_accessed_at
         FROM audio_cache_entries
        WHERE cache_key = ?
        LIMIT 1`,
      [cacheKey],
    );
    return rows[0] !== undefined ? mapCacheRow(rows[0]) : null;
  }

  async touchCachedChapter(cacheKey: string): Promise<void> {
    await this.localDevice.execute(
      `UPDATE audio_cache_entries SET last_accessed_at = ? WHERE cache_key = ?`,
      [this.timestamp(), cacheKey],
    );
  }

  async setChapterPinned(cacheKey: string, pinned: boolean): Promise<void> {
    await this.localDevice.execute(
      `UPDATE audio_cache_entries SET is_pinned = ?, last_accessed_at = ? WHERE cache_key = ?`,
      [pinned ? 1 : 0, this.timestamp(), cacheKey],
    );
  }

  async listCachedChapters(): Promise<AudioCacheEntry[]> {
    const { rows } = await this.localDevice.query<CacheRow>(
      `SELECT cache_key, file_path, file_size_bytes, is_pinned, last_accessed_at
         FROM audio_cache_entries
        ORDER BY last_accessed_at DESC`,
    );
    return rows.map(mapCacheRow);
  }

  async getTotalCachedBytes(): Promise<number> {
    const { rows } = await this.localDevice.query<{ total: number | null }>(
      `SELECT SUM(file_size_bytes) AS total FROM audio_cache_entries`,
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Evict oldest unpinned entries until total size <= `capBytes` (clamped to `100 MB`..`4 GB`
   * unless a custom test cap is explicitly passed via `evictToExactCap`).
   */
  async evictToCap(capBytes: number, protectKey?: string): Promise<AudioCacheEntry[]> {
    return this.evictToExactCap(clampAudioCacheCapBytes(capBytes), protectKey);
  }

  /** Evict oldest unpinned entries until total size <= exact `limitBytes`. */
  async evictToExactCap(limitBytes: number, protectKey?: string): Promise<AudioCacheEntry[]> {
    const total = await this.getTotalCachedBytes();
    if (total <= limitBytes) return [];

    const { rows } = await this.localDevice.query<CacheRow>(
      `SELECT cache_key, file_path, file_size_bytes, is_pinned, last_accessed_at
         FROM audio_cache_entries
        WHERE is_pinned = 0
        ORDER BY last_accessed_at ASC, cache_key ASC`,
    );

    let remaining = total;
    const evicted: AudioCacheEntry[] = [];
    for (const row of rows) {
      if (remaining <= limitBytes) break;
      if (protectKey !== undefined && row.cache_key === protectKey) continue;
      await this.localDevice.execute(`DELETE FROM audio_cache_entries WHERE cache_key = ?`, [
        row.cache_key,
      ]);
      remaining -= row.file_size_bytes;
      evicted.push(mapCacheRow(row));
    }
    return evicted;
  }

  private async requirePack(packId: string): Promise<string> {
    if (!SAFE_PACK_ID.test(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Install this Bible translation pack before playing synchronized audio.',
        internalDetail: `Invalid pack identifier "${packId}".`,
      });
    }
    const attached = await this.contentDb.getAttachedPacks();
    if (!attached.includes(packId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Install this Bible translation pack before playing synchronized audio.',
        internalDetail: `Content pack "${packId}" is not attached.`,
      });
    }
    return packId;
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}

function mapCacheRow(row: CacheRow): AudioCacheEntry {
  return {
    cacheKey: row.cache_key,
    filePath: row.file_path,
    fileSizeBytes: row.file_size_bytes,
    isPinned: row.is_pinned === 1,
    lastAccessedAt: row.last_accessed_at,
  };
}
