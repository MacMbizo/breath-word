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

/**
 * Strong's numbers that name the SAME lexeme under different numbering traditions. Strong's
 * concordance (and so the KJV's word tags) gave many forms of εἰμί ("to be") their own numbers —
 * ἦν G2258, ἐστί G2076, ὤν G5607 … — while STEPBible's tagged Greek files every form under the
 * lemma G1510 (εἶναι as G1511). Without this map an English "was" (G2258) can never find its ἦν.
 */
const EIMI_FORMS = ['G1488', 'G1498', 'G1510', 'G1511', 'G1526', 'G2070', 'G2071', 'G2075', 'G2076', 'G2077', 'G2252', 'G2258', 'G5600', 'G5607'];
const EQUIVALENCE_CLASS = new Map<string, string>(EIMI_FORMS.map((id) => [id, 'G1510']));

/** The lexeme class a Strong's ID belongs to (itself unless it is a known legacy form number). */
export function strongsClass(strongsId: string): string {
  return EQUIVALENCE_CLASS.get(strongsId) ?? strongsId;
}

/** Every Strong's ID in the same lexeme class (the ID alone when it has no equivalents). */
export function strongsEquivalents(strongsId: string): string[] {
  const cls = strongsClass(strongsId);
  return cls === strongsId && !EQUIVALENCE_CLASS.has(strongsId) ? [strongsId] : EIMI_FORMS.filter((id) => EQUIVALENCE_CLASS.get(id) === cls);
}
