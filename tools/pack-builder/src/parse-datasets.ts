// Raw open datasets → normalized pack sources (B4 §4.6 "parse" step; plan unit P3-09).
//
//   parse-datasets exegesis   --tagnt <file>… --tahot <file>… --tbesg <file> --tbesh <file> --out <json>
//   parse-datasets study-refs --openbible <cross_references.txt> --theographic <dir> --out <json>
//
// Then build with `pack-builder --source <json> --out <dir>`. Licence + attribution text is fixed
// here, per B5: STEPBible is CC BY 4.0 (credit "STEPBible.org / Tyndale House, Cambridge" + licence
// link); OpenBible.info is CC BY 4.0; Theographic is CC BY-SA 4.0, so the study_refs pack is BY-SA.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseOpenBibleCrossReferences } from './datasets/openbible';
import { chapterExtents, defaultReadingPlans } from './datasets/reading-plans';
import { parseStepLexicon, parseStepTaggedText } from './datasets/stepbible';
import { parseTheographic } from './datasets/theographic';
import { EXEGESIS_PACK_ID, type ExegesisPackSource } from './exegesis-pack';
import { STUDY_REFS_PACK_ID, type StudyRefsPackSource } from './study-refs-pack';

export const STEPBIBLE_ATTRIBUTION =
  'Original-language data from STEPBible.org / Tyndale House, Cambridge (TAGNT, TAHOT, TBESG, TBESH), ' +
  'licensed CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/';

export const STUDY_REFS_ATTRIBUTION =
  'Cross-references from OpenBible.info (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). ' +
  'People and places from Theographic Bible Metadata by Robert Rouse (CC BY-SA 4.0), with summaries ' +
  "from Easton's Bible Dictionary (public domain). This pack is shared under CC BY-SA 4.0 (ShareAlike) — " +
  'https://creativecommons.org/licenses/by-sa/4.0/';

const read = (path: string): string => readFileSync(path, 'utf8');

export interface ExegesisDatasetFiles {
  tagnt: string[];
  tahot: string[];
  tbesg?: string;
  tbesh?: string;
}

export function exegesisSourceFromFiles(
  files: ExegesisDatasetFiles,
  contentVersion: string,
  builtAt: string,
): { source: ExegesisPackSource; skippedVariantWords: number } {
  const parts = [
    ...files.tagnt.map((path) => parseStepTaggedText(read(path), 'greek')),
    ...files.tahot.map((path) => parseStepTaggedText(read(path), 'hebrew')),
  ];
  const lexicon = [
    ...(files.tbesg !== undefined ? parseStepLexicon(read(files.tbesg), 'greek') : []),
    ...(files.tbesh !== undefined ? parseStepLexicon(read(files.tbesh), 'hebrew') : []),
  ];
  return {
    source: {
      metadata: {
        packId: EXEGESIS_PACK_ID,
        packType: 'EXEGESIS',
        contentVersion,
        displayName: 'STEPBible Interlinear & Lexicons',
        licenseSpdx: 'CC-BY-4.0',
        attributionText: STEPBIBLE_ATTRIBUTION,
        builtAt,
      },
      versificationMaps: parts.flatMap((part) => part.versificationMaps),
      tokens: parts.flatMap((part) => part.tokens),
      lexicon,
    },
    skippedVariantWords: parts.reduce((sum, part) => sum + part.skippedVariantWords, 0),
  };
}

export function studyRefsSourceFromFiles(
  openBiblePath: string | undefined,
  theographicDir: string | undefined,
  contentVersion: string,
  builtAt: string,
): StudyRefsPackSource {
  const crossReferences = openBiblePath !== undefined ? parseOpenBibleCrossReferences(read(openBiblePath)) : [];
  let entities: StudyRefsPackSource['entities'] = [];
  let readingPlans: StudyRefsPackSource['readingPlans'] = [];
  if (theographicDir !== undefined) {
    const verses = JSON.parse(read(join(theographicDir, 'verses.json'))) as {
      id: string;
      fields: Record<string, unknown>;
    }[];
    entities = parseTheographic({
      people: JSON.parse(read(join(theographicDir, 'people.json'))),
      places: JSON.parse(read(join(theographicDir, 'places.json'))),
      verses,
    });
    // Chapter lengths for the FR-104 plans come from the same canonical verse list.
    readingPlans = defaultReadingPlans(
      chapterExtents(verses.map((verse) => Number(verse.fields.verseID)).filter((id) => Number.isFinite(id))),
    );
  }
  return {
    metadata: {
      packId: STUDY_REFS_PACK_ID,
      packType: 'STUDY_REFS',
      contentVersion,
      displayName: 'Passage Guide & Factbook',
      licenseSpdx: entities.length > 0 ? 'CC-BY-SA-4.0' : 'CC-BY-4.0',
      attributionText: STUDY_REFS_ATTRIBUTION,
      builtAt,
    },
    crossReferences,
    entities,
    readingPlans,
  };
}

const USAGE = `Usage:
  parse-datasets exegesis   --tagnt <file> [--tagnt <file>…] --tahot <file> [--tahot <file>…]
                            [--tbesg <file>] [--tbesh <file>] --out <source.json> [--content-version <v>]
  parse-datasets study-refs [--openbible <cross_references.txt>] [--theographic <dir>]
                            --out <source.json> [--content-version <v>]
`;

export function main(argv: readonly string[]): void {
  const [command, ...rest] = argv;
  const multi = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag?.startsWith('--') === true && value !== undefined) {
      multi.set(flag, [...(multi.get(flag) ?? []), value]);
    }
  }
  const one = (flag: string): string | undefined => multi.get(flag)?.[0];
  const out = one('--out');
  const contentVersion = one('--content-version') ?? '1.0.0';
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (out === undefined || (command !== 'exegesis' && command !== 'study-refs')) {
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  if (command === 'exegesis') {
    const { source, skippedVariantWords } = exegesisSourceFromFiles(
      {
        tagnt: multi.get('--tagnt') ?? [],
        tahot: multi.get('--tahot') ?? [],
        ...(one('--tbesg') !== undefined ? { tbesg: one('--tbesg')! } : {}),
        ...(one('--tbesh') !== undefined ? { tbesh: one('--tbesh')! } : {}),
      },
      contentVersion,
      builtAt,
    );
    writeFileSync(out, JSON.stringify(source));
    process.stdout.write(
      `parse-datasets: ${source.tokens.length} tokens, ${source.lexicon.length} lexicon entries, ` +
        `${source.versificationMaps.length} versification maps (${skippedVariantWords} non-NA variant words skipped) -> ${out}\n`,
    );
    return;
  }

  const source = studyRefsSourceFromFiles(one('--openbible'), one('--theographic'), contentVersion, builtAt);
  writeFileSync(out, JSON.stringify(source));
  process.stdout.write(
    `parse-datasets: ${source.crossReferences.length} cross-references, ${source.entities.length} factbook entities, ` +
      `${source.readingPlans?.length ?? 0} reading plans -> ${out}\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
