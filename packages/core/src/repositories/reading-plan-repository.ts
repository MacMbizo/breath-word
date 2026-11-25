// FR-104 Focus Mode & Manna Pacing (A2 FR-104; B4 §4.2 `reading_plans` / `reading_plan_days`
// in the `study_refs` pack; B4 §4.3 `reading_plan_enrollments` / `reading_progress` in the
// synced `user_data.sqlite`).
//
// Per AGENTS.md rule 1 this is the ONLY place reading-plan SQL may live; UI apps never write
// SQL. Manna Mode gates Day N+1 until Day N is marked complete — the unlocked day is always
// the highest completed day plus one, and `manna_locked` on the enrollment is the user's
// optional override toggle (when false the UI may jump ahead).
//
// All synced writes are soft (`deleted_at`); this file never emits a hard `DELETE`.

import type { ContentDbAdapter, CryptoPrimitivesAdapter, UserDbAdapter } from '../adapters';
import { uuidV4 } from '../crypto/uuid';
import type {
  ReadingPlan,
  ReadingPlanDay,
  ReadingPlanEnrollment,
  ReadingProgress,
} from '../domain/types';
import { AppError } from '../errors/AppError';

/** Default pack that carries `reading_plans` / `reading_plan_days` (B4 §4.2 pack type 3). */
const DEFAULT_STUDY_REFS_PACK = 'study_refs';

/** Attached schema names are used as SQL identifiers, so they must be boring. */
const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;

interface ReadingPlanRow {
  plan_id: string;
  title: string;
  description: string;
  total_days: number;
  category: string;
  recommended_manna_mode: number;
}

interface ReadingPlanDayRow {
  id: number;
  plan_id: string;
  day_number: number;
  sequence_order: number;
  start_verse_id: number;
  end_verse_id: number;
  label: string;
}

