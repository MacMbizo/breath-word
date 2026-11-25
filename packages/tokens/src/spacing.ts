// Spacing scale (4pt base grid) shared across mobile & desktop layouts.

export const SPACING = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADII = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** D3 WCAG 2.2 AA minimum interactive target size (pt). */
export const MIN_TOUCH_TARGET = 44;
