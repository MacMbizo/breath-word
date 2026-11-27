// FR-106 (mobile) — Ambient Audio Mini-Player docked under the reader: chapter narration (when the
// pack carries an audio edition) with 0.8–2.0× speed, an independent ambient bed with its own volume,
// and a sleep timer that fades both streams out. The reader marks the verse being narrated.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, type AmbientTrackId } from '@breath-and-word/core';
import { SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useTheme } from '../theme/ThemeProvider';

import { useStudy } from './study/studyStyles';
import { useCoreStore } from './useCoreStore';

const AMBIENT: readonly { readonly id: AmbientTrackId; readonly label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'piano', label: 'Piano' },
  { id: 'pad', label: 'Pad' },
];
const RATES = [0.8, 1, 1.25, 1.5, 2].filter((r) => r >= MIN_PLAYBACK_RATE && r <= MAX_PLAYBACK_RATE);
const SLEEP: readonly (number | null)[] = [null, 15, 30, 60];
const VOLUME_STEP = 0.1;

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  const study = useStudy();
  return (
    <View style={study.row} accessibilityLabel={`${label} ${Math.round(value * 100)} percent`}>
      <Text style={study.muted}>{label}</Text>
      <Pressable
        onPress={() => onChange(Math.max(0, value - VOLUME_STEP))}
        accessibilityRole="button"
        accessibilityLabel={`${label} quieter`}
        style={study.button}
      >
        <Text style={study.buttonText}>−</Text>
      </Pressable>
      <Text style={study.muted}>{`${Math.round(value * 100)}%`}</Text>
      <Pressable
        onPress={() => onChange(Math.min(1, value + VOLUME_STEP))}
        accessibilityRole="button"
        accessibilityLabel={`${label} louder`}
        style={study.button}
      >
        <Text style={study.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

export interface AudioMiniPlayerProps {
  readonly packId: string;
  readonly translationCode: string;
  readonly bookNumber: number;
  readonly chapter: number;
  readonly reference: string;
}

export function AudioMiniPlayer({ packId, translationCode, bookNumber, chapter, reference }: AudioMiniPlayerProps) {
  const study = useStudy();
  const { colors: THEME } = useTheme();
  const { stores } = useCoreRuntime();
  const audio = useCoreStore(stores.audio);
  const [expanded, setExpanded] = useState(false);

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

  const hasNarration = audio.activeChapter !== null;
  const canPlay = hasNarration || audio.ambientTrack !== 'none';
  const audioStore = stores.audio.getState();

  return (
    <View
      style={{
        gap: SPACING.sm,
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.sm,
        borderTopWidth: 1,
        borderTopColor: THEME.border.subtle,
        backgroundColor: THEME.bg.surface,
      }}
      accessibilityLabel="Audio player"
    >
      <View style={[study.row, { justifyContent: 'space-between' }]}>
        <Pressable
          disabled={!canPlay}
          onPress={() => void (audio.isPlaying ? audioStore.pause() : audioStore.play())}
          accessibilityRole="button"
          style={[study.primaryButton, !canPlay && study.disabled]}
        >
          <Text style={study.primaryButtonText}>{audio.isPlaying ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Text style={[study.muted, { flex: 1 }]} numberOfLines={1}>
          {hasNarration ? `${reference} · ${audio.activeEdition?.narratorName ?? ''}` : 'Ambience (no narration in this pack)'}
        </Text>
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel="Audio settings"
          style={study.button}
        >
          <Text style={study.buttonText}>{expanded ? 'Less' : 'Mixer'}</Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={{ gap: SPACING.sm }}>
          <View style={study.wrap}>
            {AMBIENT.map((track) => (
              <Pressable
                key={track.id}
                onPress={() => void audioStore.setAmbientTrack(track.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: audio.ambientTrack === track.id }}
                accessibilityLabel={`Ambience ${track.label}`}
                style={[study.chip, audio.ambientTrack === track.id && study.chipActive]}
              >
                <Text style={study.chipText}>{track.label}</Text>
              </Pressable>
            ))}
          </View>
          {audio.ambientTrack !== 'none' && (
            <Stepper
              label="Ambience"
              value={audio.ambientVolume}
              onChange={(v) => void audioStore.setAmbientTrack(audio.ambientTrack, v)}
            />
          )}
          {hasNarration && (
            <>
              <Stepper label="Voice" value={audio.narrationVolume} onChange={(v) => void audioStore.setNarrationVolume(v)} />
              <View style={study.wrap}>
                {RATES.map((rate) => (
                  <Pressable
                    key={rate}
                    onPress={() => void audioStore.setPlaybackRate(rate)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: audio.playbackRate === rate }}
                    accessibilityLabel={`Speed ${rate}`}
                    style={[study.chip, audio.playbackRate === rate && study.chipActive]}
                  >
                    <Text style={study.chipText}>{`${rate}×`}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <View style={study.wrap}>
            {SLEEP.map((minutes) => (
              <Pressable
                key={minutes ?? 'off'}
                onPress={() => void audioStore.setSleepTimer(minutes)}
                accessibilityRole="button"
                accessibilityState={{ selected: audio.sleepTimerMinutes === minutes }}
                style={[study.chip, audio.sleepTimerMinutes === minutes && study.chipActive]}
              >
                <Text style={study.chipText}>{minutes === null ? 'No sleep timer' : `Sleep ${minutes} min`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {audio.error !== null && (
        <Text accessibilityRole="alert" style={study.error}>
          {audio.error.userMessage}
        </Text>
      )}
    </View>
  );
}
