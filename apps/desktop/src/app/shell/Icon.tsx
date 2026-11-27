// Purpose-drawn line icons (D1 §4.6 — specific glyphs, never generic stars or emoji). The same
// 24×24 paths as the mobile Skia icons, as inline SVG stroked in `currentColor`.
export type IconName =
  | 'read'
  | 'pray'
  | 'journal'
  | 'library'
  | 'search'
  | 'compare'
  | 'focus'
  | 'panelLeftOpen'
  | 'panelLeftClose'
  | 'panelRightOpen'
  | 'panelRightClose'
  | 'back'
  | 'next'
  | 'close'
  | 'guide'
  | 'observe'
  | 'sketch'
  | 'capture';

const GLYPHS: Record<IconName, readonly string[]> = {
  read: ['M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z', 'M12 6.5v13'],
  pray: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z', 'M12 5.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z', 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z'],
  journal: ['M19.5 3.5c-6 1-10.5 5.5-12.5 13', 'M19.5 3.5c.5 5-3 10-9 11.5', 'M7 16.5 4.5 20.5'],
  library: ['M4 4v15M8 6v13M12 4v15', 'M15.5 6.5l3.8-1 3 13-3.8 1Z', 'M2.5 19.5h19'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z', 'M20 20l-4.2-4.2'],
  compare: ['M5 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 9 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4Z', 'M15 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20h-4a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 15 4Z'],
  focus: ['M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
  panelLeftOpen: ['M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Z', 'M9 4.5v15', 'M13 10l2 2-2 2'],
  panelLeftClose: ['M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Z', 'M9 4.5v15', 'M15 10l-2 2 2 2'],
  panelRightOpen: ['M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Z', 'M15 4.5v15', 'M11 10l-2 2 2 2'],
  panelRightClose: ['M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Z', 'M15 4.5v15', 'M9 10l2 2-2 2'],
  back: ['M15 5l-7 7 7 7'],
  next: ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12M18 6 6 18'],
  guide: ['M12 3v18', 'M12 6h6.5l2 2-2 2H12', 'M12 12H5.5l-2 2 2 2H12'],
  observe: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z'],
  sketch: ['M4 20c3-1 4-4 7-4s3 3 6 3 3-2 3-2', 'M14.5 4.5l3 3L10 15l-3.5.5.5-3.5Z'],
  capture: ['M12 4v16M4 12h16'],
};

const RING_OPACITY = [1, 0.7, 0.4];

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {GLYPHS[name].map((d, index) => (
        <path key={index} d={d} opacity={name === 'pray' ? RING_OPACITY[index] : undefined} />
      ))}
    </svg>
  );
}
