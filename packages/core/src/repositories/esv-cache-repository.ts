// FR-107 — BYO ESV ephemeral cache (B5 §4.1, C1 §4.3, C3 `ESV_CACHE_LIMIT_REACHED`).
//
// The ESV is never bundled or hosted; the user supplies a personal Crossway API key (kept
// strictly in OS secure storage, never synced — B6). Its passage text may only be held
// **ephemerally** in the local-only `local_device.sqlite` (`api_ephemeral_cache`, B4 §4.4),
// under Crossway's hard limits:
//   * ≤ 500 cumulative cached verses across the whole cache;
//   * ≤ 50 % of any single book's chapters (B5 §4.1);
//   * ≤ 7-day TTL, oldest-first (FIFO) eviction.
// `payload_json` is scripture text: it is never written to the synced DB and never logged
// (AGENTS.md rule 5). `local_device` uses hard deletes, so eviction is a real `DELETE`.
//
// Per AGENTS.md rule 1 this is the ONLY place `api_ephemeral_cache` SQL may live.

import type { LocalDeviceAdapter } from '../adapters';
import { AppError } from '../errors/AppError';

/** Crossway cap: total cached ESV verses (B5 §4.1, F1 suite 3). */
export const ESV_CACHE_MAX_VERSES = 500;

/** Crossway cap: cached chapters of any single book ≤ this fraction of the book's chapters. */
export const ESV_CACHE_MAX_BOOK_FRACTION = 0.5;

/** Crossway TTL: entries expire 7 days after they are written (C1 §4.3). */
export const ESV_CACHE_TTL_DAYS = 7;

/** Cache-key prefix; keys are `esv:<book*1000 + chapter>` (for example `esv:45008`, B4 §4.4). */
const ESV_CACHE_KEY_PREFIX = 'esv:';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Canonical cache key for a chapter of `book` (B4 §4.4 `esv:45008` => Romans 8). */
export function esvCacheKey(book: number, chapter: number): string {
  return `${ESV_CACHE_KEY_PREFIX}${book * 1000 + chapter}`;
}

/** One cached ESV chapter as stored in `api_ephemeral_cache`. */
export interface EsvCacheEntry {
  readonly cacheKey: string;
  readonly book: number | null;
  readonly payloadJson: string;
  readonly verseCount: number;
  readonly expiresAt: string;
}

export interface EsvCachePutInput {
  /** Protestant book number 1..66 (B4 §4.1). */
  readonly book: number;
  readonly chapter: number;
  /** Verses in this chapter (≤ 500 in total across the cache). */
  readonly verseCount: number;
  /** The ESV passage payload (never logged). */
  readonly payloadJson: string;
  /** `books.chapter_count` for this book, read from the installed translation pack (B4 §4.2). */
  readonly bookChapterCount: number;
}

export interface EsvCacheRepositoryOptions {
  readonly localDevice: LocalDeviceAdapter;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

interface CacheRow {
  cache_key: string;
  payload_json: string;
  verse_count: number;
  expires_at: string;
}

/**
 * FR-107 — read/write the ephemeral ESV cache while never exceeding Crossway's limits. `get`
 * honours the TTL; `put` FIFO-evicts the oldest chapters (by `expires_at`) until both the
 * 500-verse and the 50%-of-book caps hold, throwing `ESV_CACHE_LIMIT_REACHED` when the request
 * simply cannot be cached.
 */
export class EsvCacheRepository {
  private readonly localDevice: LocalDeviceAdapter;
  private readonly now: () => number;

  constructor(options: EsvCacheRepositoryOptions) {
    this.localDevice = options.localDevice;
    this.now = options.now ?? Date.now;
  }

  /** A cached chapter, or `null` when absent or past its TTL (an expired row is purged). */
  async get(cacheKey: string): Promise<EsvCacheEntry | null> {
    const row = await this.readRow(cacheKey);
    if (row === null) {
      return null;
    }
    if (Date.parse(row.expires_at) <= this.now()) {
      await this.localDevice.execute('DELETE FROM api_ephemeral_cache WHERE cache_key = ?', [cacheKey]);
      return null;
    }
    return toEntry(row);
  }

