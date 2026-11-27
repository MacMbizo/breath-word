// FR-303 (mobile) — Passage Guide (genre, top-voted cross-references, people & places) and the
// Factbook dossier with an offline locator (Skia; no map tiles, no network).
import { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';

import { SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { useTheme } from '../../theme/ThemeProvider';

import { useStudy } from './studyStyles';

export interface PassageGuideSectionProps {
  readonly startVerseId: number;
  readonly endVerseId: number;
  readonly translationPackId: string;
  readonly onOpenVerse: (canonicalVerseId: number) => void;
}

/** Bible-lands frame shared with desktop's locator. */
const MAP = { west: 12, east: 50, south: 22, north: 44 };
const MAP_ASPECT = 140 / 240;

function Locator({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { colors: THEME } = useTheme();
  const [width, setWidth] = useState(0);
  const height = width * MAP_ASPECT;
  const px = (lon: number) => ((lon - MAP.west) / (MAP.east - MAP.west)) * width;
  const py = (lat: number) => ((MAP.north - lat) / (MAP.north - MAP.south)) * height;
  const x = px(Math.min(Math.max(longitude, MAP.west), MAP.east));
  const y = py(Math.min(Math.max(latitude, MAP.south), MAP.north));
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: SPACING.sm, overflow: 'hidden', backgroundColor: THEME.bg.elevated }}
      accessibilityRole="image"
      accessibilityLabel={`Location ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`}
    >
      {width > 0 && (
        <Canvas style={{ width, height }}>
          {[15, 20, 25, 30, 35, 40, 45].map((lon) => (
            <Line key={`m${lon}`} p1={vec(px(lon), 0)} p2={vec(px(lon), height)} color={THEME.border.subtle} strokeWidth={1} />
          ))}
          {[25, 30, 35, 40].map((lat) => (
            <Line key={`p${lat}`} p1={vec(0, py(lat))} p2={vec(width, py(lat))} color={THEME.border.subtle} strokeWidth={1} />
          ))}
          <Circle cx={x} cy={y} r={SPACING.md} color={THEME.accent.primary} opacity={0.25} />
          <Circle cx={x} cy={y} r={SPACING.xs + 1} color={THEME.accent.primary} />
        </Canvas>
      )}
    </View>
  );
}

export function PassageGuideSection({ startVerseId, endVerseId, translationPackId, onOpenVerse }: PassageGuideSectionProps) {
  const study = useStudy();
  const { stores } = useCoreRuntime();
  const { passageGuide, activeDossier, error } = useCoreStore(stores.study);

  useEffect(() => {
    void stores.study.getState().loadPassageGuide(startVerseId, endVerseId, translationPackId);
  }, [stores, startVerseId, endVerseId, translationPackId]);

  const guide =
    passageGuide !== null && passageGuide.startVerseId === startVerseId && passageGuide.endVerseId === endVerseId
      ? passageGuide
      : null;

  return (
    <View style={study.section}>
      {error !== null && (
        <Text accessibilityRole="alert" style={study.error}>
          {error.userMessage}
        </Text>
      )}
      {guide !== null && (
        <>
          <View style={[study.row, { justifyContent: 'space-between' }]}>
            <Text style={study.heading}>{`Passage Guide · ${guide.passageReference}`}</Text>
            {guide.literaryGenre !== undefined && (
              <Text style={study.muted}>{guide.literaryGenre.replace(/_/g, ' ').toLowerCase()}</Text>
            )}
          </View>
          <View style={study.card}>
            <Text style={study.heading}>Cross-references</Text>
            {guide.crossReferences.length === 0 && <Text style={study.muted}>No cross-references for this passage.</Text>}
            {guide.crossReferences.map((ref) => (
              <Pressable
                key={ref.id}
                onPress={() => onOpenVerse(ref.toStartVerseId)}
                accessibilityRole="link"
                style={[study.row, { justifyContent: 'space-between', minHeight: SPACING.xxxl - SPACING.sm }]}
              >
                <Text style={study.link}>{ref.passageReference}</Text>
                <Text style={study.muted}>{`${ref.votes} votes`}</Text>
              </Pressable>
            ))}
          </View>
          {guide.entities.length > 0 && (
            <View style={study.section}>
              <Text style={study.heading}>People & places</Text>
              <View style={study.wrap}>
                {guide.entities.map((entity) => (
                  <Pressable
                    key={entity.entityId}
                    onPress={() => void stores.study.getState().openFactbookEntity(entity.entityId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${entity.name}, ${entity.entityType}`}
                    style={[study.chip, activeDossier?.entity.entityId === entity.entityId && study.chipActive]}
                  >
                    <Text style={study.chipText}>{entity.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {activeDossier !== null && (
        <View style={study.card} accessibilityLabel={`Factbook: ${activeDossier.entity.name}`}>
          <View style={[study.row, { justifyContent: 'space-between' }]}>
            <Text style={study.title}>{activeDossier.entity.name}</Text>
            <Text style={study.muted}>{activeDossier.entity.entityType}</Text>
          </View>
          {activeDossier.entity.aliases.length > 0 && (
            <Text style={study.muted}>{`Also: ${activeDossier.entity.aliases.join(', ')}`}</Text>
          )}
          {activeDossier.entity.eraLabel !== undefined && <Text style={study.muted}>{activeDossier.entity.eraLabel}</Text>}
          <Text style={study.body}>{activeDossier.entity.summary}</Text>
          {activeDossier.entity.latitude !== undefined && activeDossier.entity.longitude !== undefined && (
            <View style={{ gap: SPACING.xxs }}>
              <Locator latitude={activeDossier.entity.latitude} longitude={activeDossier.entity.longitude} />
              <Text style={study.muted}>
                {`${activeDossier.entity.latitude.toFixed(3)}°, ${activeDossier.entity.longitude.toFixed(3)}°`}
              </Text>
            </View>
          )}
          <Text style={study.heading}>{`Occurrences · ${activeDossier.verseIds.length}`}</Text>
          <View style={study.wrap}>
            {activeDossier.verseIds.slice(0, 40).map((id, index) => (
              <Pressable
                key={id}
                onPress={() => onOpenVerse(id)}
                accessibilityRole="link"
                style={{ paddingVertical: SPACING.xs, paddingRight: SPACING.sm }}
              >
                <Text style={study.link}>{activeDossier.references[index] ?? String(id)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
