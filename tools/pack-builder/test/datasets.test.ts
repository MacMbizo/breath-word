// Plan unit P3-09 — raw dataset parsers. Row excerpts follow the real file formats of STEPBible
// TAGNT/TAHOT/TBESG/TBESH (STEPBible.org / Tyndale House, CC BY 4.0), OpenBible.info
// cross-references (CC BY 4.0) and Theographic Bible Metadata (CC BY-SA 4.0).

import { describe, expect, it } from 'vitest';

import { expandGreekMorphology, expandHebrewMorphology } from '../src/datasets/morphology';
import { parseOpenBibleCrossReferences } from '../src/datasets/openbible';
import { chapterExtents, defaultReadingPlans } from '../src/datasets/reading-plans';
import {
  baseStrongsId,
  hebrewRootStrongs,
  lexiconHtmlToText,
  parseStepLexicon,
  parseStepTaggedText,
} from '../src/datasets/stepbible';
import { parseTheographic } from '../src/datasets/theographic';

const T = '\t';

describe('morphology expansion', () => {
  it.each([
    ['V-PAI-3S', 'verb, present active indicative, 3rd person singular'],
    ['V-2AAI-3S', 'verb, second aorist active indicative, 3rd person singular'],
    ['V-PAP-NSM', 'verb, present active participle, nominative singular masculine'],
    ['N-GSM-P', 'noun, genitive singular masculine, proper name'],
    ['P-1NS', 'personal pronoun, 1st person nominative singular'],
    ['CONJ', 'conjunction'],
  ])('Greek %s', (code, human) => {
    expect(expandGreekMorphology(code)).toBe(human);
  });

  it.each([
    ['HVqp3ms', 'verb qal perfect, 3rd person, masculine, singular'],
    ['HR/Ncfsa', 'preposition + noun, feminine, singular, absolute'],
    ['HTd/Ncmpa', 'definite article + noun, masculine, plural, absolute'],
    ['HTo', 'direct object marker'],
    ['AVqp3ms', "verb pe'al perfect, 3rd person, masculine, singular"],
  ])('Hebrew/Aramaic %s', (code, human) => {
    expect(expandHebrewMorphology(code)).toBe(human);
  });

  it('returns null rather than guessing', () => {
    expect(expandGreekMorphology('ZZZ')).toBeNull();
    expect(expandHebrewMorphology('XQ')).toBeNull();
  });
});

describe('STEPBible Strong’s handling', () => {
  it('reduces extended and disambiguated numbers to the base id', () => {
    expect(baseStrongsId('H0430G')).toBe('H430');
    expect(baseStrongsId('{G2424G}')).toBe('G2424');
    expect(baseStrongsId('G0026')).toBe('G26');
    expect(baseStrongsId('G20001')).toBe('G20001');
    expect(baseStrongsId('nonsense')).toBeNull();
  });

  it('takes the braced root morpheme, else the first non-prefix tag', () => {
    expect(hebrewRootStrongs('H9003/{H7225G}')).toBe('H7225');
    expect(hebrewRootStrongs('H9002/H9009/{H0776G}\\H9016')).toBe('H776');
    expect(hebrewRootStrongs('H9002/H0853')).toBe('H853');
    expect(hebrewRootStrongs('H9009')).toBe('H9009');
  });
});

