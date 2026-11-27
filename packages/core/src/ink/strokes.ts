// FR-305 / ADR-003 — Portable normalized vector ink geometry (0..1000 canvas coordinate space).
//
// Pure TypeScript with zero platform imports so iPadOS (Apple Pencil / Skia), Android (S-Pen / Skia),
// and Desktop/Web (mouse/pen / SVG or Canvas) compute identical geometry and SVG paths from the
// exact same synced `ink_canvases.strokes_payload` JSON.

import type { InkStroke, InkStrokePoint } from '../domain/types';

export const INK_CANVAS_MAX = 1000;
export const INK_MIN_WIDTH = 1;
export const INK_MAX_WIDTH = 20;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Round to 2 decimals so synced JSON stays compact while preserving sub-pixel precision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clamp a raw point into the canonical `0..1000` normalized space (`ADR-003`). */
export function normalizeInkPoint(point: InkStrokePoint): InkStrokePoint {
  return {
    x: round2(clamp(point.x, 0, INK_CANVAS_MAX)),
    y: round2(clamp(point.y, 0, INK_CANVAS_MAX)),
    pressure: round2(clamp(point.pressure, 0, 1)),
    t: Math.max(0, Math.round(Number.isFinite(point.t) ? point.t : 0)),
  };
}

/** Convert pixel coordinates in a `(canvasWidth x canvasHeight)` surface into `0..1000` space. */
export function pixelToNormalizedPoint(
  px: number,
  py: number,
  canvasWidth: number,
  canvasHeight: number,
  pressure = 0.5,
  t = 0,
): InkStrokePoint {
  const safeW = canvasWidth > 0 ? canvasWidth : 1;
  const safeH = canvasHeight > 0 ? canvasHeight : 1;
  return normalizeInkPoint({
    x: (px / safeW) * INK_CANVAS_MAX,
    y: (py / safeH) * INK_CANVAS_MAX,
    pressure,
    t,
  });
}

/** Project a normalized `0..1000` point onto a target `(canvasWidth x canvasHeight)` surface. */
export function normalizedToPixelPoint(
  point: InkStrokePoint,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: (clamp(point.x, 0, INK_CANVAS_MAX) / INK_CANVAS_MAX) * canvasWidth,
    y: (clamp(point.y, 0, INK_CANVAS_MAX) / INK_CANVAS_MAX) * canvasHeight,
  };
}

/** Normalize and sanitize a full `InkStroke` before persisting to `ink_canvases`. */
export function normalizeInkStroke(stroke: InkStroke): InkStroke {
  return {
    id: stroke.id,
    colorHex: stroke.colorHex,
    width: round2(clamp(stroke.width, INK_MIN_WIDTH, INK_MAX_WIDTH)),
    points: stroke.points.map(normalizeInkPoint),
  };
}

/** Parse a `strokes_payload` JSON string into normalized `InkStroke[]`; degrades safely to `[]`. */
export function parseInkStrokes(raw: string): InkStroke[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const strokes: InkStroke[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== 'string' || typeof rec.colorHex !== 'string' || typeof rec.width !== 'number') {
        continue;
      }
      if (!Array.isArray(rec.points)) continue;
      const points: InkStrokePoint[] = [];
      for (const pt of rec.points) {
        if (typeof pt !== 'object' || pt === null) continue;
        const p = pt as Record<string, unknown>;
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          points.push(
            normalizeInkPoint({
              x: p.x,
              y: p.y,
              pressure: typeof p.pressure === 'number' ? p.pressure : 0.5,
              t: typeof p.t === 'number' ? p.t : 0,
            }),
          );
        }
      }
      if (points.length > 0) {
        strokes.push(
          normalizeInkStroke({
            id: rec.id,
            colorHex: rec.colorHex,
            width: rec.width,
            points,
          }),
        );
      }
    }
    return strokes;
  } catch {
    return [];
  }
}

/**
 * Render a smooth quadratic-midpoint SVG path string (`M ... Q ...`) for a normalized stroke
 * projected onto `(canvasWidth x canvasHeight)`. Consumed identically by Skia on mobile and
 * SVG `<path>` on desktop so strokes appear at exact relative proportions across platforms.
 */
export function inkStrokeToSvgPath(
  stroke: InkStroke,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const pts = stroke.points;
  if (pts.length === 0) return '';
  const first = normalizedToPixelPoint(pts[0]!, canvasWidth, canvasHeight);
  if (pts.length === 1) {
    return `M ${round2(first.x)} ${round2(first.y)} L ${round2(first.x + 0.5)} ${round2(first.y + 0.5)}`;
  }
  const commands: string[] = [`M ${round2(first.x)} ${round2(first.y)}`];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = normalizedToPixelPoint(pts[i - 1]!, canvasWidth, canvasHeight);
    const curr = normalizedToPixelPoint(pts[i]!, canvasWidth, canvasHeight);
    const midX = round2((prev.x + curr.x) / 2);
    const midY = round2((prev.y + curr.y) / 2);
    commands.push(`Q ${round2(prev.x)} ${round2(prev.y)} ${midX} ${midY}`);
  }
  const last = normalizedToPixelPoint(pts[pts.length - 1]!, canvasWidth, canvasHeight);
  commands.push(`L ${round2(last.x)} ${round2(last.y)}`);
  return commands.join(' ');
}