  /**
   * Cache a chapter, evicting the oldest entries until the Crossway caps hold. Throws
   * `ESV_CACHE_LIMIT_REACHED` (C3) when the chapter cannot be cached at all — more than 500
   * verses, or a book whose 50% allowance is below one chapter.
   */
  async put(input: EsvCachePutInput): Promise<EsvCacheEntry> {
    const { book, chapter, verseCount, payloadJson, bookChapterCount } = input;
    if (!Number.isInteger(verseCount) || verseCount < 1 || verseCount > ESV_CACHE_MAX_VERSES) {
      throw this.limitError(`Chapter verse count ${verseCount} is outside 1..${ESV_CACHE_MAX_VERSES}.`);
    }

    const maxChaptersForBook = Math.floor(bookChapterCount * ESV_CACHE_MAX_BOOK_FRACTION);
    if (maxChaptersForBook < 1) {
      throw this.limitError(`Book ${book} allows 0 cached chapters (chapter_count ${bookChapterCount}).`);
    }

    const cacheKey = esvCacheKey(book, chapter);
    const expiresAt = new Date(this.now() + ESV_CACHE_TTL_DAYS * MS_PER_DAY).toISOString();

    const rows = await this.listRows();
    const others = rows.filter((row) => row.cache_key !== cacheKey);

    // FIFO-oldest-first eviction (earliest `expires_at` was written first) until both caps hold.
    // `cache_key` breaks ties so eviction stays deterministic when writes share a timestamp.
    const evictionOrder = [...others].sort(
      (a, b) =>
        Date.parse(a.expires_at) - Date.parse(b.expires_at) || a.cache_key.localeCompare(b.cache_key),
    );
    const toEvict: string[] = [];
    let totalVerses = others.reduce((sum, row) => sum + row.verse_count, 0);
    let bookChapters = others.filter((row) => deriveBook(row.cache_key) === book).length;

    for (const row of evictionOrder) {
      if (totalVerses + verseCount <= ESV_CACHE_MAX_VERSES && bookChapters + 1 <= maxChaptersForBook) {
        break;
      }
      toEvict.push(row.cache_key);
      totalVerses -= row.verse_count;
      if (deriveBook(row.cache_key) === book) {
        bookChapters -= 1;
      }
    }

    if (totalVerses + verseCount > ESV_CACHE_MAX_VERSES || bookChapters + 1 > maxChaptersForBook) {
      throw this.limitError(
        `Caching ${cacheKey} (${verseCount} verses) would exceed Crossway's caps even after eviction.`,
      );
    }

    await this.localDevice.execute('BEGIN IMMEDIATE');
    try {
      for (const key of toEvict) {
        await this.localDevice.execute('DELETE FROM api_ephemeral_cache WHERE cache_key = ?', [key]);
      }
      await this.localDevice.execute(
        `INSERT INTO api_ephemeral_cache (cache_key, payload_json, verse_count, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (cache_key) DO UPDATE
            SET payload_json = excluded.payload_json,
                verse_count = excluded.verse_count,
                expires_at = excluded.expires_at`,
        [cacheKey, payloadJson, verseCount, expiresAt],
      );
      await this.localDevice.execute('COMMIT');
    } catch (cause) {
      await this.localDevice.execute('ROLLBACK');
      throw cause;
    }

    return { cacheKey, book, payloadJson, verseCount, expiresAt };
  }

  /** Total cached ESV verses across the cache (≤ `ESV_CACHE_MAX_VERSES`). */
  async totalVerseCount(): Promise<number> {
    const { rows } = await this.localDevice.query<{ total: number | null }>(
      'SELECT SUM(verse_count) AS total FROM api_ephemeral_cache',
    );
    return rows[0]?.total ?? 0;
  }

  /** How many chapters of `book` are currently cached. */
  async cachedChapterCount(book: number): Promise<number> {
    const rows = await this.listRows();
    return rows.filter((row) => deriveBook(row.cache_key) === book).length;
  }

  /** Purge every entry past its TTL; returns how many rows were removed. */
  async pruneExpired(): Promise<number> {
    const rows = await this.listRows();
    const expired = rows.filter((row) => Date.parse(row.expires_at) <= this.now());
    for (const row of expired) {
      await this.localDevice.execute('DELETE FROM api_ephemeral_cache WHERE cache_key = ?', [row.cache_key]);
    }
    return expired.length;
  }

  /** Drop the whole cache (for example when the user removes their ESV key). */
  async clear(): Promise<void> {
    await this.localDevice.execute('DELETE FROM api_ephemeral_cache');
  }

  private async readRow(cacheKey: string): Promise<CacheRow | null> {
    const { rows } = await this.localDevice.query<CacheRow>(
      `SELECT cache_key, payload_json, verse_count, expires_at
         FROM api_ephemeral_cache WHERE cache_key = ?`,
      [cacheKey],
    );
    return rows[0] ?? null;
  }

  private async listRows(): Promise<CacheRow[]> {
    const { rows } = await this.localDevice.query<CacheRow>(
      'SELECT cache_key, payload_json, verse_count, expires_at FROM api_ephemeral_cache',
    );
    return rows;
  }

  private limitError(internalDetail: string): AppError {
    return new AppError({
      code: 'ESV_CACHE_LIMIT_REACHED',
      domain: 'ESV',
      retryPolicy: 'NONE',
      userMessage: 'This chapter is too long to keep offline — ESV passages are streamed fresh each time.',
      internalDetail,
    });
  }
}

/** Recover the book number from a cache key (`esv:45008` => 45); `null` for foreign keys. */
function deriveBook(cacheKey: string): number | null {
  if (!cacheKey.startsWith(ESV_CACHE_KEY_PREFIX)) {
    return null;
  }
  const numeric = Number(cacheKey.slice(ESV_CACHE_KEY_PREFIX.length));
  return Number.isFinite(numeric) ? Math.floor(numeric / 1000) : null;
}

function toEntry(row: CacheRow): EsvCacheEntry {
  return {
    cacheKey: row.cache_key,
    book: deriveBook(row.cache_key),
    payloadJson: row.payload_json,
    verseCount: row.verse_count,
    expiresAt: row.expires_at,
  };
}
