// AudioEngineAdapter — narration over react-native-track-player + ambient bed over expo-audio
// (B3 §4.3, B4 §4.7, FR-106).
//
// Two independent streams make the Ambient Mixer: narration rides the native TrackPlayer (which also
// drives the lock-screen / notification controls) and the looping rain/piano/pad bed plays on its own
// `expo-audio` player, so each has its own volume. The sleep timer fades BOTH streams along the shared
// core curve (`sleepFadeGain`) before pausing. `ErrorDomain` (C3) has no `AUDIO` member, so
// playback-policy failures are swallowed rather than surfaced — audio is non-critical.
//
// TrackPlayer loads LAZILY, only once a narration chapter is opened. `react-native-track-player@4.1.2` ships a legacy native module
// that RN 0.88's New-Architecture interop cannot translate (`TurboModuleInteropUtils` rejects its
// `@ReactMethod` annotations), so merely importing it aborts the JS runtime at boot; deferring it keeps
// every screen (and the ambient bed) independent of it. expo-audio supports the New Architecture and is
// imported directly.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { PlaybackProgressUpdatedEvent, Track } from 'react-native-track-player';

import { SLEEP_FADE_STEP_MS, sleepFadeGain, type AudioEngineAdapter } from '@breath-and-word/core';

import padLoop from '../../assets/audio/ambient/pad.wav';
import pianoLoop from '../../assets/audio/ambient/piano.wav';
import rainLoop from '../../assets/audio/ambient/rain.wav';

type TrackPlayerModule = typeof import('react-native-track-player');
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

/**
 * Set the audio session once (mix with TrackPlayer's narration instead of interrupting it). Never
 * awaited by playback: if the platform is slow or refuses a mode, the ambient bed still plays.
 */
let audioModeSet = false;
function ensureAudioMode(): void {
  if (audioModeSet) return;
  audioModeSet = true;
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {
    audioModeSet = false;
  });
}

export function createAudioAdapter(): AudioEngineAdapter {
  const positionListeners = new Set<(positionMs: number) => void>();
  let ambientPlayer: AudioPlayer | null = null;
  let ambientTrack: AmbientTrack = 'none';
  /** True between play() and pause(): the ambient bed follows this, with or without narration. */
  let playing = false;
  /** Whether a narration chapter is loaded (many packs have none; ambience then plays alone). */
  let narrationLoaded = false;
  /** User-chosen levels; the applied volume is `level × fade gain`. */
  let narrationLevel = 1;
  let ambientLevel = 0;
  let fadeGain = 1;
  let sleepFade: ReturnType<typeof setInterval> | null = null;
  /** One shared narration progress subscription, attached when a chapter loads. */
  let progressSubscription: { remove: () => void } | null = null;

  function attachProgress(trackPlayer: TrackPlayerModule): void {
    if (progressSubscription !== null) return;
    progressSubscription = trackPlayer.default.addEventListener(
      trackPlayer.Event.PlaybackProgressUpdated,
      (event: PlaybackProgressUpdatedEvent) => {
        for (const listener of positionListeners) {
          listener(event.position * 1000);
        }
      },
    );
  }

  async function applyVolumes(): Promise<void> {
    if (ambientPlayer !== null) ambientPlayer.volume = clamp01(ambientLevel * fadeGain);
    // TrackPlayer is only loaded once a narration chapter is: on RN 0.88's new architecture merely
    // importing react-native-track-player 4.x throws, which must never take ambience down with it.
    if (!narrationLoaded) return;
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
    playing = false;
    ambientPlayer?.pause();
    if (!narrationLoaded) return;
    const trackPlayer = await ensurePlayer();
    await trackPlayer.default.pause();
  }

  return {
    async loadChapter(urlOrPath, title, subtitle): Promise<void> {
      const trackPlayer = await ensurePlayer();
      const track: Track = { url: urlOrPath, title, artist: subtitle };
      await trackPlayer.default.load(track);
      narrationLoaded = true;
      attachProgress(trackPlayer);
      await applyVolumes();
    },

    async play(): Promise<void> {
      playing = true;
      ambientPlayer?.play();
      if (!narrationLoaded) return;
      const trackPlayer = await ensurePlayer();
      await trackPlayer.default.play();
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
        ensureAudioMode();
        if (ambientPlayer === null) {
          ambientPlayer = createAudioPlayer(AMBIENT_SOURCES[trackId]);
        } else if (ambientTrack !== trackId) {
          ambientPlayer.replace(AMBIENT_SOURCES[trackId]);
        }
        ambientPlayer.loop = true;
        ambientTrack = trackId;
        ambientPlayer.volume = clamp01(ambientLevel * fadeGain);
        // The bed follows the play state, so it can also sound on its own (no narration).
        if (playing) ambientPlayer.play();
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
      // No TrackPlayer here: the shared subscription is attached by loadChapter (see applyVolumes).
      positionListeners.add(cb);
      return () => {
        positionListeners.delete(cb);
      };
    },
  };
}
