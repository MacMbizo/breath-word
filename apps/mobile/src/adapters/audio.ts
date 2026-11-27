// AudioEngineAdapter — narration over react-native-track-player + ambient bed over expo-audio
// (B3 §4.3, B4 §4.7, FR-106).
//
// Two independent streams make the Ambient Mixer: narration rides the native TrackPlayer (which also
// drives the lock-screen / notification controls) and the looping rain/piano/pad bed plays on its own
// `expo-audio` player, so each has its own volume. The sleep timer fades BOTH streams along the shared
// core curve (`sleepFadeGain`) before pausing. `ErrorDomain` (C3) has no `AUDIO` member, so
// playback-policy failures are swallowed rather than surfaced — audio is non-critical.
//
// Both native modules load LAZILY. `react-native-track-player@4.1.2` ships a legacy native module
// that RN 0.88's New-Architecture interop cannot translate (`TurboModuleInteropUtils` rejects its
// `@ReactMethod` annotations), so merely importing it aborts the JS runtime at boot; deferring the
// imports keeps every non-audio screen independent of the audio stack.

import type { AudioPlayer } from 'expo-audio';
import type { PlaybackProgressUpdatedEvent, Track } from 'react-native-track-player';

import { SLEEP_FADE_STEP_MS, sleepFadeGain, type AudioEngineAdapter } from '@breath-and-word/core';

import padLoop from '../../assets/audio/ambient/pad.wav';
import pianoLoop from '../../assets/audio/ambient/piano.wav';
import rainLoop from '../../assets/audio/ambient/rain.wav';

type TrackPlayerModule = typeof import('react-native-track-player');
type ExpoAudioModule = typeof import('expo-audio');
type AmbientTrack = 'none' | 'rain' | 'piano' | 'pad';

/**
 * Ambient beds bundled in the app (B3 §4.1 `apps/mobile/assets`), generated as seamless loops by
 * `tools/pack-builder/scripts/generate-ambient.mjs`.
 */
const AMBIENT_SOURCES: Record<Exclude<AmbientTrack, 'none'>, number> = {
  rain: rainLoop,
  piano: pianoLoop,
  pad: padLoop,
};

function clamp01(volume: number): number {
  if (volume < 0) return 0;
  if (volume > 1) return 1;
  return volume;
}

/** Memoise a lazy native import; a failed load is retried on the next call. */
function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending === null) {
      pending = load().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}

/** Load TrackPlayer and bring it up once; repeated calls reuse the same setup (B7 cold-start). */
const ensurePlayer = lazy<TrackPlayerModule>(async () => {
  const trackPlayer = await import('react-native-track-player');
  await trackPlayer.default.setupPlayer();
  return trackPlayer;
});

/** expo-audio, with the session set to mix with TrackPlayer's narration instead of interrupting it. */
const ensureExpoAudio = lazy<ExpoAudioModule>(async () => {
  const expoAudio = await import('expo-audio');
  await expoAudio.setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'mixWithOthers',
  });
  return expoAudio;
});

export function createAudioAdapter(): AudioEngineAdapter {
  const positionListeners = new Set<(positionMs: number) => void>();
  let ambientPlayer: AudioPlayer | null = null;
  let ambientTrack: AmbientTrack = 'none';
  let narrationPlaying = false;
  /** User-chosen levels; the applied volume is `level × fade gain`. */
  let narrationLevel = 1;
  let ambientLevel = 0;
  let fadeGain = 1;
  let sleepFade: ReturnType<typeof setInterval> | null = null;

  async function applyVolumes(): Promise<void> {
    if (ambientPlayer !== null) ambientPlayer.volume = clamp01(ambientLevel * fadeGain);
    try {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.setVolume(clamp01(narrationLevel * fadeGain));
    } catch {
      // Narration not available (no player yet); the level is applied on the next load.
    }
  }

  function clearSleepFade(): void {
    if (sleepFade !== null) {
      clearInterval(sleepFade);
      sleepFade = null;
    }
    fadeGain = 1;
  }

  async function pauseAll(): Promise<void> {
    narrationPlaying = false;
    ambientPlayer?.pause();
    const trackPlayer = await ensurePlayer();
    await trackPlayer.default.pause();
  }

  return {
    async loadChapter(urlOrPath, title, subtitle): Promise<void> {
      const trackPlayer = await ensurePlayer();
      const track: Track = { url: urlOrPath, title, artist: subtitle };
      await trackPlayer.default.load(track);
      await applyVolumes();
    },

    async play(): Promise<void> {
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.play();
      narrationPlaying = true;
      ambientPlayer?.play();
    },

    async pause(): Promise<void> {
      await pauseAll();
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
      ambientLevel = clamp01(volume);
      if (trackId === 'none') {
        ambientPlayer?.remove();
        ambientPlayer = null;
        ambientTrack = 'none';
        return;
      }
      try {
        const expoAudio = await ensureExpoAudio();
        if (ambientPlayer === null) {
          ambientPlayer = expoAudio.createAudioPlayer(AMBIENT_SOURCES[trackId]);
        } else if (ambientTrack !== trackId) {
          ambientPlayer.replace(AMBIENT_SOURCES[trackId]);
        }
        ambientPlayer.loop = true;
        ambientTrack = trackId;
        ambientPlayer.volume = clamp01(ambientLevel * fadeGain);
        // The bed follows narration: it only sounds while the passage is playing.
        if (narrationPlaying) ambientPlayer.play();
      } catch {
        // Ambient is decorative; a missing audio module leaves narration untouched.
      }
    },

    async setNarrationVolume(volume): Promise<void> {
      narrationLevel = clamp01(volume);
      await applyVolumes();
    },

    async setSleepTimer(minutes): Promise<void> {
      clearSleepFade();
      await applyVolumes();
      if (minutes === null) return;
      const timerMs = minutes * 60_000;
      const armedAt = Date.now();
      // Full volume until the final stretch, then an even ramp to silence on both streams, then
      // pause and restore the levels so the next listen starts at the chosen volume.
      sleepFade = setInterval(() => {
        const elapsed = Date.now() - armedAt;
        fadeGain = sleepFadeGain(elapsed, timerMs);
        if (elapsed >= timerMs) {
          clearSleepFade();
          void pauseAll()
            .then(applyVolumes)
            .catch(() => undefined);
          return;
        }
        void applyVolumes();
      }, SLEEP_FADE_STEP_MS);
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
