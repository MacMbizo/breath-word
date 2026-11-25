// FR-104 Focus Mode & Manna Pacing — reading plans (`study_refs` pack) + synced
// enrollment/progress (`user_data.sqlite`), B4 §4.2/§4.3, C3 `DB_CONTENT_PACK_NOT_ATTACHED`.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { isAppError } from '../src/errors/AppError';
import { ReadingPlanRepository } from '../src/repositories/reading-plan-repository';

import { writeStudyRefsPack } from './helpers/fixture-study-refs-pack';
import { NodeContentDbAdapter } from './helpers/node-content-db';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FIXED_NOW = Date.parse('2026-11-25T08:30:00Z');

const PLAN_GOSPELS = 'plan_manna_gospels_3';
const PLAN_ANXIETY = 'plan_topical_anxiety';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-reading-plan-'));
const studyRefsPath = join(tmpRoot, 'study_refs.sqlite');

beforeAll(() => {
  writeStudyRefsPack(studyRefsPath, {
    plans: [
      {
        planId: PLAN_GOSPELS,
        title: 'Gospels in 3 Days',
        description: 'A short walk through the Gospels.',
        totalDays: 3,
        category: 'NEW_TESTAMENT',
        recommendedMannaMode: true,
      },
      {
        planId: PLAN_ANXIETY,
        title: 'Anxiety in 2 Days',
        description: 'Two days of restful passages.',
        totalDays: 2,
        category: 'TOPICAL',
        recommendedMannaMode: false,
      },
    ],
    days: {
      [PLAN_GOSPELS]: [
        { dayNumber: 1, sequenceOrder: 1, startVerseId: 19023001, endVerseId: 19023006, label: 'Psalm 23' },
        { dayNumber: 1, sequenceOrder: 2, startVerseId: 43001001, endVerseId: 43001018, label: 'John 1:1-18' },
        { dayNumber: 2, startVerseId: 45008001, endVerseId: 45008017, label: 'Romans 8:1-17' },
        { dayNumber: 3, startVerseId: 43003001, endVerseId: 43003021, label: 'John 3:1-21' },
      ],
      [PLAN_ANXIETY]: [
        { dayNumber: 1, startVerseId: 50006025, endVerseId: 50006034, label: 'Philippians 4:6-7' },
        { dayNumber: 2, startVerseId: 60005007, endVerseId: 60005007, label: '1 Peter 5:7' },
      ],
    },
  });
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let contentDb: NodeContentDbAdapter;
let userDb: NodeUserDbAdapter;
let repo: ReadingPlanRepository;

beforeEach(async () => {
  contentDb = new NodeContentDbAdapter();
  await contentDb.attachPack('study_refs', studyRefsPath);
  userDb = new NodeUserDbAdapter();
  repo = new ReadingPlanRepository({
    contentDb,
    userDb,
    crypto: webCryptoAdapter,
    now: () => FIXED_NOW,
  });
});

afterEach(() => {
  contentDb.close();
  userDb.close();
});

async function countRows(table: string): Promise<number> {
  const result = await userDb.query<{ c: number }>(`SELECT count(*) AS c FROM ${table}`);
  return result.rows[0]?.c ?? -1;
}

describe('ReadingPlanRepository content reads (FR-104)', () => {
  it('lists every plan in the study_refs pack, ordered by title', async () => {
    const plans = await repo.listPlans();
    expect(plans.map((plan) => plan.planId)).toEqual([PLAN_ANXIETY, PLAN_GOSPELS]);
  });

  it('returns a plan with its canonical fields', async () => {
    const plan = await repo.getPlan(PLAN_GOSPELS);
    expect(plan).toEqual({
      planId: PLAN_GOSPELS,
      title: 'Gospels in 3 Days',
      description: 'A short walk through the Gospels.',
      totalDays: 3,
      category: 'NEW_TESTAMENT',
      recommendedMannaMode: true,
    });
  });

  it('returns null for an unknown plan', async () => {
    expect(await repo.getPlan('plan_does_not_exist')).toBeNull();
  });

  it("returns one day's readings in sequence order (multiple readings per day)", async () => {
    const readings = await repo.getDayReadings(PLAN_GOSPELS, 1);
    expect(readings.map((reading) => reading.label)).toEqual(['Psalm 23', 'John 1:1-18']);
    expect(readings.map((reading) => reading.sequenceOrder)).toEqual([1, 2]);
  });

  it('surfaces DB_CONTENT_PACK_NOT_ATTACHED when the pack is missing', async () => {
    const bareContentDb = new NodeContentDbAdapter();
    const bareRepo = new ReadingPlanRepository({
      contentDb: bareContentDb,
      userDb,
      crypto: webCryptoAdapter,
    });
    try {
      const error = await bareRepo.listPlans().catch((e: unknown) => e);
      expect(isAppError(error) && error.code).toBe('DB_CONTENT_PACK_NOT_ATTACHED');
    } finally {
      bareContentDb.close();
    }
  });
});

describe('ReadingPlanRepository enrollment (FR-104)', () => {
  it('has no active enrollment before enrolling', async () => {
    expect(await repo.getActiveEnrollment(USER_ID, PLAN_GOSPELS)).toBeNull();
  });

  it("defaults manna_locked to the plan's recommended mode", async () => {
    const locked = await repo.enroll(USER_ID, PLAN_GOSPELS);
    expect(locked.mannaLocked).toBe(true);
    expect(locked.isActive).toBe(true);
    expect(locked.startedAt).toBe('2026-11-25T08:30:00.000Z');

    const relaxed = await repo.enroll(USER_ID, PLAN_ANXIETY);
    expect(relaxed.mannaLocked).toBe(false);
  });

  it('is idempotent — a second enroll returns the same active enrollment', async () => {
    const first = await repo.enroll(USER_ID, PLAN_GOSPELS);
    const second = await repo.enroll(USER_ID, PLAN_GOSPELS);

    expect(second.id).toBe(first.id);
    expect(await countRows('reading_plan_enrollments')).toBe(1);
    expect(await repo.getActiveEnrollment(USER_ID, PLAN_GOSPELS)).toEqual(first);
  });

  it('honours an explicit mannaLocked override', async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_GOSPELS, { mannaLocked: false });
    expect(enrollment.mannaLocked).toBe(false);
  });
});