describe('parseStepTaggedText', () => {
  it('parses TAGNT, keeping only Nestlé-Aland words and NA versification', () => {
    const text = [
      'Word & Type\tGreek\tEnglish translation\tdStrongs = Grammar',
      ['Jhn.3.16#01=NKO', 'Οὕτως (Houtōs)', 'Thus', 'G3779=ADV', 'οὕτω/οὕτως=thus'].join(T),
      ['Jhn.3.16#02=K', 'γὰρ (gar)', 'for', 'G1063=CONJ', 'γάρ=for'].join(T),
      ['Jhn.3.16#03=NKO', 'ἠγάπησεν (ēgapēsen)', 'loved', 'G0025=V-AAI-3S', 'ἀγαπάω=to love'].join(T),
      ['Mrk.12.15(12.14)#01=NKO', 'ὁ (ho)', 'the', 'G3588=T-NSM', 'ὁ=the'].join(T),
    ].join('\n');
    const result = parseStepTaggedText(text, 'greek');
    expect(result.skippedVariantWords).toBe(1);
    expect(result.tokens.map((t) => [t.canonicalVerseId, t.wordPosition, t.originalWord, t.strongsId])).toEqual([
      [43003016, 1, 'Οὕτως', 'G3779'],
      [43003016, 2, 'ἠγάπησεν', 'G25'],
      [41012015, 1, 'ὁ', 'G3588'],
    ]);
    expect(result.tokens[1]).toMatchObject({
      transliteration: 'ēgapēsen',
      englishGloss: 'loved',
      lemma: 'ἀγαπάω',
      morphologyCode: 'V-AAI-3S',
      morphologyHuman: 'verb, aorist active indicative, 3rd person singular',
    });
    expect(result.versificationMaps).toEqual([
      { sourceVersification: 'na28', sourceVerseId: 41012014, canonicalVerseId: 41012015, mappingType: 'OFFSET' },
    ]);
  });

  it('parses TAHOT, mapping Hebrew verse numbers and renumbering words per English verse', () => {
    const row = (ref: string, heb: string, tr: string, en: string, ds: string, morph: string, exp: string): string =>
      [ref, heb, tr, en, ds, morph, '', '', '', '', '', exp].join(T);
    const text = [
      row('Gen.1.1#03=L', 'אֱלֹהִ֑ים', "'E.lo.Him", 'God', '{H0430G}', 'HNcmpa', '{H0430G=אֱלֹהִים=God}'),
      row('Deu.12.32(13.1)#01=L', 'אֵ֣ת', 'et', '<obj.>', 'H0853', 'HTo', '{H0853=אֵת=untranslatable}'),
      row('Deu.12.32(13.1)#02=L', 'כָּל\\־', 'kol-', 'all', '{H3605}\\H9014', 'HNcmsc', '{H3605=כֹּל=all}'),
    ].join('\n');
    const result = parseStepTaggedText(text, 'hebrew');
    expect(result.tokens.map((t) => [t.canonicalVerseId, t.sourceVerseId, t.wordPosition, t.originalWord, t.strongsId])).toEqual([
      [1001001, 1001001, 1, 'אֱלֹהִ֑ים', 'H430'],
      [5012032, 5013001, 1, 'אֵ֣ת', 'H853'],
      [5012032, 5013001, 2, 'כָּל', 'H3605'],
    ]);
    expect(result.tokens[0]).toMatchObject({ lemma: 'אֱלֹהִים', morphologyHuman: 'noun, masculine, plural, absolute' });
    expect(result.versificationMaps).toEqual([
      { sourceVersification: 'hebrew_mt', sourceVerseId: 5013001, canonicalVerseId: 5012032, mappingType: 'OFFSET' },
    ]);
  });

  it('fails loudly on an unknown book code instead of dropping the row', () => {
    expect(() => parseStepTaggedText(['Xyz.1.1#01=L', 'א', 'a', 'a', 'H0001', 'HNcmsa'].join(T), 'hebrew')).toThrow(
      expect.objectContaining({ code: 'PACK_PARSE_FAILED' }),
    );
  });
});

describe('parseStepLexicon', () => {
  it('merges disambiguation rows into one entry per base number', () => {
    const text = [
      ['H0001', 'H0001G =', 'H0001G', 'אָב', 'av', 'H:N-M', 'father', '1) father of an individual<br>2) of God as father'].join(T),
      ['H0001', 'H0001H = a Part of', 'H2438H', 'אָב', 'av', 'H:N-M', '(Huram)-abi', 'A man living at the time of United Monarchy'].join(T),
      ['H1768', 'H1768 =', 'H1768', 'דִּי', 'di', 'A:Part', 'which', 'which, that'].join(T),
      ['G0026', 'G0026 =', 'G0026', 'ἀγάπη', 'agapē', 'G:N-F', 'love', ' <b>ἀγάπη</b>, -ης, ἡ <BR /> <b>love, goodwill</b>'].join(T),
    ].join('\n');
    const hebrew = parseStepLexicon(text, 'hebrew');
    const father = hebrew.find((e) => e.strongsId === 'H1')!;
    expect(father.shortDefinition).toBe('father; (Huram)-abi');
    expect(father.sections).toHaveLength(2);
    expect(father.sections[0]!.body).toBe('1) father of an individual\n2) of God as father');
    expect(hebrew.find((e) => e.strongsId === 'H1768')!.language).toBe('aramaic');

    const greek = parseStepLexicon(text, 'greek').find((e) => e.strongsId === 'G26')!;
    expect(greek).toMatchObject({ language: 'greek', lemma: 'ἀγάπη', shortDefinition: 'love' });
    expect(greek.sections[0]!.body).toBe('ἀγάπη, -ης, ἡ\nlove, goodwill');
  });

  it('strips lexicon HTML and reference tags', () => {
    expect(lexiconHtmlToText("to Christ, <ref='Jhn.8.42'>Jhn.8:42;</ref> &amp; __1. more")).toBe(
      'to Christ, Jhn.8:42; & 1. more',
    );
  });
});

