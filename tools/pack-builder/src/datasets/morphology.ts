// Morphology code → human text (FR-301 MorphologyInspector), expanded at ETL time so the app never
// ships a decoder. Greek: Robinson-style codes as used by STEPBible TAGNT (`V-PAI-3S`, `N-GSM-P`).
// Hebrew/Aramaic: OpenScriptures Hebrew Bible codes as used by TAHOT (`HVqp3ms`, `HR/Ncfsa`).
// Unknown parts are skipped rather than guessed; a code that decodes to nothing returns `null`.

const CASES: Record<string, string> = { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' };
const NUMBERS: Record<string, string> = { S: 'singular', P: 'plural' };
const GENDERS: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' };
const PERSONS: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };

const GREEK_POS: Record<string, string> = {
  N: 'noun',
  A: 'adjective',
  T: 'article',
  V: 'verb',
  P: 'personal pronoun',
  R: 'relative pronoun',
  C: 'reciprocal pronoun',
  D: 'demonstrative pronoun',
  K: 'correlative pronoun',
  I: 'interrogative pronoun',
  X: 'indefinite pronoun',
  Q: 'correlative or interrogative pronoun',
  F: 'reflexive pronoun',
  S: 'possessive pronoun',
  ADV: 'adverb',
  CONJ: 'conjunction',
  COND: 'conditional particle',
  PREP: 'preposition',
  PRT: 'particle',
  INJ: 'interjection',
  ARAM: 'Aramaic word',
  HEB: 'Hebrew word',
};
const GREEK_TENSE: Record<string, string> = {
  P: 'present',
  I: 'imperfect',
  F: 'future',
  A: 'aorist',
  R: 'perfect',
  L: 'pluperfect',
};
const GREEK_VOICE: Record<string, string> = {
  A: 'active',
  M: 'middle',
  P: 'passive',
  E: 'middle or passive',
  D: 'middle deponent',
  O: 'passive deponent',
  N: 'middle or passive deponent',
};
const GREEK_MOOD: Record<string, string> = {
  I: 'indicative',
  S: 'subjunctive',
  O: 'optative',
  M: 'imperative',
  N: 'infinitive',
  P: 'participle',
};
const GREEK_SUFFIX: Record<string, string> = {
  P: 'proper name',
  L: 'location',
  T: 'title',
  G: 'gentilic',
  C: 'contracted',
  N: 'negative',
  I: 'interrogative',
  S: 'superlative',
  K: 'comparative',
};

function caseNumberGender(part: string): string[] {
  // e.g. NSF, GSM, DPN; pronouns may lead with a person digit (1NS, 2GP).
  const out: string[] = [];
  let rest = part;
  if (PERSONS[rest[0] ?? ''] !== undefined) {
    out.push(PERSONS[rest[0]!]!);
    rest = rest.slice(1);
  }
  const [c, n, g] = rest;
  if (c !== undefined && CASES[c] !== undefined) out.push(CASES[c]);
  if (n !== undefined && NUMBERS[n] !== undefined) out.push(NUMBERS[n]);
  if (g !== undefined && GENDERS[g] !== undefined) out.push(GENDERS[g]);
  return out;
}

/** Expand a Greek morphology code (`V-PAI-3S` → `verb, present active indicative, 3rd person singular`). */
export function expandGreekMorphology(code: string): string | null {
  const parts = code.trim().toUpperCase().split('-').filter((p) => p.length > 0);
  const head = parts[0];
  if (head === undefined) return null;
  const pos = GREEK_POS[head];
  if (pos === undefined) return null;
  const out: string[] = [pos];

  if (head === 'V') {
    const tvm = parts[1] ?? '';
    const second = tvm.startsWith('2');
    const letters = second ? tvm.slice(1) : tvm;
    const tense = GREEK_TENSE[letters[0] ?? ''];
    const voice = GREEK_VOICE[letters[1] ?? ''];
    const mood = GREEK_MOOD[letters[2] ?? ''];
    const verbal = [second && tense !== undefined ? `second ${tense}` : tense, voice, mood].filter(
      (x): x is string => x !== undefined,
    );
    if (verbal.length > 0) out.push(verbal.join(' '));
    const tail = parts[2];
    if (tail !== undefined) {
      if (/^[123][SP]$/.test(tail)) out.push(`${PERSONS[tail[0]!]!} ${NUMBERS[tail[1]!]!}`);
      else {
        const cng = caseNumberGender(tail);
        if (cng.length > 0) out.push(cng.join(' '));
      }
    }
    return out.join(', ');
  }

  for (const part of parts.slice(1)) {
    const cng = /^[123]?[NGDAV][SP][MFN]?$/.test(part) ? caseNumberGender(part) : [];
    if (cng.length > 0) out.push(cng.join(' '));
    else if (GREEK_SUFFIX[part] !== undefined) out.push(GREEK_SUFFIX[part]);
  }
  return out.join(', ');
}

