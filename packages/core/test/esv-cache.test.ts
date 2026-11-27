// FR-107 — ESV ephemeral cache limits (B5 §4.1, C1 §4.3, F1 suite 3):
// ≤500 cumulative verses, ≤50%-of-book chapters, 7-day TTL, FIFO eviction.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isAppError } from '../src/errors/AppError';
import {
  ESV_CACHE_MAX_VERSES,
  ESV_CACHE_TTL_DAYS,
  EsvCacheRepository,
  esvCacheKey,
} from '../src/repositories/esv-cache-repository';

import { NodeLocalDeviceAdapter } from './helpers/node-local-device';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const START = Date.parse('2026-11-27T00:00:00Z');

const ROMANS = 45;
const ROMANS_CHAPTERS = 16; // B4 books.chapter_count -> 50% allowance = 8 chapters

let localDevice: NodeLocalDeviceAdapter;
let repo: EsvCacheRepository;
let clockMs: number;

beforeEach(() => {
  localDevice = new NodeLocalDeviceAdapter();
  clockMs = START;
  repo = new EsvCacheRepository({ localDevice, now: () => clockMs });
});

afterEach(() => {
  localDevice.close();
});

/** Cache a chapter and advance the (injected) clock so FIFO order is deterministic. */
async function put(
  book: number,
  chapter: number,
  verseCount: number,
  bookChapterCount = ROMANS_CHAPTERS,
): Promise<void> {
  await repo.put({
    book,
    chapter,
    verseCount,
    payloadJson: JSON.stringify({ book, chapter }),
    bookChapterCount,
  });
  clockMs += 1000;
}

describe('esvCacheKey (B4 §4.4)', () => {
  it('encodes book*1000+chapter', () => {
    expect(esvCacheKey(45, 8)).toBe('esv:45008');
  });
});

describe('EsvCacheRepository.get (TTL)', () => {
  it('round-trips a fresh chapter', async () => {
    await put(ROMANS, 8, 39);
    const entry = await repo.get('esv:45008');
    expect(entry?.verseCount).toBe(39);
    expect(entry?.book).toBe(ROMANS);
  });

  it('returns null for an unknown key', async () => {
    expect(await repo.get('esv:99999')).toBeNull();
  });

  it('treats a row past its 7-day TTL as a miss and purges it', async () => {
    await put(ROMANS, 8, 39);
    clockMs += (ESV_CACHE_TTL_DAYS + 1) * MS_PER_DAY;

    expect(await repo.get('esv:45008')).toBeNull();
    expect(await repo.totalVerseCount()).toBe(0);
  });
});

describe('EsvCacheRepository.put (Crossway caps)', () => {
  it('never accumulates more than 500 verses, FIFO-evicting the oldest', async () => {
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      await put(ROMANS, chapter, 100); // 500 verses total
    }
    expect(await repo.totalVerseCount()).toBe(ESV_CACHE_MAX_VERSES);

    await put(ROMANS, 6, 100); // would be 600 -> evict the oldest chapter

    expect(await repo.totalVerseCount()).toBe(ESV_CACHE_MAX_VERSES);
    expect(await repo.get(esvCacheKey(ROMANS, 1))).toBeNull();
    expect(await repo.get(esvCacheKey(ROMANS, 6))).not.toBeNull();
  });

  it('caps cached chapters of a book at 50% of its chapter_count', async () => {
    for (let chapter = 1; chapter <= 8; chapter += 1) {
      await put(ROMANS, chapter, 10); // 8 == 50% of 16
    }
    await put(ROMANS, 9, 10); // forces eviction of the oldest Romans chapter

    expect(await repo.cachedChapterCount(ROMANS)).toBe(8);
    expect(await repo.get(esvCacheKey(ROMANS, 1))).toBeNull();
    expect(await repo.get(esvCacheKey(ROMANS, 9))).not.toBeNull();
  });

  it('replacing the same chapter does not double-count its verses', async () => {
    await put(ROMANS, 8, 100);
    await put(ROMANS, 8, 100);
    expect(await repo.totalVerseCount()).toBe(100);
  });

  it('throws ESV_CACHE_LIMIT_REACHED for a chapter longer than 500 verses', async () => {
    const error = await repo
      .put({ book: ROMANS, chapter: 1, verseCount: 501, payloadJson: '{}', bookChapterCount: ROMANS_CHAPTERS })
      .catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('ESV_CACHE_LIMIT_REACHED');
  });

  it('throws ESV_CACHE_LIMIT_REACHED for a single-chapter book (0% headroom)', async () => {
    const error = await repo
      .put({ book: 65, chapter: 1, verseCount: 25, payloadJson: '{}', bookChapterCount: 1 })
      .catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('ESV_CACHE_LIMIT_REACHED');
    expect(await repo.totalVerseCount()).toBe(0);
  });
});

describe('EsvCacheRepository maintenance', () => {
  it('prunes only expired entries', async () => {
    await put(ROMANS, 1, 10);
    clockMs += 8 * MS_PER_DAY;
    await put(ROMANS, 2, 10);

    expect(await repo.pruneExpired()).toBe(1);
    expect(await repo.totalVerseCount()).toBe(10);
  });

  it('clears the whole cache', async () => {
    await put(ROMANS, 1, 10);
    await repo.clear();
    expect(await repo.totalVerseCount()).toBe(0);
  });
});
