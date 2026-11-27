// FR-106 — Ambient Audio Mini-Player: chapter narration (when the pack has an audio edition) with
// speed 0.8–2.0×, an independent ambient bed (rain / piano / pad) with its own volume, and a sleep
// timer that fades both streams out smoothly. The reader highlights the verse being read.
import { useEffect } from 'react';

import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, type AmbientTrackId } from '@breath-and-word/core';

import { useCoreRuntime } from './CoreRuntime';
import { FIELD } from './study/styles';
import { useCoreStore } from './useCoreStore';

const AMBIENT: readonly { readonly id: AmbientTrackId; readonly label: string }[] = [
  { id: 'none', label: 'No ambience' },
  { id: 'rain', label: 'Rain' },
  { id: 'piano', label: 'Piano' },
  { id: 'pad', label: 'Warm pad' },
];
const RATES = [0.8, 1, 1.25, 1.5, 1.75, 2].filter((r) => r >= MIN_PLAYBACK_RATE && r <= MAX_PLAYBACK_RATE);
const SLEEP_MINUTES = [5, 15, 30, 60] as const;
const SELECT = `${FIELD} w-auto`;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface AudioMiniPlayerProps {
  readonly packId: string;
  readonly translationCode: string;
  readonly bookNumber: number;
  readonly chapter: number;
  readonly reference: string;
}

export function AudioMiniPlayer({ packId, translationCode, bookNumber, chapter, reference }: AudioMiniPlayerProps) {
  const { stores } = useCoreRuntime();
  const audio = useCoreStore(stores.audio);
  const { activeEdition, activeChapter, isPlaying, positionMs, durationMs, playbackRate, narrationVolume } = audio;

  // Load the pack's narration edition (if any) for the open chapter.
  useEffect(() => {
    let live = true;
    void (async () => {
      await stores.audio.getState().loadEditions(packId, translationCode);
      const edition = stores.audio.getState().activeEdition;
      if (!live || edition === null) return;
      await stores.audio.getState().loadChapter({
        translationPackId: packId,
        editionId: edition.editionId,
        bookNumber,
        chapter,
        title: reference,
        subtitle: edition.narratorName,
      });
    })();
    return () => {
      live = false;
    };
  }, [stores, packId, translationCode, bookNumber, chapter, reference]);

  const hasNarration = activeChapter !== null;
  // The ambient bed can play on its own (a quiet backdrop for reading or prayer).
  const canPlay = hasNarration || audio.ambientTrack !== 'none';
  const toggle = () => void (isPlaying ? stores.audio.getState().pause() : stores.audio.getState().play());

  return (
    <section
      className="flex flex-wrap items-center gap-sm rounded-md border border-hairline bg-surface px-md py-sm"
      aria-label="Audio player"
    >
      <button
        type="button"
        disabled={!canPlay}
        onClick={toggle}
        className="rounded-pill bg-accent px-lg py-xs font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-40"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <div className="flex min-w-40 flex-1 flex-col">
        <span className="font-ui text-uiSm text-ink-primary">
          {hasNarration ? `${reference} · ${activeEdition?.narratorName ?? ''}` : 'No narration in this pack — ambience only'}
        </span>
        {hasNarration && (
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, 1)}
            value={positionMs}
            onChange={(e) => void stores.audio.getState().seekTo(Number(e.target.value))}
            aria-label="Position"
            aria-valuetext={`${clock(positionMs)} of ${clock(durationMs)}`}
            className="accent-accent"
          />
        )}
      </div>

      {hasNarration && (
        <>
          <label className="flex items-center gap-xxs font-ui text-uiXs text-ink-secondary">
            Speed
            <select
              className={SELECT}
              value={playbackRate}
              onChange={(e) => void stores.audio.getState().setPlaybackRate(Number(e.target.value))}
            >
              {RATES.map((rate) => (
                <option key={rate} value={rate}>{`${rate}×`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-xxs font-ui text-uiXs text-ink-secondary">
            Voice
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={narrationVolume}
              onChange={(e) => void stores.audio.getState().setNarrationVolume(Number(e.target.value))}
              aria-label="Narration volume"
              className="w-20 accent-accent"
            />
          </label>
        </>
      )}

      <label className="flex items-center gap-xxs font-ui text-uiXs text-ink-secondary">
        Ambience
        <select
          className={SELECT}
          value={audio.ambientTrack}
          onChange={(e) => void stores.audio.getState().setAmbientTrack(e.target.value as AmbientTrackId)}
        >
          {AMBIENT.map((track) => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
      </label>
      {audio.ambientTrack !== 'none' && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={audio.ambientVolume}
          onChange={(e) => void stores.audio.getState().setAmbientTrack(audio.ambientTrack, Number(e.target.value))}
          aria-label="Ambience volume"
          className="w-20 accent-accent"
        />
      )}

      <label className="flex items-center gap-xxs font-ui text-uiXs text-ink-secondary">
        Sleep
        <select
          className={SELECT}
          value={audio.sleepTimerMinutes ?? 0}
          onChange={(e) => {
            const minutes = Number(e.target.value);
            void stores.audio.getState().setSleepTimer(minutes > 0 ? minutes : null);
          }}
        >
          <option value={0}>Off</option>
          {SLEEP_MINUTES.map((minutes) => (
            <option key={minutes} value={minutes}>{`${minutes} min`}</option>
          ))}
        </select>
      </label>

      {audio.error !== null && (
        <p className="w-full font-ui text-uiXs text-ink-red" role="alert">
          {audio.error.userMessage}
        </p>
      )}
    </section>
  );
}
