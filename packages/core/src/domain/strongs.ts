// B4 §4.1 / AGENTS.md rule 4 — Canonical Strong's ID normalization and language helpers.
//
// Strong's IDs are always unpadded uppercase: `G26` (Greek) or `H430` (Hebrew/Aramaic),
// never `G0026`, `g26`, or `H0430`. Hebrew and Aramaic tokens MUST be rendered with
// `dir="rtl"` and `unicode-bidi: isolate` (AGENTS.md rule 6).

import type { OriginalLanguage } from './types';

const STRONGS_PATTERN = /^\s*([ghGH])\s*0*([1-9]\d*)\s*$/;

/**
 * Normalize a raw Strong's identifier into canonical unpadded uppercase form
 * (`"g0026"` -> `"G26"`, `"H0430"` -> `"H430"`). Returns `null` if invalid.
 */
export function normalizeStrongsId(raw: string): string | null {
  const match = STRONGS_PATTERN.exec(raw);
  if (match === null) return null;
  const prefix = match[1]!.toUpperCase();
  const num = Number.parseInt(match[2]!, 10);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return `${prefix}${num}`;
}

/** True when `raw` can be normalized to a valid Strong's ID (`G<n>` or `H<n>`). */
export function isValidStrongsId(raw: string): boolean {
  return normalizeStrongsId(raw) !== null;
}

/**
 * True when the script is right-to-left (`hebrew` or `aramaic`) and therefore requires
 * `dir="rtl"` + `unicode-bidi: isolate` in UI components (AGENTS.md rule 6, D3).
 */
export function isRtlOriginalLanguage(language: OriginalLanguage): boolean {
  return language === 'hebrew' || language === 'aramaic';
}

/** Infer the default text direction (`rtl` vs `ltr`) from a Strong's ID prefix. */
export function isRtlStrongsId(strongsId: string): boolean {
  const normalized = normalizeStrongsId(strongsId);
  return normalized !== null && normalized.startsWith('H');
}