const HEB_POS: Record<string, string> = {
  A: 'adjective',
  C: 'conjunction',
  D: 'adverb',
  N: 'noun',
  P: 'pronoun',
  R: 'preposition',
  S: 'suffix',
  T: 'particle',
  V: 'verb',
};
const HEB_STEM: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael', o: 'polel',
  O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal', k: 'palel', K: 'pulal', Q: 'qal passive',
  l: 'pilpel', L: 'polpal', f: 'hithpalpel', D: 'nithpael', j: 'pealal', i: 'pilel', u: 'hothpaal',
  c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel', z: 'hithpoel',
};
const ARAMAIC_STEM: Record<string, string> = {
  q: "pe'al", Q: "pe'il", u: "hithpe'el", N: 'niphal', p: "pa'el", P: "pu'al", M: "hithpa'al",
  a: "aphel", h: 'haphel', s: 'saphel', e: 'shaphel', H: 'hophal', i: "ithpe'el", t: 'hishtaphel',
  v: 'ishtaphel', w: "hithaph'el", o: 'polel', z: "ithpo'el", m: "po'el", y: "ithpa'al",
};
const HEB_CONJ: Record<string, string> = {
  p: 'perfect', q: 'sequential perfect', i: 'imperfect', w: 'sequential imperfect', h: 'cohortative',
  j: 'jussive', v: 'imperative', r: 'participle active', s: 'participle passive',
  a: 'infinitive absolute', c: 'infinitive construct',
};
const HEB_PERSON: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };
const HEB_GENDER: Record<string, string> = { m: 'masculine', f: 'feminine', c: 'common', b: 'both genders' };
const HEB_NUMBER: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const HEB_STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };
const NOUN_TYPE: Record<string, string> = { c: 'common', g: 'gentilic', p: 'proper name' };
const ADJ_TYPE: Record<string, string> = { a: '', c: 'cardinal number', g: 'gentilic', o: 'ordinal number' };
const PARTICLE_TYPE: Record<string, string> = {
  a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative', j: 'interjection',
  m: 'demonstrative', n: 'negative', o: 'direct object marker', r: 'relative',
};
const PRONOUN_TYPE: Record<string, string> = {
  d: 'demonstrative', f: 'indefinite', i: 'interrogative', p: 'personal', r: 'relative',
};
const SUFFIX_TYPE: Record<string, string> = {
  d: 'directional he', h: 'paragogic he', n: 'paragogic nun', p: 'pronominal',
};

/** Person/gender/number/state tail, e.g. `3ms`, `cmpa`, `fsa`. */
function hebrewTail(tail: string): string[] {
  const out: string[] = [];
  let i = 0;
  if (HEB_PERSON[tail[i] ?? ''] !== undefined) out.push(HEB_PERSON[tail[i++]!]!);
  if (HEB_GENDER[tail[i] ?? ''] !== undefined) out.push(HEB_GENDER[tail[i++]!]!);
  if (HEB_NUMBER[tail[i] ?? ''] !== undefined) out.push(HEB_NUMBER[tail[i++]!]!);
  if (HEB_STATE[tail[i] ?? ''] !== undefined) out.push(HEB_STATE[tail[i++]!]!);
  return out;
}

function expandHebrewSegment(segment: string, aramaic: boolean): string | null {
  const pos = HEB_POS[segment[0] ?? ''];
  if (pos === undefined) return null;
  const body = segment.slice(1);
  const words: string[] = [];
  switch (segment[0]) {
    case 'V': {
      const stem = (aramaic ? ARAMAIC_STEM : HEB_STEM)[body[0] ?? ''];
      const conj = HEB_CONJ[body[1] ?? ''];
      words.push(['verb', stem, conj].filter((x) => x !== undefined).join(' '));
      words.push(...hebrewTail(body.slice(2)));
      break;
    }
    case 'N': {
      const type = NOUN_TYPE[body[0] ?? ''];
      words.push(type === 'proper name' ? 'proper noun' : `noun${type !== undefined && type !== 'common' ? ` (${type})` : ''}`);
      words.push(...hebrewTail(body.slice(1)));
      break;
    }
    case 'A': {
      const type = ADJ_TYPE[body[0] ?? ''];
      words.push(type !== undefined && type.length > 0 ? `adjective (${type})` : 'adjective');
      words.push(...hebrewTail(body.slice(1)));
      break;
    }
    case 'T':
      words.push(PARTICLE_TYPE[body[0] ?? ''] ?? 'particle');
      break;
    case 'P': {
      const type = PRONOUN_TYPE[body[0] ?? ''];
      words.push(type !== undefined ? `${type} pronoun` : 'pronoun');
      words.push(...hebrewTail(body.slice(1)));
      break;
    }
    case 'R':
      words.push(body[0] === 'd' ? 'preposition + article' : 'preposition');
      break;
    case 'S': {
      const type = SUFFIX_TYPE[body[0] ?? ''];
      words.push(type !== undefined ? `${type} suffix` : 'suffix');
      words.push(...hebrewTail(body.slice(1)));
      break;
    }
    default:
      words.push(pos);
  }
  return words.filter((w) => w.length > 0).join(', ');
}

/**
 * Expand a Hebrew/Aramaic OSHB code. The leading `H`/`A` is the language; `/` separates
 * prefix, root and suffix morphemes (`HR/Ncfsa` → `preposition + noun, feminine, singular, absolute`).
 */
export function expandHebrewMorphology(code: string): string | null {
  const trimmed = code.trim();
  const language = trimmed[0];
  if (language !== 'H' && language !== 'A') return null;
  const segments = trimmed
    .slice(1)
    .split('/')
    .map((segment) => expandHebrewSegment(segment, language === 'A'));
  if (segments.some((segment) => segment === null)) return null;
  const parts = segments as string[];
  if (parts.length === 1) return parts[0]!;
  // Join prefix/suffix morphemes with " + " so the root's own detail stays readable.
  return parts.join(' + ');
}
