// STEPBible (Tyndale House, Cambridge; CC BY 4.0) → `ExegesisPackSource` (B5, plan unit P3-09).
//
// Inputs are the tab-separated files from github.com/STEPBible/STEPBible-Data:
//   * TAGNT — Translators Amalgamated Greek NT   (word rows `Mat.1.1#01=NKO  Βίβλος (Biblos)  …`)
//   * TAHOT — Translators Amalgamated Hebrew OT  (word rows `Gen.1.1#01=L  בְּ/רֵאשִׁ֖ית  …`)
//   * TBESG / TBESH — brief Greek / Hebrew lexicons keyed by extended Strong's.
//
// Rules (from the files' own headers):
//   * The first reference is the English (NRSV) versification → our Protestant `canonical_verse_id`.
//     A bracketed reference is the original-text versification: `(…)` = Hebrew MT in TAHOT and
//     Nestlé-Aland in TAGNT → `source_verse_id`. TAGNT `[…]` (KJV) and `{…}` (other) are ignored.
//   * TAGNT keeps only words in the Nestlé-Aland text (word type starting `N`/`n`); KJV/other-only
//     variant words would otherwise duplicate positions and are not in the BSB base text.
//   * Extended Strong's (`H0430G`, `G2424G`, `H1254A`) reduce to the base number (`H430`, `G2424`,
//     `H1254`). In TAHOT the root morpheme is the one in `{…}`; STEP's prefix numbers (`H9001+`) are
//     kept only when a word has no other tag.
//   * Word positions are renumbered 1..n per canonical verse in file order, because one English
//     verse can span two Hebrew verses whose word numbers each restart at 1.

import { normalizeStrongsId, toCanonicalVerseId, type LexiconSection, type OriginalLanguage } from '@breath-and-word/core';

import type { ExegesisLexiconInput, ExegesisTokenInput, ExegesisVersificationInput } from '../exegesis-pack';
import { packSourceInvalid } from '../pack-common';

import { expandGreekMorphology, expandHebrewMorphology } from './morphology';

/** STEPBible three-letter book codes, in Protestant canonical order (book 1..66). */
export const STEP_BOOK_CODES = [
  'Gen', 'Exo', 'Lev', 'Num', 'Deu', 'Jos', 'Jdg', 'Rut', '1Sa', '2Sa', '1Ki', '2Ki', '1Ch', '2Ch',
  'Ezr', 'Neh', 'Est', 'Job', 'Psa', 'Pro', 'Ecc', 'Sng', 'Isa', 'Jer', 'Lam', 'Ezk', 'Dan', 'Hos',
  'Jol', 'Amo', 'Oba', 'Jon', 'Mic', 'Nam', 'Hab', 'Zep', 'Hag', 'Zec', 'Mal', 'Mat', 'Mrk', 'Luk',
  'Jhn', 'Act', 'Rom', '1Co', '2Co', 'Gal', 'Eph', 'Php', 'Col', '1Th', '2Th', '1Ti', '2Ti', 'Tit',
  'Phm', 'Heb', 'Jas', '1Pe', '2Pe', '1Jn', '2Jn', '3Jn', 'Jud', 'Rev',
] as const;

const BOOK_BY_CODE = new Map<string, number>(STEP_BOOK_CODES.map((code, index) => [code, index + 1]));

/** A data row starts with a book code and chapter, e.g. `Gen.1.1…` or `1Sa.3.10…`. */
const LOOKS_LIKE_WORD_ROW = /^[1-3]?[A-Z][a-z]{1,2}\.\d+\.\d+/;
const WORD_REF =
  /^([1-3]?[A-Z][a-z]{1,2})\.(\d+)\.(\d+)(?:([([{])(\d+)\.(\d+)[)\]}])?#(\d+)=(\S+)$/;

/** Reduce an extended / disambiguated Strong's tag (`H0430G`, `G2424G`, `{H7225G}`) to `H430` form. */
export function baseStrongsId(raw: string): string | null {
  const match = /^\{?\s*([GHgh])0*(\d+)[A-Za-z]?\s*\}?$/.exec(raw.trim());
  if (match === null) return null;
  return normalizeStrongsId(`${match[1]}${match[2]}`);
}

function isStepPrefixNumber(id: string): boolean {
  return id.startsWith('H') && Number(id.slice(1)) >= 9000;
}

/** Pick the token's Strong's id from a TAHOT dStrongs cell such as `H9003/{H7225G}` or `H9002/H9009/{H0776G}\H9016`. */
export function hebrewRootStrongs(cell: string): string | null {
  const braced = /\{([^}]+)\}/.exec(cell);
  if (braced !== null) {
    const id = baseStrongsId(braced[1]!);
    if (id !== null) return id;
  }
  const ids = cell
    .split(/[/\\+\s]+/)
    .map((part) => baseStrongsId(part))
    .filter((id): id is string => id !== null);
  return ids.find((id) => !isStepPrefixNumber(id)) ?? ids[0] ?? null;
}

