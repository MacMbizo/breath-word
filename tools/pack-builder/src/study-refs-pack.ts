// tools/pack-builder — STUDY_REFS pack ETL (`study_refs`; B4 §4.2 pack type 3, B5, plan unit P3-09).
//
// Input is a normalized `StudyRefsPackSource` produced by dataset parsers: OpenBible.info / TSK
// cross-references (votes-weighted), Theographic people/places/events (Factbook), and the FR-104
// reading plans. The builder validates every row, enforces the B5 licence rules, bulk-inserts into
// `STUDY_REFS_PACK_DDL` in one transaction, and verifies the result before it can be published.
//
// B5 ShareAlike isolation rule: Theographic data is CC BY-SA 4.0, so a pack carrying Factbook
// entities must itself be published under CC-BY-SA-4.0 and say so in `attribution_text`.

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { DatabaseSync } from './node-sqlite';
import {
  assertPackMetadata,
  closeAndDiscard,
  closeQuietly,
  insertPackMetadata,
  isStrictCanonicalVerseId,
  packIntegrityFailed,
  packSourceInvalid,
  packageArtifacts,
  verifyPackDatabase,
  type PackBuildArtifacts,
  type PackBuildOptions,
  type PackMetadataInput,
} from './pack-common';

import { STUDY_REFS_PACK_DDL, type FactbookEntityType, type ReadingPlanCategory } from '@breath-and-word/core';

/** The runtime's default study-refs pack id (`StudyRefsRepository`). */
export const STUDY_REFS_PACK_ID = 'study_refs';

const ENTITY_TYPES: readonly FactbookEntityType[] = ['person', 'place', 'event', 'topic'];
const PLAN_CATEGORIES: readonly ReadingPlanCategory[] = ['WHOLE_BIBLE', 'NEW_TESTAMENT', 'PSALMS_PROVERBS', 'TOPICAL'];
const SAFE_ENTITY_ID = /^[a-z0-9][a-z0-9_.:-]*$/;
const SHARE_ALIKE_LICENCE = 'CC-BY-SA-4.0';

export interface CrossReferenceInput {
  fromVerseId: number;
  toStartVerseId: number;
  /** Defaults to `toStartVerseId` (single-verse target). */
  toEndVerseId?: number;
  /** OpenBible.info community votes; may be negative. Defaults to 0. */
  votes?: number;
  /** Defaults to `TSK`. */
  source?: string;
}

export interface FactbookEntityInput {
  /** Stable lower-case id, e.g. `place:ephesus`. */
  entityId: string;
  entityType: FactbookEntityType;
  name: string;
  aliases?: string[];
  summary: string;
  latitude?: number;
  longitude?: number;
  eraLabel?: string;
  metadata?: Record<string, unknown>;
  /** Canonical BBCCCVVV verses that mention the entity. */
  verseIds: number[];
}

export interface ReadingPlanDayInput {
  dayNumber: number;
  /** Defaults to 1; several readings on the same day are ordered by this. */
  sequenceOrder?: number;
  startVerseId: number;
  endVerseId: number;
  label: string;
}

export interface ReadingPlanInput {
  planId: string;
  title: string;
  description: string;
  category: ReadingPlanCategory;
  /** Defaults to true (FR-104 Manna pacing on). */
  recommendedMannaMode?: boolean;
  days: ReadingPlanDayInput[];
}

/** Normalized, dependency-free input to the study-refs pack builder. */
export interface StudyRefsPackSource {
  metadata: PackMetadataInput;
  crossReferences: CrossReferenceInput[];
  entities: FactbookEntityInput[];
  readingPlans?: ReadingPlanInput[];
}

