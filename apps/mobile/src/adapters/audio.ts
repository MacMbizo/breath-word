// AudioEngineAdapter — narration over react-native-track-player (B3 §4.3, B4 §4.7).
//
// Narration rides the native player (TrackPlayer), which also drives the lock-screen / notification
// controls. react-native-track-player owns a single active track, so the ambient beds
// (rain/piano/pad) — which must play *simultaneously* with narration — are recorded but not yet
// rendered: a two-stream native mixer is out of Gate-1 scope (the desktop HTML5 adapter runs two
// `Audio` elements instead). `ErrorDomain` (C3) has no `AUDIO` member, so playback-policy failures
// are swallowed rather than surfaced — audio is non-critical.

import TrackPlayer, {
  Event,
  type PlaybackProgressUpdatedEvent,
  type Track,
} from 'react-native-track-player';
import type { AudioEngineAdapter } from '@breath-and-word/core';

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

let setupPromise: Promise<void> | null = null;

/** Bring TrackPlayer up once; repeated calls reuse the same setup (B7 cold-start guardrails). */
function ensurePlayer(): Promise<void> {
  if (setupPromise === null) {
    setupPromise = TrackPlayer.setupPlayer().catch((error: unknown) => {
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
      await ensurePlayer();
      const track: Track = { url: urlOrPath, title, artist: subtitle };
      await TrackPlayer.load(track);
    },

    async play(): Promise<void> {
      await ensurePlayer();
      await TrackPlayer.play();
    },

    async pause(): Promise<void> {
      await TrackPlayer.pause();
    },

    async seekTo(ms): Promise<void> {
      await TrackPlayer.seekTo(ms / 1000);
    },

    async setPlaybackRate(rate): Promise<void> {
      await TrackPlayer.setRate(rate);
    },

    async setAmbientTrack(trackId, volume): Promise<void> {
      ambient.source = trackId === 'none' ? null : AMBIENT_SOURCES[trackId];
      ambient.volume = clamp01(volume);
    },

    async setNarrationVolume(volume): Promise<void> {
      await TrackPlayer.setVolume(clamp01(volume));
    },

    async setSleepTimer(minutes): Promise<void> {
      if (sleepTimer !== null) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
      }
      if (minutes === null) return;
      sleepTimer = setTimeout(() => {
        void TrackPlayer.pause();
        sleepTimer = null;
      }, minutes * 60_000);
    },

    onPositionUpdate(cb): () => void {
      positionListeners.add(cb);
      const subscription = TrackPlayer.addEventListener(
        Event.PlaybackProgressUpdated,
        (event: PlaybackProgressUpdatedEvent) => {
          for (const listener of positionListeners) {
            listener(event.position * 1000);
          }
        },
      );
      return () => {
        positionListeners.delete(cb);
        subscription.remove();
      };
    },
  };
}
