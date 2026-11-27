// Purpose-drawn line icons (D1 §4.6: specific, meaningful glyphs — never generic stars or emoji),
// rendered with Skia, which the app already ships for the breath ring and ink canvas. Each glyph
// is a 24×24 SVG path, stroked in the caller's colour.
import { useMemo } from 'react';

import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';

export type IconName =
  | 'read'
  | 'pray'
  | 'journal'
  | 'library'
  | 'search'
  | 'compare'
  | 'back'
  | 'chevronRight'
  | 'close';

/** Open book · breath rings · quill · shelf with a leaning volume · lens · twin columns · arrows. */
const GLYPHS: Record<IconName, readonly string[]> = {
  read: ['M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z', 'M12 6.5v13'],
  pray: [
    'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z',
    'M12 5.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z',
    'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z',
  ],
  journal: ['M19.5 3.5c-6 1-10.5 5.5-12.5 13', 'M19.5 3.5c.5 5-3 10-9 11.5', 'M7 16.5 4.5 20.5'],
  library: ['M4 4v15M8 6v13M12 4v15', 'M15.5 6.5l3.8-1 3 13-3.8 1Z', 'M2.5 19.5h19'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z', 'M20 20l-4.2-4.2'],
  compare: ['M5 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 9 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4Z', 'M15 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20h-4a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 15 4Z'],
  back: ['M15 5l-7 7 7 7'],
  chevronRight: ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12M18 6 6 18'],
};

/** Outer rings of the breath glyph are drawn lighter, like breath fading outward. */
const RING_OPACITY = [1, 0.7, 0.4];

export function Icon({ name, size = 22, color, strokeWidth = 1.6 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const paths = useMemo(
    () => GLYPHS[name].map((d) => Skia.Path.MakeFromSVGString(d)).filter((p) => p !== null),
    [name],
  );
  const scale = size / 24;
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale }]}>
        {paths.map((path, index) => (
          <Path
            key={index}
            path={path}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
            color={color}
            opacity={name === 'pray' ? (RING_OPACITY[index] ?? 1) : 1}
          />
        ))}
      </Group>
    </Canvas>
  );
}
