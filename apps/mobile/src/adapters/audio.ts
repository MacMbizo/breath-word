// AudioEngineAdapter — narration over react-native-track-player (B3 §4.3, B4 §4.7).
//
// Narration rides the native player (TrackPlayer), which also drives the lock-screen / notification
// controls. react-native-track-player owns a single active track, so the ambient beds
// (rain/piano/pad) — which must play *simultaneously* with narration — are recorded but not yet
// rendered: a two-stream native mixer is out of Gate-1 scope (the desktop HTML5 adapter runs two
// `Audio` elements instead). `ErrorDomain` (C3) has no `AUDIO` member, so playback-policy failures
// are swallowed rather than surfaced — audio is non-critical.
//
// The module is loaded LAZILY. `react-native-track-player@4.1.2` ships a legacy native module that
// RN 0.88's New-Architecture interop cannot translate (`TurboModuleInteropUtils` rejects its
// `@ReactMethod` annotations), so merely importing it aborts the JS runtime at boot. Audio is a
// Phase-3 concern (FR-106, gated by `ENABLE_AUDIO_MIXER`), so Phase-1 never touches it and the
// import is deferred to the first playback call.

import type { PlaybackProgressUpdatedEvent, Track } from 'react-native-track-player';
import type { AudioEngineAdapter } from '@breath-and-word/core';

type TrackPlayerModule = typeof import('react-native-track-player');

let trackPlayerPromise: Promise<TrackPlayerModule> | null = null;

/** Resolve the TrackPlayer module on demand; the first successful load is memoised. */
function loadTrackPlayer(): Promise<TrackPlayerModule> {
  if (trackPlayerPromise === null) {
    trackPlayerPromise = import('react-native-track-player').catch((error: unknown) => {
      trackPlayerPromise = null;
      throw error;
    });
  }
  return trackPlayerPromise;
}

type AmbientTrack = 'none' | 'rain' | 'piano' | 'pad';

/** Ambient bed assets shipped in the app bundle (B3 §4.1 `apps/mobile/assets`). */
const AMBIENT_SOURCES: Record<Exclude<AmbientTrack, 'none'>, string> = {
  rain: 'asset:/audio/ambient/rain.mp3',
  piano: 'asset:/audio/ambient/piano.mp3',
  pad: 'asset:/audio/ambient/pad.mp3',
};

function clamp01(volume: number): number {
  if (volume < 0) return 0;
  if (volume > 1) return 1;
  return volume;
}

let setupPromise: Promise<TrackPlayerModule> | null = null;

/** Load TrackPlayer and bring it up once; repeated calls reuse the same setup (B7 cold-start). */
function ensurePlayer(): Promise<TrackPlayerModule> {
  if (setupPromise === null) {
    setupPromise = loadTrackPlayer()
      .then(async (trackPlayer) => {
        await trackPlayer.default.setupPlayer();
        return trackPlayer;
      })
      .catch((error: unknown) => {
        setupPromise = null;
        throw error;
      });
  }
  return setupPromise;
}

/**
 * The requested ambient bed. Held for the future native two-stream mixer; narration is unaffected
 * meanwhile (react-native-track-player drives only one active track).
 */
const ambient: { source: string | null; volume: number } = { source: null, volume: 0 };

export function createAudioAdapter(): AudioEngineAdapter {
  let sleepTimer: ReturnType<typeof setTimeout> | null = null;
  const positionListeners = new Set<(positionMs: number) => void>();

  return {
    async loadChapter(urlOrPath, title, subtitle): Promise<void> {
      const trackPlayer = await ensurePlayer();
      const track: Track = { url: urlOrPath, title, artist: subtitle };
      await trackPlayer.default.load(track);
    },

    async play(): Promise<void> {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.play();
    },

    async pause(): Promise<void> {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.pause();
    },

    async seekTo(ms): Promise<void> {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.seekTo(ms / 1000);
    },

    async setPlaybackRate(rate): Promise<void> {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.setRate(rate);
    },

    async setAmbientTrack(trackId, volume): Promise<void> {
      ambient.source = trackId === 'none' ? null : AMBIENT_SOURCES[trackId];
      ambient.volume = clamp01(volume);
    },

    async setNarrationVolume(volume): Promise<void> {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.setVolume(clamp01(volume));
    },

    async setSleepTimer(minutes): Promise<void> {
      if (sleepTimer !== null) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
      }
      if (minutes === null) return;
      sleepTimer = setTimeout(() => {
        void ensurePlayer()
          .then((trackPlayer) => trackPlayer.default.pause())
          .catch(() => undefined);
        sleepTimer = null;
      }, minutes * 60_000);
    },

    onPositionUpdate(cb): () => void {
      positionListeners.add(cb);
      let subscription: { remove: () => void } | null = null;
      let unsubscribed = false;
      void ensurePlayer()
        .then((trackPlayer) => {
          if (unsubscribed) return;
          subscription = trackPlayer.default.addEventListener(
            trackPlayer.Event.PlaybackProgressUpdated,
            (event: PlaybackProgressUpdatedEvent) => {
              for (const listener of positionListeners) {
                listener(event.position * 1000);
              }
            },
          );
        })
        .catch(() => {
          // Audio is non-critical (C3 has no AUDIO domain); the position stream stays silent.
        });
      return () => {
        unsubscribed = true;
        positionListeners.delete(cb);
        subscription?.remove();
      };
    },
  };
}