export interface StudyRefsPackBuildStats {
  crossReferenceCount: number;
  entityCount: number;
  verseLinkCount: number;
  readingPlanCount: number;
  readingPlanDayCount: number;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw packSourceInvalid(`${where} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function verseId(value: unknown, where: string): number {
  if (!isStrictCanonicalVerseId(value)) {
    throw packSourceInvalid(`${where} ${String(value)} is not a Protestant BBCCCVVV id.`);
  }
  return value;
}

function array<T>(value: unknown, where: string): T[] {
  if (!Array.isArray(value)) throw packSourceInvalid(`${where} must be an array.`);
  return value as T[];
}

function planCategory(value: unknown, where: string): ReadingPlanCategory {
  if (!PLAN_CATEGORIES.includes(value as ReadingPlanCategory)) {
    throw packSourceInvalid(`${where} "${String(value)}" is not one of ${PLAN_CATEGORIES.join(', ')}.`);
  }
  return value as ReadingPlanCategory;
}

function coordinate(value: unknown, limit: number, where: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw packSourceInvalid(`${where} must be a number within ±${limit}.`);
  }
  return value;
}

/** B5: Factbook data is CC BY-SA 4.0, so the pack carrying it must be ShareAlike too. */
function assertShareAlike(metadata: PackMetadataInput, entityCount: number): void {
  if (entityCount === 0) return;
  if (metadata.licenseSpdx.trim() !== SHARE_ALIKE_LICENCE) {
    throw packSourceInvalid(
      `${metadata.packId}: a pack with Factbook (Theographic, CC BY-SA 4.0) entities must be licensed ` +
        `${SHARE_ALIKE_LICENCE}, not "${metadata.licenseSpdx}" (B5 ShareAlike isolation rule).`,
    );
  }
  // The licence URL alone (`…/by-sa/4.0/`) does not count: the terms must be named in words.
  if (!/share\s*-?\s*alike|\bCC[\s-]BY-SA\b/i.test(metadata.attributionText)) {
    throw packSourceInvalid(
      `${metadata.packId}: attribution_text must state the ShareAlike terms (CC BY-SA 4.0) (B5).`,
    );
  }
}

/** Build `study_refs.sqlite` from a normalized source (B4 §4.2 pack type 3). */
export function buildStudyRefsPackDatabase(
  source: StudyRefsPackSource,
  sqlitePath: string,
): StudyRefsPackBuildStats {
  assertPackMetadata(source.metadata, 'STUDY_REFS');

  const crossReferences = array<CrossReferenceInput>(source.crossReferences, 'crossReferences').map((ref, index) => {
    const at = `crossReferences[${index}]`;
    const from = verseId(ref.fromVerseId, `${at}.fromVerseId`);
    const toStart = verseId(ref.toStartVerseId, `${at}.toStartVerseId`);
    const toEnd = verseId(ref.toEndVerseId ?? ref.toStartVerseId, `${at}.toEndVerseId`);
    if (toEnd < toStart) throw packSourceInvalid(`${at}: toEndVerseId precedes toStartVerseId.`);
    const votes = ref.votes ?? 0;
    if (!Number.isSafeInteger(votes)) throw packSourceInvalid(`${at}.votes must be an integer.`);
    return { from, toStart, toEnd, votes, source: optionalText(ref.source) ?? 'TSK' };
  });

  const seenEntities = new Set<string>();
  const entities = array<FactbookEntityInput>(source.entities, 'entities').map((entity, index) => {
    const at = `entities[${index}]`;
    const id = text(entity.entityId, `${at}.entityId`).toLowerCase();
    if (!SAFE_ENTITY_ID.test(id)) throw packSourceInvalid(`${at}.entityId "${id}" must match ${SAFE_ENTITY_ID.source}.`);
    if (seenEntities.has(id)) throw packSourceInvalid(`${at}.entityId "${id}" is duplicated.`);
    seenEntities.add(id);
    if (!ENTITY_TYPES.includes(entity.entityType)) {
      throw packSourceInvalid(`${at}.entityType "${String(entity.entityType)}" is not one of ${ENTITY_TYPES.join(', ')}.`);
    }
    const latitude = coordinate(entity.latitude, 90, `${at}.latitude`);
    const longitude = coordinate(entity.longitude, 180, `${at}.longitude`);
    if ((latitude === null) !== (longitude === null)) {
      throw packSourceInvalid(`${at}: latitude and longitude must be given together.`);
    }
    const aliases = array<unknown>(entity.aliases ?? [], `${at}.aliases`).map((alias, i) => text(alias, `${at}.aliases[${i}]`));
    const verseIds = [
      ...new Set(array<unknown>(entity.verseIds, `${at}.verseIds`).map((v, i) => verseId(v, `${at}.verseIds[${i}]`))),
    ];
    return {
      id,
      type: entity.entityType,
      name: text(entity.name, `${at}.name`),
      aliasesJson: JSON.stringify(aliases),
      summary: text(entity.summary, `${at}.summary`),
      latitude,
      longitude,
      eraLabel: optionalText(entity.eraLabel),
      metadataJson: JSON.stringify(entity.metadata ?? {}),
      verseIds,
    };
  });

  const seenPlans = new Set<string>();
  const plans = array<ReadingPlanInput>(source.readingPlans ?? [], 'readingPlans').map((plan, index) => {
    const at = `readingPlans[${index}]`;
    const planId = text(plan.planId, `${at}.planId`);
    if (seenPlans.has(planId)) throw packSourceInvalid(`${at}.planId "${planId}" is duplicated.`);
    seenPlans.add(planId);
    const days = array<ReadingPlanDayInput>(plan.days, `${at}.days`).map((day, i) => {
      const dayAt = `${at}.days[${i}]`;
      if (!Number.isSafeInteger(day.dayNumber) || day.dayNumber < 1) {
        throw packSourceInvalid(`${dayAt}.dayNumber must be an integer >= 1.`);
      }
      const start = verseId(day.startVerseId, `${dayAt}.startVerseId`);
      const end = verseId(day.endVerseId, `${dayAt}.endVerseId`);
      if (end < start) throw packSourceInvalid(`${dayAt}: endVerseId precedes startVerseId.`);
      return { dayNumber: day.dayNumber, sequenceOrder: day.sequenceOrder ?? 1, start, end, label: text(day.label, `${dayAt}.label`) };
    });
    if (days.length === 0) throw packSourceInvalid(`${at}.days must not be empty.`);
    const totalDays = Math.max(...days.map((day) => day.dayNumber));
    return {
      planId,
      title: text(plan.title, `${at}.title`),
      description: text(plan.description, `${at}.description`),
      category: planCategory(plan.category, `${at}.category`),
      manna: plan.recommendedMannaMode === false ? 0 : 1,
      totalDays,
      days,
    };
  });

  assertShareAlike(source.metadata, entities.length);

  rmSync(sqlitePath, { force: true });
  const db = new DatabaseSync(sqlitePath);
  try {
    db.exec(STUDY_REFS_PACK_DDL);
    db.exec('BEGIN');
    insertPackMetadata(db, source.metadata);

    const insertRef = db.prepare(
      `INSERT INTO cross_references (from_verse_id, to_start_verse_id, to_end_verse_id, votes, source)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const ref of crossReferences) insertRef.run(ref.from, ref.toStart, ref.toEnd, ref.votes, ref.source);