describe('parseOpenBibleCrossReferences', () => {
  it('parses OSIS refs, ranges and votes', () => {
    const refs = parseOpenBibleCrossReferences(
      'From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY\nGen.1.1\tPs.89.11-Ps.89.12\t64\nRom.8.28\t1Pet.5.10\t-3\n',
    );
    expect(refs).toEqual([
      { fromVerseId: 1001001, toStartVerseId: 19089011, toEndVerseId: 19089012, votes: 64, source: 'OPENBIBLE' },
      { fromVerseId: 45008028, toStartVerseId: 60005010, toEndVerseId: 60005010, votes: -3, source: 'OPENBIBLE' },
    ]);
  });

  it('rejects an unknown book', () => {
    expect(() => parseOpenBibleCrossReferences('Foo.1.1\tGen.1.1\t3')).toThrow(
      expect.objectContaining({ code: 'PACK_PARSE_FAILED' }),
    );
  });
});

describe('parseTheographic + reading plans', () => {
  const verses = [
    { id: 'v1', fields: { verseID: '44019001' } },
    { id: 'v2', fields: { verseID: '49001001' } },
    { id: 'v3', fields: { verseID: '45001001' } },
  ];

  it('resolves verse record ids and keeps coordinates, aliases and eras', () => {
    const entities = parseTheographic({
      verses,
      places: [
        {
          id: 'p1',
          fields: {
            displayTitle: 'Ephesus',
            slug: 'ephesus_400',
            latitude: '37.940164',
            longitude: '27.342403',
            featureType: 'City',
            verses: ['v2', 'v1'],
            dictText: ' the capital of proconsular Asia.',
          },
        },
        { id: 'p2', fields: { displayTitle: 'Nowhere', slug: 'nowhere_1', verses: [] } },
      ],
      people: [
        {
          id: 'x1',
          fields: { name: 'Paul', slug: 'paul_2479', alsoCalled: 'Saul,Mercurius', gender: 'Male', minYear: 5, maxYear: 67, verses: ['v3'] },
        },
      ],
    });
    expect(entities.map((e) => e.entityId)).toEqual(['person:paul_2479', 'place:ephesus_400']);
    expect(entities[0]).toMatchObject({ aliases: ['Saul', 'Mercurius'], eraLabel: 'AD 5 – AD 67', verseIds: [45001001] });
    expect(entities[1]).toMatchObject({ latitude: 37.940164, longitude: 27.342403, verseIds: [44019001, 49001001] });
    expect(entities[1]!.summary).toBe('the capital of proconsular Asia.');
  });

  it('builds chapter-a-day plans from the verse list', () => {
    const extents = chapterExtents([40001001, 40001025, 40002001, 40002023, 19001001, 19001006]);
    const [nt, psalms] = defaultReadingPlans(extents);
    expect(nt!.days.slice(0, 2)).toEqual([
      { dayNumber: 1, startVerseId: 40001001, endVerseId: 40001025, label: 'Matthew 1' },
      { dayNumber: 2, startVerseId: 40002001, endVerseId: 40002023, label: 'Matthew 2' },
    ]);
    expect(psalms!.days).toEqual([{ dayNumber: 1, startVerseId: 19001001, endVerseId: 19001006, label: 'Psalms 1' }]);
  });
});
