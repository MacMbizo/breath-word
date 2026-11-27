// P3-07 — FR-106 headless audio store edge cases + the shared sleep-timer fade curve.

import { describe, expect, it } from 'vitest';

import type { AudioEngineAdapter } from '../src/adapters';
import { SLEEP_FADE_MS, sleepFadeGain } from '../src/audio/sleep-fade';
import type { AudioChapter, AudioEdition, AudioVerseTimestamp } from '../src/domain/types';
import { AppError } from '../src/errors/AppError';
import { createCoreEventEmitter, type CoreEvent } from '../src/events';
import type { AudioRepository } from '../src/repositories/audio-repository';
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, createAudioStore } from '../src/stores/audio-store';

const EDITION: AudioEdition = {
  editionId: 'bsb-souer',
  translationCode: 'BSB',
  narratorName: 'Narrator',
  style: 'DRAMATIZED',
  baseUrl: 'https://audio.example.test/bsb/',
  format: 'mp3',
};
const CHAPTER: AudioChapter = {
  id: 1,
  editionId: EDITION.editionId,
  bookNumber: 45,
  chapter: 8,
  relativePath: '/45/45_008.mp3',
  durationMs: 300_000,
  fileSizeBytes: 1,
};
const TIMESTAMPS: AudioVerseTimestamp[] = [1, 2, 3].map((verse) => ({
  editionId: EDITION.editionId,
  canonicalVerseId: 45_008_000 + verse,
  startMs: (verse - 1) * 10_000,
  endMs: verse * 10_000,
}));