    const insertEntity = db.prepare(
      `INSERT INTO factbook_entities
         (entity_id, entity_type, name, aliases_json, summary, latitude, longitude, era_label, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLink = db.prepare('INSERT INTO factbook_verse_links (entity_id, canonical_verse_id) VALUES (?, ?)');
    let verseLinkCount = 0;
    for (const e of entities) {
      insertEntity.run(e.id, e.type, e.name, e.aliasesJson, e.summary, e.latitude, e.longitude, e.eraLabel, e.metadataJson);
      for (const v of e.verseIds) {
        insertLink.run(e.id, v);
        verseLinkCount += 1;
      }
    }

    const insertPlan = db.prepare(
      `INSERT INTO reading_plans (plan_id, title, description, total_days, category, recommended_manna_mode)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertDay = db.prepare(
      `INSERT INTO reading_plan_days (plan_id, day_number, sequence_order, start_verse_id, end_verse_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    let readingPlanDayCount = 0;
    for (const plan of plans) {
      insertPlan.run(plan.planId, plan.title, plan.description, plan.totalDays, plan.category, plan.manna);
      for (const day of plan.days) {
        insertDay.run(plan.planId, day.dayNumber, day.sequenceOrder, day.start, day.end, day.label);
        readingPlanDayCount += 1;
      }
    }

    db.exec('COMMIT');

    verifyPackDatabase(db, source.metadata);
    const orphanLinks = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM factbook_verse_links l
            WHERE NOT EXISTS (SELECT 1 FROM factbook_entities e WHERE e.entity_id = l.entity_id)`,
        )
        .get() as { n: number }
    ).n;
    if (orphanLinks > 0) throw packIntegrityFailed(source.metadata.packId, `${orphanLinks} factbook link(s) have no entity.`);

