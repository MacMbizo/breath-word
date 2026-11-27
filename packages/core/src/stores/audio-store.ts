// FR-106 Synchronized Audio & Ambient Mixer — headless Zustand store (`packages/core/src/stores/`).
//
// Coordinates `AudioEngineAdapter` (playback + ambient bed + sleep timer), `AudioRepository`
// (timestamps + local LRU cache), and `CoreEventEmitter` (`AUDIO_VERSE_CHANGED`, C2 §4.3).
// Never throws into UI callers; errors surface via `status: 'error'` and `error: AppError`.

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { AudioEngineAdapter } from '../adapters';
import type { AmbientTrackId, AudioChapter, AudioEdition, AudioVerseTimestamp } from '../domain/types';
import { asAppError, type AppError, type AppErrorFallback } from '../errors/AppError';
import type { CoreEventEmitter } from '../events';
import {
  buildAudioCacheKey,
  buildChapterStreamUrl,
  resolveActiveVerseAtMs,
  type AudioRepository,
} from '../repositories/audio-repository';

import type { AsyncStatus } from './types';

const AUDIO_FAILURE: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Audio playback could not be updated. Please try again.',
};

function toAppError(err: unknown): AppError {
  return asAppError(err, AUDIO_FAILURE);
}

export const MIN_PLAYBACK_RATE = 0.8;
export const MAX_PLAYBACK_RATE = 2.0;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export interface AudioState {
  readonly status: AsyncStatus;
  readonly error: AppError | null;
  readonly editions: readonly AudioEdition[];
  readonly activeEdition: AudioEdition | null;
  readonly activeChapter: AudioChapter | null;
  readonly timestamps: readonly AudioVerseTimestamp[];
  readonly isPlaying: boolean;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly activeVerseId: number | null;
  readonly playbackRate: number;
  readonly narrationVolume: number;
  readonly ambientTrack: AmbientTrackId;
  readonly ambientVolume: number;
  readonly sleepTimerMinutes: number | null;

  loadEditions(translationPackId: string, translationCode?: string): Promise<void>;
  loadChapter(input: {
    readonly translationPackId: string;
    readonly editionId: string;
    readonly bookNumber: number;
    readonly chapter: number;
    readonly title: string;
    readonly subtitle: string;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(ms: number): Promise<void>;
  seekToVerse(canonicalVerseId: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>;
  setNarrationVolume(volume: number): Promise<void>;
  setAmbientTrack(trackId: AmbientTrackId, volume?: number): Promise<void>;
  setSleepTimer(minutes: number | null): Promise<void>;
  dispose(): void;
}

export type AudioStore = StoreApi<AudioState>;

export interface CreateAudioStoreOptions {
  readonly audio: AudioEngineAdapter;
  readonly repository: AudioRepository;
  readonly emitter: CoreEventEmitter;
}

export function createAudioStore(options: CreateAudioStoreOptions): AudioStore {
  const { audio, repository, emitter } = options;
  let unsubscribePosition: (() => void) | null = null;

  const ensurePositionSubscription = (
    get: () => AudioState,
    set: (partial: Partial<AudioState>) => void,
  ): void => {
    if (unsubscribePosition !== null) return;
    unsubscribePosition = audio.onPositionUpdate((positionMs) => {
      const state = get();
      const nextVerse = resolveActiveVerseAtMs(state.timestamps, positionMs);
      const prevVerse = state.activeVerseId;
      set({ positionMs, activeVerseId: nextVerse });
      if (nextVerse !== null && nextVerse !== prevVerse && state.activeEdition !== null) {
        emitter.emit({
          type: 'AUDIO_VERSE_CHANGED',
          canonicalVerseId: nextVerse,
          editionId: state.activeEdition.editionId,
        });
      }
    });
  };

  return createStore<AudioState>((set, get) => ({
    status: 'idle',
    error: null,
    editions: [],
    activeEdition: null,
    activeChapter: null,
    timestamps: [],
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    activeVerseId: null,
    playbackRate: 1.0,
    narrationVolume: 1.0,
    ambientTrack: 'none',
    ambientVolume: 0.35,
    sleepTimerMinutes: null,

    async loadEditions(translationPackId, translationCode) {
      set({ status: 'loading', error: null });
      try {
        const editions = await repository.listEditions(translationPackId, translationCode);
        set({
          status: 'ready',
          editions,
          activeEdition: get().activeEdition ?? editions[0] ?? null,
        });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async loadChapter(input) {
      set({ status: 'loading', error: null });
      try {
        const editions = await repository.listEditions(input.translationPackId);
        const edition = editions.find((e) => e.editionId === input.editionId) ?? null;
        const chapter = await repository.getChapterAudio(
          input.translationPackId,
          input.editionId,
          input.bookNumber,
          input.chapter,
        );
        if (edition === null || chapter === null) {
          set({
            status: 'ready',
            editions,
            activeEdition: edition,
            activeChapter: null,
            timestamps: [],
            activeVerseId: null,
            positionMs: 0,
            durationMs: 0,
          });
          return;
        }

        const timestamps = await repository.getChapterTimestamps(
          input.translationPackId,
          input.editionId,
          input.bookNumber,
          input.chapter,
        );

        const cacheKey = buildAudioCacheKey(input.editionId, input.bookNumber, input.chapter);
        const cached = await repository.getCachedChapter(cacheKey);
        let sourceUrlOrPath: string;
        if (cached !== null) {
          await repository.touchCachedChapter(cacheKey);
          sourceUrlOrPath = cached.filePath;
        } else {
          sourceUrlOrPath = buildChapterStreamUrl(edition, chapter);
        }

        ensurePositionSubscription(get, set);
        await audio.loadChapter(sourceUrlOrPath, input.title, input.subtitle);

        const initialVerse = resolveActiveVerseAtMs(timestamps, 0);
        set({
          status: 'ready',
          editions,
          activeEdition: edition,
          activeChapter: chapter,
          timestamps,
          isPlaying: false,
          positionMs: 0,
          durationMs: chapter.durationMs,
          activeVerseId: initialVerse,
        });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async play() {
      try {
        ensurePositionSubscription(get, set);
        await audio.play();
        set({ isPlaying: true, error: null });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async pause() {
      try {
        await audio.pause();
        set({ isPlaying: false, error: null });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async seekTo(ms) {
      try {
        const bounded = Math.max(0, ms);
        await audio.seekTo(bounded);
        const state = get();
        const nextVerse = resolveActiveVerseAtMs(state.timestamps, bounded);
        const prevVerse = state.activeVerseId;
        set({ positionMs: bounded, activeVerseId: nextVerse, error: null });
        if (nextVerse !== null && nextVerse !== prevVerse && state.activeEdition !== null) {
          emitter.emit({
            type: 'AUDIO_VERSE_CHANGED',
            canonicalVerseId: nextVerse,
            editionId: state.activeEdition.editionId,
          });
        }
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async seekToVerse(canonicalVerseId) {
      const target = get().timestamps.find((t) => t.canonicalVerseId === canonicalVerseId);
      if (target === undefined) return;
      await get().seekTo(target.startMs);
    },

    async setPlaybackRate(rate) {
      const bounded = clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
      try {
        await audio.setPlaybackRate(bounded);
        set({ playbackRate: bounded, error: null });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async setNarrationVolume(volume) {
      const bounded = clamp(volume, 0, 1);
      try {
        await audio.setNarrationVolume(bounded);
        set({ narrationVolume: bounded, error: null });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async setAmbientTrack(trackId, volume) {
      const nextVol = clamp(volume ?? get().ambientVolume, 0, 1);
      try {
        await audio.setAmbientTrack(trackId, nextVol);
        set({ ambientTrack: trackId, ambientVolume: nextVol, error: null });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async setSleepTimer(minutes) {
      const normalized = minutes === null ? null : Math.max(1, Math.round(minutes));
      try {
        await audio.setSleepTimer(normalized);
        set({ sleepTimerMinutes: normalized, error: null });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    dispose() {
      if (unsubscribePosition !== null) {
        unsubscribePosition();
        unsubscribePosition = null;
      }
    },
  }));
}
