// FR-303 Automated Passage Guide & Factbook (`study_refs` pack, B4 §4.2).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { STUDY_REFS_PACK_DDL, TRANSLATION_PACK_DDL } from '../src/content/pack-schema';
import { isAppError } from '../src/errors/AppError';
import { StudyRefsRepository } from '../src/repositories/study-refs-repository';

import { NodeContentDbAdapter } from './helpers/node-content-db';
import { DatabaseSync } from './helpers/node-sqlite';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-study-refs-'));
const studyRefsPath = join(tmpRoot, 'study_refs.sqlite');
const bsbPath = join(tmpRoot, 'core_bsb.sqlite');

beforeAll(() => {
  const srDb = new DatabaseSync(studyRefsPath);
  try {
    srDb.exec(STUDY_REFS_PACK_DDL);
    srDb
      .prepare(
        `INSERT INTO pack_metadata
           (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
         VALUES ('study_refs', 'STUDY_REFS', 1, '1.0.0', 'Study References', 'CC-BY-SA-4.0', 'OpenBible.info & Theographic Bible Metadata', '2026-11-27T00:00:00Z')`,
      )
      .run();

    // TSK cross references for Romans 8:28 (45008028)
    const insertXref = srDb.prepare(
      `INSERT INTO cross_references (from_verse_id, to_start_verse_id, to_end_verse_id, votes, source)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insertXref.run(45008028, 1050020, 1050020, 42, 'TSK'); // Genesis 50:20
    insertXref.run(45008028, 24029011, 24029011, 95, 'TSK'); // Jeremiah 29:11
    insertXref.run(45008028, 49001011, 49001011, 61, 'TSK'); // Ephesians 1:11

    // Factbook entities: Ephesus + Paul
    const insertEntity = srDb.prepare(
      `INSERT INTO factbook_entities
         (entity_id, entity_type, name, aliases_json, summary, latitude, longitude, era_label, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertEntity.run(
      'place:ephesus',
      'place',
      'Ephesus',
      JSON.stringify(['Ephesos']),
      'Major Roman port city in Asia Minor where Paul ministered for nearly three years.',
      37.9411,
      27.3419,
      'Apostolic Era',
      JSON.stringify({ region: 'Asia Minor' }),
    );
    insertEntity.run(
      'person:paul_1',
      'person',
      'Paul',
      JSON.stringify(['Saul of Tarsus']),
      'Apostle to the Gentiles and author of the Epistle to the Romans.',
      null,
      null,
      'Apostolic Era',
      JSON.stringify({ role: 'Apostle' }),
    );

    const insertLink = srDb.prepare(
      `INSERT INTO factbook_verse_links (entity_id, canonical_verse_id) VALUES (?, ?)`,
    );
    insertLink.run('place:ephesus', 44019001); // Acts 19:1
    insertLink.run('place:ephesus', 49001001); // Ephesians 1:1
    insertLink.run('person:paul_1', 45008028); // Romans 8:28
  } finally {
    srDb.close();
  }

  const trDb = new DatabaseSync(bsbPath);
  try {
    trDb.exec(TRANSLATION_PACK_DDL);
    trDb
      .prepare(
        `INSERT INTO pack_metadata
           (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
         VALUES ('core_bsb', 'TRANSLATION', 1, '1.0.0', 'BSB', 'CC0-1.0', 'Public domain', '2026-11-27T00:00:00Z')`,
      )
      .run();
    trDb
      .prepare(
        `INSERT INTO books (book_number, osis_code, name, testament, chapter_count, literary_genre)
         VALUES (45, 'Rom', 'Romans', 'NT', 16, 'EPISTLE')`,
      )
      .run();
  } finally {
    trDb.close();
  }
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let contentDb: NodeContentDbAdapter;
let repo: StudyRefsRepository;

beforeEach(async () => {
  contentDb = new NodeContentDbAdapter();
  await contentDb.attachPack('study_refs', studyRefsPath);
  await contentDb.attachPack('core_bsb', bsbPath);
  repo = new StudyRefsRepository({ contentDb });
});

afterEach(() => {
  contentDb.close();
});

describe('StudyRefsRepository (FR-303)', () => {
  it('compiles Passage Guide on Rom 8:28 with top-voted TSK refs, EPISTLE genre, and linked entities', async () => {
    const guide = await repo.getPassageGuide(45008001, 45008039, { translationPackId: 'core_bsb' });
    expect(guide.passageReference).toBe('Romans 8:1-39');
    expect(guide.literaryGenre).toBe('EPISTLE');
    expect(guide.crossReferences.map((x) => x.votes)).toEqual([95, 61, 42]);
    expect(guide.crossReferences[0]?.passageReference).toBe('Jeremiah 29:11');
    expect(guide.entities.map((e) => e.entityId)).toEqual(['person:paul_1']);
  });

  it('opens Factbook dossier for Ephesus with coordinates and Acts/Epistles occurrences', async () => {
    const dossier = await repo.getFactbookDossier('place:ephesus');
    expect(dossier).not.toBeNull();
    expect(dossier?.entity.name).toBe('Ephesus');
    expect(dossier?.entity.aliases).toEqual(['Ephesos']);
    expect(dossier?.entity.latitude).toBeCloseTo(37.9411, 3);
    expect(dossier?.entity.longitude).toBeCloseTo(27.3419, 3);
    expect(dossier?.references).toEqual(['Acts 19:1', 'Ephesians 1:1']);
  });

  it('searches Factbook entities by alias and type offline', async () => {
    const byAlias = await repo.searchEntities('Saul', 'person');
    expect(byAlias.map((e) => e.entityId)).toEqual(['person:paul_1']);
  });

  it('throws canonical DB_CONTENT_PACK_NOT_ATTACHED when study_refs is missing', async () => {
    await contentDb.detachPack('study_refs');
    try {
      await repo.getCrossReferences(45008028);
      expect.unreachable('Expected DB_CONTENT_PACK_NOT_ATTACHED');
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) {
        expect(err.code).toBe('DB_CONTENT_PACK_NOT_ATTACHED');
      }
    }
  });
});