    return {
      crossReferenceCount: crossReferences.length,
      entityCount: entities.length,
      verseLinkCount,
      readingPlanCount: plans.length,
      readingPlanDayCount,
    };
  } catch (error) {
    closeAndDiscard(db, sqlitePath);
    throw error;
  } finally {
    closeQuietly(db);
  }
}

/** Build the study-refs `.sqlite`, gzip it, and describe it as a manifest entry. */
export function buildStudyRefsPackArtifacts(
  source: StudyRefsPackSource,
  outDir: string,
  options: PackBuildOptions,
): PackBuildArtifacts & { stats: StudyRefsPackBuildStats } {
  mkdirSync(outDir, { recursive: true });
  const sqlitePath = join(outDir, `${source.metadata.packId}-${source.metadata.contentVersion.trim()}.sqlite`);
  const stats = buildStudyRefsPackDatabase(source, sqlitePath);
  return { ...packageArtifacts(sqlitePath, source.metadata, options), stats };
}

/**
 * A tiny **sample** study-refs source for local FR-303 / FR-104 testing (Passage Guide on Romans 8,
 * the Ephesus dossier, one two-day reading plan). NOT a release pack: the vote weights and
 * summaries are illustrative, written for this fixture.
 */
export function createSampleStudyRefsPackSource(): StudyRefsPackSource {
  return {
    metadata: {
      packId: STUDY_REFS_PACK_ID,
      packType: 'STUDY_REFS',
      contentVersion: '0.0.1-sample',
      displayName: 'Study References Sample Fixture (NOT a release pack)',
      licenseSpdx: SHARE_ALIKE_LICENCE,
      attributionText:
        'Sample fixture shaped like OpenBible.info cross-references (CC BY 4.0) and Theographic Bible ' +
        'Metadata (CC BY-SA 4.0); this pack is shared under CC BY-SA 4.0 (ShareAlike) — ' +
        'https://creativecommons.org/licenses/by-sa/4.0/. For local testing only.',
      builtAt: '2026-11-27T00:00:00Z',
    },
    crossReferences: [
      { fromVerseId: 45_008_028, toStartVerseId: 1_050_020, votes: 412 },
      { fromVerseId: 45_008_028, toStartVerseId: 49_001_011, votes: 268 },
      { fromVerseId: 45_008_028, toStartVerseId: 58_012_010, toEndVerseId: 58_012_011, votes: 190 },
      { fromVerseId: 45_008_001, toStartVerseId: 43_003_018, votes: 205 },
      { fromVerseId: 45_008_039, toStartVerseId: 43_010_028, toEndVerseId: 43_010_029, votes: 301 },
    ],
    entities: [
      {
        entityId: 'place:ephesus',
        entityType: 'place',
        name: 'Ephesus',
        aliases: ['Ephesos'],
        summary: 'Port city of Roman Asia where Paul taught for over two years.',
        latitude: 37.9411,
        longitude: 27.3419,
        eraLabel: 'Apostolic Age',
        metadata: { region: 'Asia (Roman province)' },
        verseIds: [44_019_001, 44_019_010, 49_001_001, 66_002_001],
      },
      {
        entityId: 'person:paul',
        entityType: 'person',
        name: 'Paul',
        aliases: ['Saul of Tarsus'],
        summary: 'Apostle to the Gentiles and author of thirteen New Testament letters.',
        eraLabel: 'Apostolic Age',
        verseIds: [44_013_009, 45_001_001, 49_001_001],
      },
    ],
    readingPlans: [
      {
        planId: 'sample-romans-8',
        title: 'Life in the Spirit (sample)',
        description: 'Two short readings through Romans 8.',
        category: 'NEW_TESTAMENT',
        days: [
          { dayNumber: 1, startVerseId: 45_008_001, endVerseId: 45_008_017, label: 'Romans 8:1–17' },
          { dayNumber: 2, startVerseId: 45_008_018, endVerseId: 45_008_039, label: 'Romans 8:18–39' },
        ],
      },
    ],
  };
}

/** Narrow a loaded JSON source to a study-refs source by its declared pack type. */
export function isStudyRefsPackSource(value: { metadata?: { packType?: unknown } }): value is StudyRefsPackSource {
  return value.metadata?.packType === 'STUDY_REFS';
}
