// B4 §4.5 — Canonical TypeScript domain & view contracts.

export type PackType = 'TRANSLATION' | 'EXEGESIS' | 'STUDY_REFS' | 'COMMENTARY';

export type PrayerCategory =
  | 'ANXIETY'
  | 'GUIDANCE'
  | 'THANKSGIVING'
  | 'FAMILY'
  | 'FINANCE'
  | 'HEALING'
  | 'CUSTOM';

export type PrayerFramework = 'LECTIO_DIVINA' | 'THREE_RS' | 'ACTS' | 'BREATH' | 'DECK';
export type PoolVisibility = 'PRIVATE' | 'SHARED';
export type PoolRole = 'OWNER' | 'LEADER' | 'MEMBER';
export type NoteType = 'GENERAL' | 'INDUCTIVE_5WH' | 'PARAPHRASE' | 'APPLICATION';
export type SymbolTag = 'KEY_TERM' | 'GOD_REF' | 'TRANSITION' | 'PROMISE' | 'COMMAND';

/** Structured span inside verses.content_json */
export interface VerseSpan {
  type: 'text' | 'heading' | 'poetry' | 'red_letter' | 'footnote' | 'paragraph_break';
  text: string;
  indentLevel?: number;
  footnoteId?: string;
}

export interface Verse {
  translationCode: string;
  canonicalVerseId: number; // BBCCCVVV
  bookNumber: number;
  chapter: number;
  verse: number;
  plainText: string;
  spans: VerseSpan[];
}

export interface InkStrokePoint {
  x: number; // Normalized 0..1000
  y: number; // Normalized 0..1000
  pressure: number; // 0..1
  t: number; // Relative ms from stroke start
}

export interface InkStroke {
  id: string;
  colorHex: string;
  width: number; // Normalized 1..20
  points: InkStrokePoint[];
}

/** Persisted Prayer Pool record (1:1 with prayer_pools table) */
export interface PrayerPoolRecord {
  id: string;
  ownerUserId: string;
  title: string;
  description?: string;
  category: PrayerCategory;
  colorHex: string;
  visibility: PoolVisibility;
  shareCode?: string;
  allowMemberContributions: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Derived Read-Model for UI (never persisted directly) */
export interface PrayerPoolView extends PrayerPoolRecord {
  userRole: PoolRole;
  activeItemsCount: number;
  answeredItemsCount: number;
  memberCount: number;
}

/** Derived Read-Model joining prayer_pool_items + prayer_item_user_states (decrypted in-memory) */
export interface PrayerPoolItemView {
  itemId: string;
  poolId: string;
  stateId?: string; // Created lazily on first user interaction in shared pools
  createdByUserId: string;
  startVerseId: number;
  endVerseId: number;
  passageReference: string; // Derived via formatCanonicalRange()
  translationCode: string;
  capturedText: string;
  sharedPromptText?: string;
  userNotes?: string; // Decrypted in-memory
  generatedPrayerPrompt?: string;
  isEncrypted: boolean;
  prayCount: number;
  lastPrayedAt?: string;
  answeredAt?: string;
  testimony?: string; // Decrypted in-memory
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReadingPlanCategory =
  | 'WHOLE_BIBLE'
  | 'NEW_TESTAMENT'
  | 'PSALMS_PROVERBS'
  | 'TOPICAL';

/** Static plan definition from the `study_refs` pack (B4 §4.2 `reading_plans`). */
export interface ReadingPlan {
  planId: string;
  title: string;
  description: string;
  totalDays: number;
  category: ReadingPlanCategory;
  recommendedMannaMode: boolean;
}

/** One day's passage(s) from the `study_refs` pack (B4 §4.2 `reading_plan_days`). */
export interface ReadingPlanDay {
  id: number;
  planId: string;
  dayNumber: number;
  sequenceOrder: number;
  startVerseId: number;
  endVerseId: number;
  label: string;
}

/** Synced enrollment in `user_data.sqlite` (B4 §4.3 `reading_plan_enrollments`). */
export interface ReadingPlanEnrollment {
  id: string;
  userId: string;
  planId: string;
  startedAt: string;
  mannaLocked: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Synced per-day completion in `user_data.sqlite` (B4 §4.3 `reading_progress`). */
export interface ReadingProgress {
  id: string;
  userId: string;
  enrollmentId: string;
  planId: string;
  dayNumber: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