interface EnrollmentRow {
  id: string;
  user_id: string;
  plan_id: string;
  started_at: string;
  manna_locked: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ProgressRow {
  id: string;
  user_id: string;
  enrollment_id: string;
  plan_id: string;
  day_number: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Today's unlocked readings for one enrollment (FR-104 Manna Mode). */
export interface MannaToday {
  readonly planId: string;
  readonly dayNumber: number;
  readonly readings: ReadingPlanDay[];
}

export interface ReadingPlanRepositoryOptions {
  readonly contentDb: ContentDbAdapter;
  readonly userDb: UserDbAdapter;
  /** CSPRNG source for UUID v4 primary keys (B4 §4.3). */
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  /** Pack id holding `reading_plans` / `reading_plan_days`; defaults to `study_refs`. */
  readonly studyRefsPackId?: string;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * FR-104 — reading plans (content) + per-user enrollment & Manna pacing (synced user data).
 * One instance is reused for the whole session.
 */
export class ReadingPlanRepository {
  private readonly contentDb: ContentDbAdapter;
  private readonly userDb: UserDbAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  private readonly studyRefsPackId: string;
  private readonly now: () => number;

  constructor(options: ReadingPlanRepositoryOptions) {
    this.contentDb = options.contentDb;
    this.userDb = options.userDb;
    this.crypto = options.crypto;
    this.studyRefsPackId = options.studyRefsPackId ?? DEFAULT_STUDY_REFS_PACK;
    this.now = options.now ?? Date.now;
  }

  /** Every plan shipped in the `study_refs` pack, alphabetical by title. */
  async listPlans(): Promise<ReadingPlan[]> {
    await this.assertStudyRefsAttached();
    const { rows } = await this.contentDb.query<ReadingPlanRow>(
      `SELECT plan_id, title, description, total_days, category, recommended_manna_mode
         FROM "${this.studyRefsPackId}".reading_plans
        ORDER BY title ASC`,
    );
    return rows.map(toReadingPlan);
  }

  async getPlan(planId: string): Promise<ReadingPlan | null> {
    await this.assertStudyRefsAttached();
    const { rows } = await this.contentDb.query<ReadingPlanRow>(
      `SELECT plan_id, title, description, total_days, category, recommended_manna_mode
         FROM "${this.studyRefsPackId}".reading_plans
        WHERE plan_id = ?`,
      [planId],
    );
    const row = rows[0];
    return row === undefined ? null : toReadingPlan(row);
  }

  /** FR-104 — one day's passage(s), ordered for multiple readings per day. */
  async getDayReadings(planId: string, dayNumber: number): Promise<ReadingPlanDay[]> {
    await this.assertStudyRefsAttached();
    const { rows } = await this.contentDb.query<ReadingPlanDayRow>(
      `SELECT id, plan_id, day_number, sequence_order, start_verse_id, end_verse_id, label
         FROM "${this.studyRefsPackId}".reading_plan_days
        WHERE plan_id = ? AND day_number = ?
        ORDER BY sequence_order ASC`,
      [planId, dayNumber],
    );
    return rows.map(toReadingPlanDay);
  }

  /**
   * Enroll a user in a plan (idempotent per active enrollment). Defaults `manna_locked` to
   * the plan's `recommended_manna_mode`.
   */
  async enroll(
    userId: string,
    planId: string,
    options: { mannaLocked?: boolean } = {},
  ): Promise<ReadingPlanEnrollment> {
    const plan = await this.getPlan(planId);
    const existing = await this.getActiveEnrollment(userId, planId);
    if (existing !== null) {
      return existing;
    }

    const timestamp = this.timestamp();
    const enrollment: ReadingPlanEnrollment = {
      id: uuidV4(this.crypto.randomBytes),
      userId,
      planId,
      startedAt: timestamp,
      mannaLocked: options.mannaLocked ?? plan?.recommendedMannaMode ?? true,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO reading_plan_enrollments
           (id, user_id, plan_id, started_at, manna_locked, is_active, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        [
          enrollment.id,
          enrollment.userId,
          enrollment.planId,
          enrollment.startedAt,
          enrollment.mannaLocked ? 1 : 0,
          enrollment.createdAt,
          enrollment.updatedAt,
        ],
      );
    });

    return enrollment;
  }

  /** The user's active enrollment for a plan, or `null`. */
  async getActiveEnrollment(userId: string, planId: string): Promise<ReadingPlanEnrollment | null> {
    const { rows } = await this.userDb.query<EnrollmentRow>(
      `SELECT id, user_id, plan_id, started_at, manna_locked, is_active, created_at, updated_at, deleted_at
         FROM reading_plan_enrollments
        WHERE user_id = ? AND plan_id = ? AND is_active = 1 AND deleted_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1`,
      [userId, planId],
    );
    const row = rows[0];
    return row === undefined ? null : toEnrollment(row);
  }

  /**
   * Soft-delete an enrollment and tombstone its progress in one transaction (B4 §4.3 rule 3).
   * No hard `DELETE` is ever issued against synced tables.
   */
  async deleteEnrollment(enrollmentId: string): Promise<void> {
    const timestamp = this.timestamp();
    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE reading_plan_enrollments
            SET is_active = 0, deleted_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, enrollmentId],
      );
      await tx.execute(
        `UPDATE reading_progress
            SET deleted_at = ?, updated_at = ?
          WHERE enrollment_id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, enrollmentId],
      );
    });
  }

  /** All non-deleted progress rows for an enrollment, ordered by day. */
  async getProgress(enrollmentId: string): Promise<ReadingProgress[]> {
    const { rows } = await this.userDb.query<ProgressRow>(
      `SELECT id, user_id, enrollment_id, plan_id, day_number, completed_at, created_at, updated_at, deleted_at
         FROM reading_progress
        WHERE enrollment_id = ? AND deleted_at IS NULL
        ORDER BY day_number ASC`,
      [enrollmentId],
    );
    return rows.map(toProgress);
  }

  /** Day numbers already marked complete, ascending. */
  async getCompletedDays(enrollmentId: string): Promise<number[]> {
    const progress = await this.getProgress(enrollmentId);
    return progress
      .filter((row) => row.completedAt !== undefined)
      .map((row) => row.dayNumber)
      .sort((a, b) => a - b);
  }

  /**
   * FR-104 Manna pacing — the day the user may read now: the highest completed day plus one
   * (day 1 when nothing is complete). Completing Day N therefore unlocks Day N+1.
   */
  async getUnlockedDay(enrollmentId: string): Promise<number> {
    const completed = await this.getCompletedDays(enrollmentId);
    const highest = completed.length === 0 ? 0 : (completed[completed.length - 1] as number);
    return highest + 1;
  }

  /** Whether `dayNumber` is unlocked for this enrollment (always true for Day 1+ up to unlocked). */
  async isDayUnlocked(enrollmentId: string, dayNumber: number): Promise<boolean> {
    if (dayNumber < 1) {
      return false;
    }
    return dayNumber <= (await this.getUnlockedDay(enrollmentId));
  }

  /** FR-104 — today's unlocked reading block for the plan. */
  async getTodayReading(planId: string, enrollmentId: string): Promise<MannaToday> {
    const dayNumber = await this.getUnlockedDay(enrollmentId);
    const readings = await this.getDayReadings(planId, dayNumber);
    return { planId, dayNumber, readings };
  }

  /**
   * Mark a day complete (upsert on the `UNIQUE (enrollment_id, day_number)` key) and thereby
   * unlock the next day. Re-completing a day refreshes `completed_at` without duplicating rows.
   */
  async markDayComplete(
    userId: string,
    enrollmentId: string,
    planId: string,
    dayNumber: number,
  ): Promise<ReadingProgress> {
    const timestamp = this.timestamp();
    const existing = await this.findProgressRow(enrollmentId, dayNumber);

    if (existing !== null) {
      await this.userDb.writeTransaction(async (tx) => {
        await tx.execute(
          `UPDATE reading_progress
              SET completed_at = ?, updated_at = ?, deleted_at = NULL
            WHERE id = ?`,
          [timestamp, timestamp, existing.id],
        );
      });
      return toProgress({ ...existing, completed_at: timestamp, updated_at: timestamp, deleted_at: null });
    }

    const progress: ReadingProgress = {
      id: uuidV4(this.crypto.randomBytes),
      userId,
      enrollmentId,
      planId,
      dayNumber,
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO reading_progress
           (id, user_id, enrollment_id, plan_id, day_number, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          progress.id,
          progress.userId,
          progress.enrollmentId,
          progress.planId,
          progress.dayNumber,
          progress.completedAt,
          progress.createdAt,
          progress.updatedAt,
        ],
      );
    });

    return progress;
  }

  /** The persisted progress row for a day, deleted or not (so re-completion revives it). */
  private async findProgressRow(enrollmentId: string, dayNumber: number): Promise<ProgressRow | null> {
    const { rows } = await this.userDb.query<ProgressRow>(
      `SELECT id, user_id, enrollment_id, plan_id, day_number, completed_at, created_at, updated_at, deleted_at
         FROM reading_progress
        WHERE enrollment_id = ? AND day_number = ?
        LIMIT 1`,
      [enrollmentId, dayNumber],
    );
    const row = rows[0];
    return row === undefined ? null : row;
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private async assertStudyRefsAttached(): Promise<void> {
    const attached = SAFE_PACK_ID.test(this.studyRefsPackId)
      ? await this.contentDb.getAttachedPacks()
      : [];
    if (!attached.includes(this.studyRefsPackId)) {
      throw new AppError({
        code: 'DB_CONTENT_PACK_NOT_ATTACHED',
        domain: 'DB',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Readings for this plan are not installed yet.',
        internalDetail: `Content pack "${this.studyRefsPackId}" is not attached.`,
      });
    }
  }
}

function toReadingPlan(row: ReadingPlanRow): ReadingPlan {
  return {
    planId: row.plan_id,
    title: row.title,
    description: row.description,
    totalDays: row.total_days,
    category: row.category as ReadingPlan['category'],
    recommendedMannaMode: row.recommended_manna_mode === 1,
  };
}

function toReadingPlanDay(row: ReadingPlanDayRow): ReadingPlanDay {
  return {
    id: row.id,
    planId: row.plan_id,
    dayNumber: row.day_number,
    sequenceOrder: row.sequence_order,
    startVerseId: row.start_verse_id,
    endVerseId: row.end_verse_id,
    label: row.label,
  };
}

function toEnrollment(row: EnrollmentRow): ReadingPlanEnrollment {
  const enrollment: ReadingPlanEnrollment = {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    startedAt: row.started_at,
    mannaLocked: row.manna_locked === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return row.deleted_at === null ? enrollment : { ...enrollment, deletedAt: row.deleted_at };
}

function toProgress(row: ProgressRow): ReadingProgress {
  const progress: ReadingProgress = {
    id: row.id,
    userId: row.user_id,
    enrollmentId: row.enrollment_id,
    planId: row.plan_id,
    dayNumber: row.day_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return {
    ...progress,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
  };
}
