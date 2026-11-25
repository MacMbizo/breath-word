# ADR-003: Cross-Platform Portable Stylus Ink (`Skia` / Vector Canvas)

- **Status:** Accepted
- **Date:** `2026-11-24`

## Context

Apple's `PencilKit` outputs proprietary binary `PKDrawing` data that cannot render on Android or Windows/macOS. Additionally, freehand ink drawn directly over reflowable Bible paragraphs drifts off target verses whenever font size, column count, or screen width changes.

## Decision

- Scope v1 stylus ink to **attached vector sketch canvases** linked to a `study_note` or `canonical_verse_id` drawer (`ink_canvases` table).
- Store strokes as portable, normalized JSON vectors (`x`, `y` normalized to `0..1000`, `pressure` `0..1`, `color`, `width`) smoothed via `perfect-freehand`.
- Render via `@shopify/react-native-skia` on iPadOS (full Apple Pencil pressure/tilt) and Android (S-Pen/touch), and HTML5 `<canvas>` / SVG on Tauri Desktop and Web.

## Consequences

- (+) 100% cross-platform fidelity (draw on iPad, view/edit on Android and Windows).
- (+) Immune to Bible text reflow and dynamic font scaling.
- (+) $0 native Swift/Kotlin bridge maintenance for a solo developer.