describe('ReadingPlanRepository Manna pacing (FR-104)', () => {
  it('starts with only Day 1 unlocked', async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_GOSPELS);

    expect(await repo.getUnlockedDay(enrollment.id)).toBe(1);
    expect(await repo.isDayUnlocked(enrollment.id, 1)).toBe(true);
    expect(await repo.isDayUnlocked(enrollment.id, 2)).toBe(false);
  });

  it("returns today's unlocked reading block", async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_GOSPELS);
    const today = await repo.getTodayReading(PLAN_GOSPELS, enrollment.id);

    expect(today.dayNumber).toBe(1);
    expect(today.readings.map((reading) => reading.label)).toEqual(['Psalm 23', 'John 1:1-18']);
  });

  it('completing Day N unlocks Day N+1 and updates reading_progress', async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_GOSPELS);

    const progress = await repo.markDayComplete(USER_ID, enrollment.id, PLAN_GOSPELS, 1);
    expect(progress.completedAt).toBe('2026-11-25T08:30:00.000Z');
    expect(progress.enrollmentId).toBe(enrollment.id);

    expect(await repo.getCompletedDays(enrollment.id)).toEqual([1]);
    expect(await repo.getUnlockedDay(enrollment.id)).toBe(2);
    expect(await repo.isDayUnlocked(enrollment.id, 2)).toBe(true);

    const today = await repo.getTodayReading(PLAN_GOSPELS, enrollment.id);
    expect(today.dayNumber).toBe(2);
    expect(today.readings[0]?.label).toBe('Romans 8:1-17');
  });

  it('re-completing a day refreshes it without duplicating progress rows', async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_GOSPELS);

    await repo.markDayComplete(USER_ID, enrollment.id, PLAN_GOSPELS, 1);
    await repo.markDayComplete(USER_ID, enrollment.id, PLAN_GOSPELS, 1);

    expect(await repo.getCompletedDays(enrollment.id)).toEqual([1]);
    expect(await repo.getProgress(enrollment.id)).toHaveLength(1);
    expect(await countRows('reading_progress')).toBe(1);
  });

  it('keeps the unlocked day at the plan length once the final day is complete', async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_ANXIETY);

    await repo.markDayComplete(USER_ID, enrollment.id, PLAN_ANXIETY, 1);
    await repo.markDayComplete(USER_ID, enrollment.id, PLAN_ANXIETY, 2);

    expect(await repo.getCompletedDays(enrollment.id)).toEqual([1, 2]);
    expect(await repo.getUnlockedDay(enrollment.id)).toBe(3);
    expect(await repo.getDayReadings(PLAN_ANXIETY, 3)).toEqual([]);
  });
});

describe('ReadingPlanRepository soft delete (B4 §4.3 rule 3)', () => {
  it('tombstones the enrollment and its progress without a hard DELETE', async () => {
    const enrollment = await repo.enroll(USER_ID, PLAN_GOSPELS);
    await repo.markDayComplete(USER_ID, enrollment.id, PLAN_GOSPELS, 1);

    await repo.deleteEnrollment(enrollment.id);

    expect(await repo.getActiveEnrollment(USER_ID, PLAN_GOSPELS)).toBeNull();
    expect(await repo.getProgress(enrollment.id)).toEqual([]);

    // Rows are retained on disk (soft delete), never physically removed.
    expect(await countRows('reading_plan_enrollments')).toBe(1);
    expect(await countRows('reading_progress')).toBe(1);

    const tombstone = await userDb.query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM reading_plan_enrollments WHERE id = ?',
      [enrollment.id],
    );
    expect(tombstone.rows[0]?.deleted_at).toBe('2026-11-25T08:30:00.000Z');
  });
});
