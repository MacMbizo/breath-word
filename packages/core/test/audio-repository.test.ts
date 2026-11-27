// FR-106 Synchronized Audio & Ambient Mixer — timestamps, binary-search verse sync,
// LRU cache eviction (respecting pinned chapters), and headless `createAudioStore` + `AUDIO_VERSE_CHANGED`.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AudioEngineAdapter } from '../src/adapters';
import { TRANSLATION_PACK_DDL } from '../src/content/pack-schema';
import { createCoreEventEmitter, type CoreEvent } from '../src/events';
import {
  AUDIO_CACHE_MAX_BYTES,
  AUDIO_CACHE_MIN_BYTES,
  AudioRepository,
  buildAudioCacheKey,
  clampAudioCacheCapBytes,
  resolveActiveVerseAtMs,
} from '../src/repositories/audio-repository';
import { createAudioStore } from '../src/stores/audio-store';

import { NodeContentDbAdapter } from './helpers/node-content-db';
import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { DatabaseSync } from './helpers/node-sqlite';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-audio-'));
const bsbPath = join(tmpRoot, 'core_bsb.sqlite');

beforeAll(() => {
  const db = new DatabaseSync(bsbPath);
  try {
    db.exec(TRANSLATION_PACK_DDL);
    db.prepare(
      `INSERT INTO pack_metadata
         (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
       VALUES ('core_bsb', 'TRANSLATION', 1, '1.0.0', 'BSB', 'CC0-1.0', 'Public domain', '2026-11-27T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO translations (translation_code, name, language, license_type, has_audio, version)
       VALUES ('BSB', 'Berean Standard Bible', 'en', 'CC0-1.0', 1, '1.0.0')`,
    ).run();
    db.prepare(
      `INSERT INTO audio_editions (edition_id, translation_code, narrator_name, style, base_url, format)
       VALUES ('bsb_souer_single', 'BSB', 'Bob Souer', 'SINGLE_VOICE', 'https://audio.breathandword.app/bsb/', 'mp3')`,
    ).run();
    db.prepare(
      `INSERT INTO audio_chapters (edition_id, book_number, chapter, relative_path, duration_ms, file_size_bytes, sha256)
       VALUES ('bsb_souer_single', 45, 8, '45/45_008.mp3', 240000, 3840000, 'abc123')`,
    ).run();

    const insertTs = db.prepare(
      `INSERT INTO audio_verse_timestamps (edition_id, canonical_verse_id, start_ms, end_ms)
       VALUES ('bsb_souer_single', ?, ?, ?)`,
    );
    insertTs.run(45008001, 0, 6200);
    insertTs.run(45008002, 6200, 12800);
    insertTs.run(45008028, 165000, 173500);
  } finally {
    db.close();
  }
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

function createFakeAudioAdapter() {
  const listeners = new Set<(ms: number) => void>();
  const calls: string[] = [];
  let loadedSource: string | null = null;
  let lastRate = 1.0;
  let lastAmbient: { trackId: string; volume: number } = { trackId: 'none', volume: 0 };
  let lastNarrationVolume = 1.0;
  let lastSleepTimer: number | null = null;

  const adapter: AudioEngineAdapter = {
    async loadChapter(urlOrPath) {
      loadedSource = urlOrPath;
      calls.push(`load:${urlOrPath}`);
    },
    async play() {
      calls.push('play');
    },
    async pause() {
      calls.push('pause');
    },
    async seekTo(ms) {
      calls.push(`seek:${ms}`);
    },
    async setPlaybackRate(rate) {
      lastRate = rate;
      calls.push(`rate:${rate}`);
    },
    async setAmbientTrack(trackId, volume) {
      lastAmbient = { trackId, volume };
      calls.push(`ambient:${trackId}:${volume}`);
    },
    async setNarrationVolume(volume) {
      lastNarrationVolume = volume;
      calls.push(`narration:${volume}`);
    },
    async setSleepTimer(minutes) {
      lastSleepTimer = minutes;
      calls.push(`sleep:${minutes}`);
    },
    onPositionUpdate(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };

  return {
    adapter,
    emitPosition: (ms: number) => {
      for (const l of listeners) l(ms);
    },
    getLoadedSource: () => loadedSource,
    getLastRate: () => lastRate,
    getLastAmbient: () => lastAmbient,
    getLastNarrationVolume: () => lastNarrationVolume,
    getLastSleepTimer: () => lastSleepTimer,
    calls,
  };
}

let contentDb: NodeContentDbAdapter;
let localDevice: NodeLocalDeviceAdapter;
let nowMs: number;
let repo: AudioRepository;

beforeEach(async () => {
  nowMs = Date.parse('2026-11-27T11:00:00Z');
  contentDb = new NodeContentDbAdapter();
  await contentDb.attachPack('core_bsb', bsbPath);
  localDevice = new NodeLocalDeviceAdapter();
  repo = new AudioRepository({ contentDb, localDevice, now: () => nowMs });
});

afterEach(() => {
  contentDb.close();
  localDevice.close();
});

describe('AudioRepository & LRU Cache (FR-106)', () => {
  it('resolves active verse in O(log n) binary search across Rom 8 timestamps', async () => {
    const timestamps = await repo.getChapterTimestamps('core_bsb', 'bsb_souer_single', 45, 8);
    expect(timestamps).toHaveLength(3);
    expect(resolveActiveVerseAtMs(timestamps, 0)).toBe(45008001);
    expect(resolveActiveVerseAtMs(timestamps, 6250)).toBe(45008002);
    expect(resolveActiveVerseAtMs(timestamps, 165100)).toBe(45008028);
  });

  it('enforces LRU cache eviction while keeping pinned chapters intact', async () => {
    expect(clampAudioCacheCapBytes(10)).toBe(AUDIO_CACHE_MIN_BYTES);
    expect(clampAudioCacheCapBytes(100 * 1024 * 1024 * 1024)).toBe(AUDIO_CACHE_MAX_BYTES);

    const k1 = buildAudioCacheKey('bsb_souer_single', 19, 23);
    const k2 = buildAudioCacheKey('bsb_souer_single', 45, 8);
    const k3 = buildAudioCacheKey('bsb_souer_single', 43, 1);

    await repo.recordCachedChapter({ cacheKey: k1, filePath: '/a/ps23.mp3', fileSizeBytes: 500, isPinned: true });
    nowMs += 1000;
    await repo.recordCachedChapter({ cacheKey: k2, filePath: '/a/rom8.mp3', fileSizeBytes: 500, isPinned: false });
    nowMs += 1000;
    await repo.recordCachedChapter({ cacheKey: k3, filePath: '/a/jn1.mp3', fileSizeBytes: 500, isPinned: false });

    // Cap at 1000 bytes -> must evict k2 (oldest unpinned), NEVER k1 (pinned)
    const evicted = await repo.evictToExactCap(1000);
    expect(evicted.map((e) => e.cacheKey)).toEqual([k2]);
    expect(await repo.getCachedChapter(k1)).not.toBeNull();
    expect(await repo.getCachedChapter(k2)).toBeNull();
    expect(await repo.getCachedChapter(k3)).not.toBeNull();
  });
});

describe('createAudioStore (FR-106)', () => {
  it('loads Rom 8, emits AUDIO_VERSE_CHANGED on playback updates, and controls ambient mixer & sleep timer', async () => {
    const fake = createFakeAudioAdapter();
    const emitter = createCoreEventEmitter();
    const events: CoreEvent[] = [];
    emitter.on('AUDIO_VERSE_CHANGED', (e) => events.push(e));

    const store = createAudioStore({ audio: fake.adapter, repository: repo, emitter });

    await store.getState().loadChapter({
      translationPackId: 'core_bsb',
      editionId: 'bsb_souer_single',
      bookNumber: 45,
      chapter: 8,
      title: 'Romans 8',
      subtitle: 'BSB — Bob Souer',
    });

    expect(fake.getLoadedSource()).toBe('https://audio.breathandword.app/bsb/45/45_008.mp3');
    expect(store.getState().activeVerseId).toBe(45008001);

    await store.getState().play();
    expect(store.getState().isPlaying).toBe(true);

    fake.emitPosition(165200);
    expect(store.getState().activeVerseId).toBe(45008028);
    expect(events).toEqual([
      { type: 'AUDIO_VERSE_CHANGED', canonicalVerseId: 45008028, editionId: 'bsb_souer_single' },
    ]);

    await store.getState().setPlaybackRate(3.0); // clamped to 2.0
    expect(fake.getLastRate()).toBe(2.0);
    await store.getState().setAmbientTrack('rain', 0.4);
    expect(fake.getLastAmbient()).toEqual({ trackId: 'rain', volume: 0.4 });
    await store.getState().setNarrationVolume(0.85);
    expect(fake.getLastNarrationVolume()).toBe(0.85);
    await store.getState().setSleepTimer(15);
    expect(fake.getLastSleepTimer()).toBe(15);

    store.getState().dispose();
  });
});
