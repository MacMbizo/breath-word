// FR-305 — portable vector ink canvas (desktop: SVG + pointer events; pen pressure when available).
// Points are stored normalized 0..1000 (ADR-003) and rendered with the same core path/width helpers
// Skia uses on mobile, so a sketch keeps its proportions on every device. The sheet sits on a fixed
// daylight "paper" plate in every theme so the ink colours stay legible wherever it syncs.
import { useEffect, useRef, useState, type PointerEvent } from 'react';

import {
  inkStrokeToSvgPath,
  inkStrokeWidthToPixels,
  pixelToNormalizedPoint,
  type InkStroke,
  type InkStrokePoint,
} from '@breath-and-word/core';
import { COLORS, INDUCTIVE_HIGHLIGHTS } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { BUTTON, PANEL_HEADING, PRIMARY_BUTTON } from './styles';

const PAPER = COLORS.parchment;
/** Pen colours: the paper's ink plus the strong inductive hues (all from tokens). */
const PENS: readonly { readonly label: string; readonly color: string }[] = [
  { label: 'Ink', color: PAPER.text.primary },
  { label: 'Red', color: INDUCTIVE_HIGHLIGHTS.COMMAND.darkWash },
  { label: 'Blue', color: INDUCTIVE_HIGHLIGHTS.PROMISE.darkWash },
  { label: 'Green', color: INDUCTIVE_HIGHLIGHTS.TRANSITION.darkWash },
  { label: 'Violet', color: INDUCTIVE_HIGHLIGHTS.GOD_REF.darkWash },
];
const WIDTHS = [2, 4, 8] as const;
/** Fixed sheet aspect (4:3) shared with mobile, so normalized x/y mean the same thing everywhere. */
const ASPECT = 3 / 4;

export interface InkCanvasProps {
  readonly userId: string;
  readonly verseId: number;
  readonly reference: string;
}

export function InkCanvas({ userId, verseId, reference }: InkCanvasProps) {
  const { stores } = useCoreRuntime();
  const { inkCanvases, error } = useCoreStore(stores.study);
  const surface = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(480);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const [pen, setPen] = useState(PENS[0]!.color);
  const [penWidth, setPenWidth] = useState<number>(4);
  const [dirty, setDirty] = useState(false);
  const startedAt = useRef(0);

  const canvas = inkCanvases.find((c) => c.canonicalVerseId === verseId) ?? null;
  const height = Math.round(width * ASPECT);

  useEffect(() => {
    void stores.study.getState().loadInkForVerse(userId, verseId);
  }, [stores, userId, verseId]);

  // Show the saved sketch whenever it (re)loads, unless the user has unsaved strokes.
  useEffect(() => {
    if (!dirty) setStrokes(canvas?.strokes ?? []);
  }, [canvas, dirty]);

  useEffect(() => {
    const element = surface.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function pointFrom(event: PointerEvent<SVGSVGElement>): InkStrokePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return pixelToNormalizedPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
      event.pressure > 0 ? event.pressure : 0.5,
      Math.round(performance.now() - startedAt.current),
    );
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    startedAt.current = performance.now();
    setDraft({ id: crypto.randomUUID(), colorHex: pen, width: penWidth, points: [pointFrom(event)] });
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (draft === null) return;
    const point = pointFrom(event);
    setDraft({ ...draft, points: [...draft.points, point] });
  }

  function onPointerUp() {
    if (draft === null) return;
    setStrokes((current) => [...current, draft]);
    setDraft(null);
    setDirty(true);
  }

  async function save() {
    const saved = await stores.study.getState().saveInkCanvas({
      ...(canvas !== null ? { id: canvas.id } : {}),
      userId,
      canonicalVerseId: verseId,
      strokes,
    });
    if (saved !== null) setDirty(false);
  }

  async function discardCanvas() {
    if (canvas !== null) await stores.study.getState().removeInkCanvas(canvas.id, userId);
    setStrokes([]);
    setDirty(false);
  }

  const rendered = draft !== null ? [...strokes, draft] : strokes;

  return (
    <div className="flex flex-col gap-sm">
      <h3 className={PANEL_HEADING}>{`Sketch · ${reference}`}</h3>
      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-xs">
        {PENS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-label={`${option.label} pen`}
            aria-pressed={pen === option.color}
            onClick={() => setPen(option.color)}
            className={`h-lg w-lg rounded-pill border-2 ${pen === option.color ? 'border-accent' : 'border-hairline'}`}
            style={{ backgroundColor: option.color }}
          />
        ))}
        <span className="mx-xs h-lg border-l border-hairline" aria-hidden />
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={penWidth === w}
            onClick={() => setPenWidth(w)}
            className={`${BUTTON} ${penWidth === w ? 'border-accent text-ink-primary' : ''}`}
          >
            {w === 2 ? 'Fine' : w === 4 ? 'Medium' : 'Bold'}
          </button>
        ))}
      </div>

      <svg
        ref={surface}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="touch-none rounded-md border border-hairline"
        style={{ backgroundColor: PAPER.bg.surface, cursor: 'crosshair' }}
        role="img"
        aria-label={`Ink sketch for ${reference}, ${strokes.length} stroke${strokes.length === 1 ? '' : 's'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {rendered.map((stroke) => (
          <path
            key={stroke.id}
            d={inkStrokeToSvgPath(stroke, width, height)}
            fill="none"
            stroke={stroke.colorHex}
            strokeWidth={inkStrokeWidthToPixels(stroke.width, width)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div className="flex justify-between gap-xs">
        <div className="flex gap-xs">
          <button
            type="button"
            className={BUTTON}
            disabled={strokes.length === 0}
            onClick={() => {
              setStrokes((current) => current.slice(0, -1));
              setDirty(true);
            }}
          >
            Undo
          </button>
          <button type="button" className={BUTTON} disabled={strokes.length === 0 && canvas === null} onClick={() => void discardCanvas()}>
            Clear
          </button>
        </div>
        <button type="button" className={PRIMARY_BUTTON} disabled={!dirty} onClick={() => void save()}>
          {dirty ? 'Save sketch' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