function cleanText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function verseIdOf(code: string, chapter: string, verse: string, lineNo: number): number {
  const book = BOOK_BY_CODE.get(code);
  if (book === undefined) throw packSourceInvalid(`line ${lineNo}: unknown STEPBible book code "${code}".`);
  return toCanonicalVerseId({ book, chapter: Number(chapter), verse: Number(verse) });
}

export interface StepTaggedTextResult {
  tokens: ExegesisTokenInput[];
  versificationMaps: ExegesisVersificationInput[];
  /** Word rows left out on purpose (TAGNT words not in the Nestlé-Aland text). */
  skippedVariantWords: number;
}

/** Parse one TAGNT (`language: 'greek'`) or TAHOT (`'hebrew'`) file. Throws `PACK_PARSE_FAILED` on a malformed word row. */
export function parseStepTaggedText(text: string, language: 'greek' | 'hebrew'): StepTaggedTextResult {
  const tokens: ExegesisTokenInput[] = [];
  const positionByVerse = new Map<number, number>();
  const pairs = new Map<string, { source: number; canonical: number }>();
  let skippedVariantWords = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!LOOKS_LIKE_WORD_ROW.test(line)) return;
    const cols = line.split('\t');
    const ref = WORD_REF.exec(cols[0]!.trim());
    if (ref === null) throw packSourceInvalid(`line ${lineNo}: unrecognised STEPBible reference "${cols[0]}".`);
    const [, code, chapter, verse, bracket, altChapter, altVerse, , wordType] = ref;

    if (language === 'greek' && !/^[Nn]/.test(wordType!)) {
      skippedVariantWords += 1;
      return;
    }

    const canonicalVerseId = verseIdOf(code!, chapter!, verse!, lineNo);
    // Only round brackets carry the original-text versification we map from.
    const sourceVerseId =
      bracket === '(' ? verseIdOf(code!, altChapter!, altVerse!, lineNo) : canonicalVerseId;
    if (sourceVerseId !== canonicalVerseId) {
      pairs.set(`${sourceVerseId}>${canonicalVerseId}`, { source: sourceVerseId, canonical: canonicalVerseId });
    }

    const wordPosition = (positionByVerse.get(canonicalVerseId) ?? 0) + 1;
    positionByVerse.set(canonicalVerseId, wordPosition);

    let token: ExegesisTokenInput;
    if (language === 'greek') {
      // `Βίβλος (Biblos)` · `[The] book` · `G0976=N-NSF` · `βίβλος=book`
      const wordMatch = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(cols[1] ?? '');
      const [strongsPart, morphCode] = (cols[3] ?? '').split('=');
      const morphologyCode = cleanText(morphCode);
      const morphologyHuman = morphologyCode !== undefined ? expandGreekMorphology(morphologyCode) : null;
      const strongsId = baseStrongsId((strongsPart ?? '').split('+')[0] ?? '');
      token = {
        canonicalVerseId,
        sourceVerseId,
        wordPosition,
        originalWord: cleanText(wordMatch?.[1] ?? cols[1]) ?? '',
        ...(cleanText(wordMatch?.[2]) !== undefined ? { transliteration: cleanText(wordMatch?.[2])! } : {}),
        ...(cleanText(cols[2]) !== undefined ? { englishGloss: cleanText(cols[2])! } : {}),
        ...(strongsId !== null ? { strongsId } : {}),
        ...(cleanText((cols[4] ?? '').split('=')[0]) !== undefined ? { lemma: cleanText((cols[4] ?? '').split('=')[0])! } : {}),
        ...(morphologyCode !== undefined ? { morphologyCode } : {}),
        ...(morphologyHuman !== null ? { morphologyHuman } : {}),
      };
    } else {
      // `בְּ/רֵאשִׁ֖ית` · `be./re.Shit` · `in/ beginning` · `H9003/{H7225G}` · `HR/Ncfsa` … · expanded tags
      const word = cleanText((cols[1] ?? '').split('\\')[0]!.replace(/\//g, ''));
      const morphologyCode = cleanText(cols[5]);
      const morphologyHuman = morphologyCode !== undefined ? expandHebrewMorphology(morphologyCode) : null;
      const strongsId = hebrewRootStrongs(cols[4] ?? '');
      const lemma = cleanText(/\{[^=}]+=([^=}]+)=/.exec(cols[11] ?? '')?.[1]);
      token = {
        canonicalVerseId,
        sourceVerseId,
        wordPosition,
        originalWord: word ?? '',
        ...(cleanText((cols[2] ?? '').replace(/\//g, '')) !== undefined
          ? { transliteration: cleanText((cols[2] ?? '').replace(/\//g, ''))! }
          : {}),
        ...(cleanText((cols[3] ?? '').replace(/\//g, ' ')) !== undefined
          ? { englishGloss: cleanText((cols[3] ?? '').replace(/\//g, ' '))! }
          : {}),
        ...(strongsId !== null ? { strongsId } : {}),
        ...(lemma !== undefined ? { lemma } : {}),
        ...(morphologyCode !== undefined ? { morphologyCode } : {}),
        ...(morphologyHuman !== null ? { morphologyHuman } : {}),
      };
    }
    if (token.originalWord.length === 0) throw packSourceInvalid(`line ${lineNo}: word row has no original-language text.`);
    tokens.push(token);
  });

  // EXACT is never stored (identity); a source verse feeding several English verses is a SPLIT,
  // several source verses feeding one English verse a MERGE, otherwise a plain OFFSET.
  const bySource = new Map<number, number>();
  const byCanonical = new Map<number, number>();
  for (const { source, canonical } of pairs.values()) {
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    byCanonical.set(canonical, (byCanonical.get(canonical) ?? 0) + 1);
  }
  const sourceVersification = language === 'greek' ? 'na28' : 'hebrew_mt';
  const versificationMaps: ExegesisVersificationInput[] = [...pairs.values()].map(({ source, canonical }) => ({
    sourceVersification,
    sourceVerseId: source,
    canonicalVerseId: canonical,
    mappingType: (bySource.get(source) ?? 0) > 1 ? 'SPLIT' : (byCanonical.get(canonical) ?? 0) > 1 ? 'MERGE' : 'OFFSET',
  }));

  return { tokens, versificationMaps, skippedVariantWords };
}

/** Strip the lexicons' light HTML (`<b>`, `<BR />`, `<ref='Mat.5.43'>Mat.5:43</ref>`) to plain text. */
export function lexiconHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/__(\d+)\./g, '$1.')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

const LEXICON_ROW = /^[GH]\d+[A-Za-z]?$/;

/**
 * Parse TBESG (`'greek'`) or TBESH (`'hebrew'`) into one entry per base Strong's number. Rows that
 * disambiguate the same number (people/places sharing a name, sub-meanings) become sections.
 */
export function parseStepLexicon(text: string, language: 'greek' | 'hebrew'): ExegesisLexiconInput[] {
  const source = language === 'greek' ? 'Abbott-Smith (STEPBible TBESG)' : 'Brief BDB (STEPBible TBESH)';
  const entries = new Map<string, { entry: ExegesisLexiconInput; glosses: string[] }>();

  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t');
    const eStrong = cols[0]?.trim() ?? '';
    if (!LEXICON_ROW.test(eStrong) || cols.length < 8) continue;
    const id = baseStrongsId(eStrong);
    if (id === null) continue;

    const lemma = cleanText((cols[3] ?? '').replace(/\//g, ''));
    const gloss = cleanText(cols[6]);
    const body = lexiconHtmlToText(cols[7] ?? '');
    const morphLanguage = (cols[5] ?? '').split(':')[0];
    const rowLanguage: OriginalLanguage =
      language === 'greek' ? 'greek' : morphLanguage === 'A' ? 'aramaic' : 'hebrew';
    const dStrong = cleanText((cols[1] ?? '').split('=')[0]);
    const section: LexiconSection = {
      heading: gloss ?? dStrong ?? id,
      body: body.length > 0 ? body : (gloss ?? id),
      source,
      ...(dStrong !== undefined && dStrong !== eStrong ? { subEntries: [dStrong] } : {}),
    };

    const existing = entries.get(id);
    if (existing === undefined) {
      if (lemma === undefined) continue;
      entries.set(id, {
        entry: {
          strongsId: id,
          language: rowLanguage,
          lemma,
          ...(cleanText(cols[4]) !== undefined ? { transliteration: cleanText(cols[4])! } : {}),
          shortDefinition: gloss ?? lemma,
          sections: [section],
        },
        glosses: gloss !== undefined ? [gloss] : [],
      });
    } else {
      existing.entry.sections.push(section);
      if (gloss !== undefined && !existing.glosses.includes(gloss)) existing.glosses.push(gloss);
    }
  }

  return [...entries.values()].map(({ entry, glosses }) => ({
    ...entry,
    // A number with several senses (e.g. a name shared by different people) lists the first few.
    shortDefinition: glosses.length > 0 ? glosses.slice(0, 3).join('; ') : entry.shortDefinition,
  }));
}