function setup(options: { failOn?: keyof AudioEngineAdapter; cachedPath?: string } = {}) {
  const listeners = new Set<(ms: number) => void>();
  const calls: string[] = [];
  const maybeFail = async (name: keyof AudioEngineAdapter, entry: string): Promise<void> => {
    if (options.failOn === name) throw new Error(`${name} failed`);
    calls.push(entry);
  };
  const audio: AudioEngineAdapter = {
    loadChapter: (url) => maybeFail('loadChapter', `load:${url}`),
    play: () => maybeFail('play', 'play'),
    pause: () => maybeFail('pause', 'pause'),
    seekTo: (ms) => maybeFail('seekTo', `seek:${ms}`),
    setPlaybackRate: (rate) => maybeFail('setPlaybackRate', `rate:${rate}`),
    setAmbientTrack: (id, volume) => maybeFail('setAmbientTrack', `ambient:${id}:${volume}`),
    setNarrationVolume: (volume) => maybeFail('setNarrationVolume', `narration:${volume}`),
    setSleepTimer: (minutes) => maybeFail('setSleepTimer', `sleep:${minutes}`),
    onPositionUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const touched: string[] = [];
  const repository = {
    listEditions: async () => [EDITION],
    getChapterAudio: async (_pack: string, editionId: string, book: number, chapter: number) =>
      editionId === EDITION.editionId && book === 45 && chapter === 8 ? CHAPTER : null,
    getChapterTimestamps: async () => TIMESTAMPS,
    getCachedChapter: async (key: string) =>
      options.cachedPath !== undefined
        ? { cacheKey: key, filePath: options.cachedPath, fileSizeBytes: 1, isPinned: false, lastAccessedAt: '' }
        : null,
    touchCachedChapter: async (key: string) => {
      touched.push(key);
    },
  } as unknown as AudioRepository;

  const emitter = createCoreEventEmitter();
  const events: CoreEvent[] = [];
  emitter.on('AUDIO_VERSE_CHANGED', (event) => events.push(event));
  const store = createAudioStore({ audio, repository, emitter });
  const emit = (ms: number) => {
    for (const listener of listeners) listener(ms);
  };
  return { store, calls, events, emit, listeners, touched };
}

const LOAD = {
  translationPackId: 'core_bsb',
  editionId: EDITION.editionId,
  bookNumber: 45,
  chapter: 8,
  title: 'Romans 8',
  subtitle: 'BSB',
};

describe('createAudioStore edge cases (P3-07)', () => {
  it('streams when uncached and plays from the local file (touching the LRU) when cached', async () => {
    const streamed = setup();
    await streamed.store.getState().loadChapter(LOAD);
    expect(streamed.calls).toContain('load:https://audio.example.test/bsb/45/45_008.mp3');
    expect(streamed.store.getState()).toMatchObject({ durationMs: 300_000, activeVerseId: 45_008_001 });

    const cached = setup({ cachedPath: '/cache/45_008.mp3' });
    await cached.store.getState().loadChapter(LOAD);
    expect(cached.calls).toContain('load:/cache/45_008.mp3');
    expect(cached.touched).toEqual(['bsb-souer:45:8']);
  });

  it('clears the chapter instead of failing when no narration exists for it', async () => {
    const { store, calls } = setup();
    await store.getState().loadChapter({ ...LOAD, chapter: 9 });
    expect(store.getState()).toMatchObject({ status: 'ready', activeChapter: null, timestamps: [], activeVerseId: null });
    expect(calls).toEqual([]);
  });

  it('emits AUDIO_VERSE_CHANGED once per verse change, not on every position tick', async () => {
    const { store, events, emit } = setup();
    await store.getState().loadChapter(LOAD);
    emit(1_000);
    emit(2_000);
    emit(12_000);
    emit(13_000);
    emit(25_000);
    expect(events.map((e) => (e as { canonicalVerseId: number }).canonicalVerseId)).toEqual([45_008_002, 45_008_003]);
    expect(store.getState().positionMs).toBe(25_000);
  });

  it('seeks to a verse start and ignores verses without a timestamp', async () => {
    const { store, calls } = setup();
    await store.getState().loadChapter(LOAD);
    await store.getState().seekToVerse(45_008_003);
    await store.getState().seekToVerse(45_008_099);
    expect(calls.filter((c) => c.startsWith('seek:'))).toEqual(['seek:20000']);
    expect(store.getState().activeVerseId).toBe(45_008_003);
  });

  it('clamps rate (0.8..2.0), volumes (0..1) and rounds the sleep timer up to whole minutes', async () => {
    const { store, calls } = setup();
    await store.getState().setPlaybackRate(0.5);
    expect(store.getState().playbackRate).toBe(MIN_PLAYBACK_RATE);
    await store.getState().setPlaybackRate(3);
    expect(store.getState().playbackRate).toBe(MAX_PLAYBACK_RATE);
    await store.getState().setNarrationVolume(1.7);
    await store.getState().setAmbientTrack('rain', -1);
    expect(store.getState()).toMatchObject({ narrationVolume: 1, ambientTrack: 'rain', ambientVolume: 0 });
    await store.getState().setSleepTimer(0.2);
    expect(store.getState().sleepTimerMinutes).toBe(1);
    await store.getState().setSleepTimer(null);
    expect(store.getState().sleepTimerMinutes).toBeNull();
    expect(calls).toEqual(['rate:0.8', 'rate:2', 'narration:1', 'ambient:rain:0', 'sleep:1', 'sleep:null']);
  });

  it('keeps the ambient bed independent of narration volume', async () => {
    const { store } = setup();
    await store.getState().setAmbientTrack('piano', 0.6);
    await store.getState().setNarrationVolume(0.2);
    await store.getState().setAmbientTrack('pad');
    expect(store.getState()).toMatchObject({ ambientTrack: 'pad', ambientVolume: 0.6, narrationVolume: 0.2 });
  });

  it('never throws into the UI: adapter failures become a canonical AppError', async () => {
    const { store } = setup({ failOn: 'play' });
    await expect(store.getState().play()).resolves.toBeUndefined();
    const { status, error, isPlaying } = store.getState();
    expect(status).toBe('error');
    expect(isPlaying).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect(error?.code).toBe('DB_OPERATION_FAILED');
  });

  it('dispose() stops listening to position updates', async () => {
    const { store, listeners } = setup();
    await store.getState().loadChapter(LOAD);
    expect(listeners.size).toBe(1);
    store.getState().dispose();
    expect(listeners.size).toBe(0);
  });
});

describe('sleepFadeGain', () => {
  const timer = 10 * 60_000;

  it('holds full volume until the fade window, then ramps to silence', () => {
    expect(sleepFadeGain(0, timer)).toBe(1);
    expect(sleepFadeGain(timer - SLEEP_FADE_MS, timer)).toBe(1);
    expect(sleepFadeGain(timer - SLEEP_FADE_MS / 2, timer)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(sleepFadeGain(timer, timer)).toBe(0);
    expect(sleepFadeGain(timer + 1, timer)).toBe(0);
  });

  it('is monotonically non-increasing across the fade', () => {
    let previous = 1;
    for (let t = timer - SLEEP_FADE_MS; t <= timer; t += 250) {
      const gain = sleepFadeGain(t, timer);
      expect(gain).toBeLessThanOrEqual(previous);
      previous = gain;
    }
  });

  it('fades across the whole timer when it is shorter than the fade window', () => {
    expect(sleepFadeGain(5_000, 10_000)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(sleepFadeGain(0, 0)).toBe(0);
  });
});
