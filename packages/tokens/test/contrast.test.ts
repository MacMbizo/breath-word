// D3 / WCAG 2.2 AA — every theme's text roles must stay readable on the surfaces they sit on.
// A palette tweak that drops a pair below its threshold fails here, not in a user's eyes.
import { describe, expect, it } from 'vitest';

import { COLORS, THEME_NAMES, isThemeName, themeToCssVariables, type ColorTheme } from '../src';

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [label, foreground, background, minimum ratio] — 4.5 for body text, 3 for large/UI glyphs. */
function pairs(t: ColorTheme): [string, string, string, number][] {
  return [
    ['primary on canvas', t.text.primary, t.bg.canvas, 7],
    ['primary on surface', t.text.primary, t.bg.surface, 7],
    ['primary on elevated', t.text.primary, t.bg.elevated, 4.5],
    ['secondary on canvas', t.text.secondary, t.bg.canvas, 4.5],
    ['secondary on surface', t.text.secondary, t.bg.surface, 4.5],
    ['secondary on sunken', t.text.secondary, t.bg.sunken, 4.5],
    ['verse number on canvas', t.text.verseNum, t.bg.canvas, 4.5],
    ['red letter on canvas', t.text.redLetter, t.bg.canvas, 4.5],
    ['accent on canvas', t.accent.primary, t.bg.canvas, 3],
    ['accent on surface', t.accent.primary, t.bg.surface, 3],
    ['text on accent fill', t.text.onAccent, t.accent.primary, 4.5],
    ['tapped word', t.accent.onWash, t.accent.wash, 4.5],
    ['rubric on canvas', t.accent.rubric, t.bg.canvas, 3],
    ['nav icon on pill', t.nav.icon, t.nav.bg, 4.5],
    ['active nav icon', t.nav.activeIcon, t.nav.activeBg, 4.5],
  ];
}

describe('theme contrast (WCAG 2.2 AA)', () => {
  for (const name of THEME_NAMES) {
    for (const [label, fg, bg, min] of pairs(COLORS[name])) {
      it(`${name}: ${label} ≥ ${min}:1`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

describe('theme names', () => {
  it('accepts the three current themes and rejects retired or unknown names', () => {
    expect(THEME_NAMES).toEqual(['parchment', 'selah', 'lamplight']);
    expect(isThemeName('selah')).toBe(true);
    expect(isThemeName('daylight')).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
  });

  it('emits a CSS variable for every colour role', () => {
    const vars = themeToCssVariables('lamplight');
    expect(vars['--bw-accent-wash']).toBe(COLORS.lamplight.accent.wash);
    expect(vars['--bw-nav-active-bg']).toBe(COLORS.lamplight.nav.activeBg);
    expect(vars['--bw-color-scheme']).toBe('dark');
    expect(themeToCssVariables('selah')['--bw-color-scheme']).toBe('light');
  });
});
