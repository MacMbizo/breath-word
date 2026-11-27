// FR-305 (mobile) — portable vector ink canvas on Skia, driven by a gesture-handler Pan (finger or
// Apple Pencil / stylus, with pressure when the device reports it). Points are normalized 0..1000
// (ADR-003) and rendered through the same core path/width helpers desktop uses, on the same fixed 4:3
// daylight paper plate, so a sketch keeps identical proportions on every device it syncs to.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { Canvas, Path } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  inkStrokeToSvgPath,
  inkStrokeWidthToPixels,
  pixelToNormalizedPoint,
  type InkStroke,
  type InkStrokePoint,
} from '@breath-and-word/core';
import { COLORS, INDUCTIVE_HIGHLIGHTS, MIN_TOUCH_TARGET, RADII } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { study, THEME } from './studyStyles';

const PAPER = COLORS.daylight;
const PENS: readonly { readonly label: string; readonly color: string }[] = [
  { label: 'Ink', color: PAPER.text.primary },
  { label: 'Red', color: INDUCTIVE_HIGHLIGHTS.COMMAND.darkWash },
  { label: 'Blue', color: INDUCTIVE_HIGHLIGHTS.PROMISE.darkWash },
  { label: 'Green', color: INDUCTIVE_HIGHLIGHTS.TRANSITION.darkWash },
  { label: 'Violet', color: INDUCTIVE_HIGHLIGHTS.GOD_REF.darkWash },
];
const WIDTHS = [
  { width: 2, label: 'Fine' },
  { width: 4, label: 'Medium' },
  { width: 8, label: 'Bold' },
] as const;
/** Fixed sheet aspect (4:3) shared with desktop. */
const ASPECT = 3 / 4;

let strokeCounter = 0;
function nextStrokeId(): string {
  strokeCounter += 1;
  return `stroke-${Date.now().toString(36)}-${strokeCounter}`;
}

export interface InkSketchProps {
  readonly userId: string;
  readonly verseId: number;
  readonly reference: string;
}

