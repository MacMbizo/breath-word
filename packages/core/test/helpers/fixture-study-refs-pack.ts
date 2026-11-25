// B4 §4.2 — writes a minimal but schema-faithful STUDY_REFS pack `.sqlite` file so the
// reading-plan repository tests can `ATTACH DATABASE` a real `study_refs` pack.

import { STUDY_REFS_PACK_DDL } from '../../src/content/pack-schema';

import { DatabaseSync } from './node-sqlite';

export interface FixtureReadingPlan {
  readonly planId: string;
  readonly title: string;
  readonly description: string;
  readonly totalDays: number;
  readonly category: string;
  readonly recommendedMannaMode?: boolean;
}

export interface FixtureReadingPlanDay {
  readonly dayNumber: number;
  readonly sequenceOrder?: number;
  readonly startVerseId: number;
  readonly endVerseId: number;
  readonly label: string;
}

export interface FixtureStudyRefsSpec {
  readonly packId?: string;
  readonly contentVersion?: string;
  readonly plans: readonly FixtureReadingPlan[];
  readonly days: Readonly<Record<string, readonly FixtureReadingPlanDay[]>>;
}

/** Build a `study_refs.sqlite` at `packPath` containing exactly the supplied plans/days. */
export function writeStudyRefsPack(packPath: string, spec: FixtureStudyRefsSpec): void {
  const db = new DatabaseSync(packPath);
  try {
    db.exec(STUDY_REFS_PACK_DDL);
    db.prepare(
      `INSERT INTO pack_metadata
         (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
       VALUES (?, 'STUDY_REFS', 1, ?, 'Study References', 'CC0-1.0', 'Public domain.', '2026-11-25T00:00:00Z')`,
    ).run(spec.packId ?? 'study_refs', spec.contentVersion ?? '1.0.0');

    const insertPlan = db.prepare(
      `INSERT INTO reading_plans (plan_id, title, description, total_days, category, recommended_manna_mode)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const plan of spec.plans) {
      insertPlan.run(
        plan.planId,
        plan.title,
        plan.description,
        plan.totalDays,
        plan.category,
        (plan.recommendedMannaMode ?? true) ? 1 : 0,
      );
    }

    const insertDay = db.prepare(
      `INSERT INTO reading_plan_days (plan_id, day_number, sequence_order, start_verse_id, end_verse_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const [planId, days] of Object.entries(spec.days)) {
      for (const day of days) {
        insertDay.run(
          planId,
          day.dayNumber,
          day.sequenceOrder ?? 1,
          day.startVerseId,
          day.endVerseId,
          day.label,
        );
      }
    }
  } finally {
    db.close();
  }
}
