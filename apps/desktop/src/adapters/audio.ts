// AudioEngineAdapter — dual-track narration + ambient audio over HTML5 `Audio` (B3 §4.3).
//
// Narration is one `Audio` element; ambient beds (rain/piano/pad) are a second, looping element.
// Playback-policy rejections (the browser requiring a user gesture) are swallowed rather than
// surfaced — audio is non-critical and `ErrorDomain` has no `AUDIO` member (C3), so there is no
// canonical error to raise. Sleep timer pauses both tracks after the requested delay.

import type { AudioEngineAdapter } from '@breath-and-word/core';

type AmbientTrack = 'none' | 'rain' | 'piano' | 'pad';

/** Ambient bed assets shipped with the app bundle (B3 §4.1 `apps/desktop/public`). */
const AMBIENT_SOURCES: Record<Exclude<AmbientTrack, 'none'>, string> = {
  rain: '/audio/ambient/rain.mp3',
  piano: '/audio/ambient/piano.mp3',
  pad: '/audio/ambient/pad.mp3',
};

function clamp01(volume: number): number {
  if (volume < 0) return 0;
  if (volume > 1) return 1;
  return volume;
}

/** Autoplay may be blocked until the user interacts; never let that reject the adapter call. */
function ignorePlaybackRejection(playback: Promise<void> | undefined): void {
  if (playback === undefined) return;
  void playback.catch(() => undefined);
}

export function createAudioAdapter(): AudioEngineAdapter {
  let narration: HTMLAudioElement | null = null;
  let ambient: HTMLAudioElement | null = null;
  let sleepTimer: ReturnType<typeof setTimeout> | null = null;
  const positionListeners = new Set<(positionMs: number) => void>();

  function emitPosition(positionMs: number): void {
    for (const listener of positionListeners) {
      listener(positionMs);
    }
  }

  return {
    async loadChapter(urlOrPath, title, subtitle): Promise<void> {
      narration?.pause();
      const element = new Audio(urlOrPath);
      element.preload = 'auto';
      // Surface the chapter metadata on the element for now-playing UI / media session.
      element.dataset['bwTitle'] = title;
      element.dataset['bwSubtitle'] = subtitle;
      element.addEventListener('timeupdate', () => emitPosition(element.currentTime * 1000));
      narration = element;
    },

    async play(): Promise<void> {
      ignorePlaybackRejection(narration?.play());
      ignorePlaybackRejection(ambient?.play());
    },

    async pause(): Promise<void> {
      narration?.pause();
      ambient?.pause();
    },

    async seekTo(ms): Promise<void> {
      if (narration !== null) {
        narration.currentTime = ms / 1000;
      }
    },

    async setPlaybackRate(rate): Promise<void> {
      if (narration !== null) {
        narration.playbackRate = rate;
      }
    },

    async setAmbientTrack(trackId, volume): Promise<void> {
      if (trackId === 'none') {
        ambient?.pause();
        ambient = null;
        return;
      }
      const source = AMBIENT_SOURCES[trackId];
      if (ambient === null || ambient.getAttribute('src') !== source) {
        ambient?.pause();
        ambient = new Audio(source);
        ambient.loop = true;
      }
      ambient.volume = clamp01(volume);
      if (narration !== null && !narration.paused) {
        ignorePlaybackRejection(ambient.play());
      }
    },

    async setNarrationVolume(volume): Promise<void> {
      if (narration !== null) {
        narration.volume = clamp01(volume);
      }
    },

    async setSleepTimer(minutes): Promise<void> {
      if (sleepTimer !== null) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
      }
      if (minutes === null) return;
      sleepTimer = setTimeout(() => {
        narration?.pause();
        ambient?.pause();
        sleepTimer = null;
      }, minutes * 60_000);
    },

    onPositionUpdate(cb): () => void {
      positionListeners.add(cb);
      return () => {
        positionListeners.delete(cb);
      };
    },
  };
}