export function InkSketch({ userId, verseId, reference }: InkSketchProps) {
  const { stores } = useCoreRuntime();
  const { inkCanvases, error } = useCoreStore(stores.study);
  const [width, setWidth] = useState(0);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const [pen, setPen] = useState(PENS[0]!.color);
  const [penWidth, setPenWidth] = useState<number>(4);
  const [dirty, setDirty] = useState(false);
  const startedAt = useRef(0);
  /** The stroke being drawn; a ref so gesture callbacks never race React's batched state. */
  const draftRef = useRef<InkStroke | null>(null);
  const height = width * ASPECT;

  const canvas = inkCanvases.find((c) => c.canonicalVerseId === verseId) ?? null;

  useEffect(() => {
    void stores.study.getState().loadInkForVerse(userId, verseId);
  }, [stores, userId, verseId]);

  useEffect(() => {
    if (!dirty) setStrokes(canvas?.strokes ?? []);
  }, [canvas, dirty]);

  const gesture = useMemo(() => {
    const point = (x: number, y: number, pressure: number | undefined): InkStrokePoint =>
      pixelToNormalizedPoint(x, y, width, height, pressure ?? 0.5, Math.round(Date.now() - startedAt.current));
    // Sketching updates React state per sample, so it runs on the JS thread (no worklet needed).
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((event) => {
        startedAt.current = Date.now();
        const pressure = (event as { stylusData?: { pressure?: number } }).stylusData?.pressure;
        draftRef.current = { id: nextStrokeId(), colorHex: pen, width: penWidth, points: [point(event.x, event.y, pressure)] };
        setDraft(draftRef.current);
      })
      .onUpdate((event) => {
        const current = draftRef.current;
        if (current === null) return;
        const pressure = (event as { stylusData?: { pressure?: number } }).stylusData?.pressure;
        draftRef.current = { ...current, points: [...current.points, point(event.x, event.y, pressure)] };
        setDraft(draftRef.current);
      })
      .onFinalize(() => {
        const finished = draftRef.current;
        draftRef.current = null;
        setDraft(null);
        if (finished !== null) {
          setStrokes((existing) => [...existing, finished]);
          setDirty(true);
        }
      });
  }, [width, height, pen, penWidth]);

  async function save() {
    const saved = await stores.study.getState().saveInkCanvas({
      ...(canvas !== null ? { id: canvas.id } : {}),
      userId,
      canonicalVerseId: verseId,
      strokes,
    });
    if (saved !== null) setDirty(false);
  }

  async function clear() {
    if (canvas !== null) await stores.study.getState().removeInkCanvas(canvas.id, userId);
    setStrokes([]);
    setDirty(false);
  }

  const rendered = draft !== null ? [...strokes, draft] : strokes;

  return (
    <View style={study.section}>
      <Text style={study.heading}>{`Sketch · ${reference}`}</Text>
      {error !== null && (
        <Text accessibilityRole="alert" style={study.error}>
          {error.userMessage}
        </Text>
      )}
      <View style={study.wrap}>
        {PENS.map((option) => (
          <Pressable
            key={option.label}
            onPress={() => setPen(option.color)}
            accessibilityRole="button"
            accessibilityLabel={`${option.label} pen`}
            accessibilityState={{ selected: pen === option.color }}
            style={{
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              borderRadius: RADII.pill,
              borderWidth: 2,
              borderColor: pen === option.color ? THEME.accent.primary : THEME.border.subtle,
              backgroundColor: option.color,
            }}
          />
        ))}
      </View>
      <View style={study.wrap}>
        {WIDTHS.map((option) => (
          <Pressable
            key={option.width}
            onPress={() => setPenWidth(option.width)}
            accessibilityRole="button"
            accessibilityState={{ selected: penWidth === option.width }}
            style={[study.chip, penWidth === option.width && study.chipActive]}
          >
            <Text style={study.chipText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          style={{
            height,
            borderRadius: RADII.md,
            borderWidth: 1,
            borderColor: THEME.border.subtle,
            backgroundColor: PAPER.bg.surface,
            overflow: 'hidden',
          }}
          accessibilityRole="image"
          accessibilityLabel={`Ink sketch for ${reference}, ${strokes.length} strokes`}
        >
          {width > 0 && (
            <Canvas style={{ width, height }}>
              {rendered.map((stroke) => (
                <Path
                  key={stroke.id}
                  path={inkStrokeToSvgPath(stroke, width, height)}
                  color={stroke.colorHex}
                  style="stroke"
                  strokeWidth={inkStrokeWidthToPixels(stroke.width, width)}
                  strokeCap="round"
                  strokeJoin="round"
                />
              ))}
            </Canvas>
          )}
        </View>
      </GestureDetector>

      <View style={[study.row, { justifyContent: 'space-between' }]}>
        <View style={study.row}>
          <Pressable
            disabled={strokes.length === 0}
            onPress={() => {
              setStrokes((current) => current.slice(0, -1));
              setDirty(true);
            }}
            accessibilityRole="button"
            style={[study.button, strokes.length === 0 && study.disabled]}
          >
            <Text style={study.buttonText}>Undo</Text>
          </Pressable>
          <Pressable
            disabled={strokes.length === 0 && canvas === null}
            onPress={() => void clear()}
            accessibilityRole="button"
            style={[study.button, strokes.length === 0 && canvas === null && study.disabled]}
          >
            <Text style={study.buttonText}>Clear</Text>
          </Pressable>
        </View>
        <Pressable
          disabled={!dirty}
          onPress={() => void save()}
          accessibilityRole="button"
          style={[study.primaryButton, !dirty && study.disabled]}
        >
          <Text style={study.primaryButtonText}>{dirty ? 'Save sketch' : 'Saved'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
