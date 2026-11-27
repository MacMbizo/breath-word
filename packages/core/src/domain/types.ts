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

/** Synced prayer-session record (B4 §4.3 `prayer_session_logs`; FR-205). */
export interface PrayerSessionLog {
  id: string;
  userId: string;
  poolId?: string;
  itemId?: string;
  framework: PrayerFramework;
  durationSeconds: number;
  /** Decrypted in-memory; never persisted in the clear (B6). */
  journal?: string;
  isEncrypted: boolean;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
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

// ============================================================================
// Phase 3 — Exegesis, Study Refs, Inductive Study, Stylus Ink & Audio
// ============================================================================

export type OriginalLanguage = 'hebrew' | 'aramaic' | 'greek';
export type SourceVersification = 'hebrew_mt' | 'lxx' | 'na28';
export type VersificationMappingType = 'EXACT' | 'OFFSET' | 'SPLIT' | 'MERGE';

/** Versification mapping entry from `exegesis_step` (`versification_maps`, B4 §4.2). */
export interface VersificationMapping {
  sourceVersification: SourceVersification;
  sourceVerseId: number;
  canonicalVerseId: number;
  mappingType: VersificationMappingType;
}

/** Word-level alignment inside a translation pack (`verse_word_alignments`, FR-301). */
export interface VerseWordAlignment {
  id: number;
  translationCode: string;
  canonicalVerseId: number;
  spanIndex: number;
  charStart: number;
  charEnd: number;
  strongsId?: string;
  interlinearWordPos?: number;
}

/** Original-language token from `exegesis_step` (`interlinear_tokens`, FR-301). */
export interface InterlinearToken {
  tokenId: number;
  canonicalVerseId: number;
  sourceVerseId: number;
  wordPosition: number;
  originalWord: string;
  transliteration?: string;
  englishGloss?: string;
  strongsId?: string;
  lemma?: string;
  morphologyCode?: string;
  morphologyHuman?: string;
}

/** One structured section inside `lexicon_entries.full_entry_json` (BDB / Thayer / Abbott-Smith). */
export interface LexiconSection {
  heading: string;
  body: string;
  source?: string;
  subEntries?: string[];
}

/** Full lexical entry from `exegesis_step` (`lexicon_entries`, FR-301 / FR-302). */
export interface LexiconEntry {
  strongsId: string;
  language: OriginalLanguage;
  lemma: string;
  transliteration?: string;
  pronunciation?: string;
  shortDefinition: string;
  sections: LexiconSection[];
  otOccurrences: number;
  ntOccurrences: number;
  totalOccurrences: number;
}

/** Per-book occurrence count for the Word Frequency Suite (FR-302). */
export interface WordBookFrequency {
  bookNumber: number;
  bookName: string;
  testament: 'OT' | 'NT';
  occurrences: number;
}

/** A single verse hit for a Strong's occurrence / search query (FR-302 / FR-103). */
export interface StrongsOccurrence {
  canonicalVerseId: number;
  passageReference: string;
  bookNumber: number;
  wordPosition: number;
  originalWord: string;
  transliteration?: string;
  englishGloss?: string;
  morphologyHuman?: string;
}

/** Aggregated word frequency dossier (FR-302). */
export interface WordFrequencySummary {
  strongsId: string;
  otOccurrences: number;
  ntOccurrences: number;
  totalOccurrences: number;
  byBook: WordBookFrequency[];
  occurrences: StrongsOccurrence[];
}

/** Combined result for tapping an aligned word in the reader (FR-301). */
export interface WordInspection {
  canonicalVerseId: number;
  passageReference: string;
  alignment?: VerseWordAlignment;
  token?: InterlinearToken;
  lexicon?: LexiconEntry;
}

/** Weighted cross-reference from `study_refs` (`cross_references`, FR-303). */
export interface CrossReference {
  id: number;
  fromVerseId: number;
  toStartVerseId: number;
  toEndVerseId: number;
  passageReference: string;
  votes: number;
  source: string;
}

export type FactbookEntityType = 'person' | 'place' | 'event' | 'topic';

/** Entity record from `study_refs` (`factbook_entities`, FR-303). */
export interface FactbookEntity {
  entityId: string;
  entityType: FactbookEntityType;
  name: string;
  aliases: string[];
  summary: string;
  latitude?: number;
  longitude?: number;
  eraLabel?: string;
  metadata: Record<string, unknown>;
}

/** Full Factbook dossier including linked Scripture occurrences (FR-303). */
export interface FactbookDossier {
  entity: FactbookEntity;
  verseIds: number[];
  references: string[];
}

/** Automated Passage Guide output for a verse or passage range (FR-303). */
export interface PassageGuide {
  startVerseId: number;
  endVerseId: number;
  passageReference: string;
  bookNumber: number;
  literaryGenre?: string;
  crossReferences: CrossReference[];
  entities: FactbookEntity[];
}

/** Synced highlight in `user_data.sqlite` (`highlights`, FR-304). */
export interface HighlightRecord {
  id: string;
  userId: string;
  translationCode: string;
  startVerseId: number;
  endVerseId: number;
  startOffset?: number;
  endOffset?: number;
  colorHex: string;
  symbolTag?: SymbolTag;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Structured Observation 5Ws & H payload stored in `study_notes.body_payload` (FR-304). */
export interface Inductive5WhContent {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how: string;
}

/** Structured 5-Step Application payload stored in `study_notes.body_payload` (FR-304). */
export interface Application5StepContent {
  verse: string;
  truth: string;
  need: string;
  intent: string;
  checkupNote: string;
}

/** Synced study note in `user_data.sqlite` (`study_notes`, FR-304). */
export interface StudyNoteRecord {
  id: string;
  userId: string;
  startVerseId: number;
  endVerseId: number;
  passageReference: string;
  noteType: NoteType;
  /** Decrypted in-memory; never persisted in the clear when vault is enabled. */
  title?: string;
  /** Decrypted in-memory; never persisted in the clear when vault is enabled. */
  body: string;
  isEncrypted: boolean;
  checkupRemindAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Local device reminder entry scheduled for an Application card's `checkup_remind_at` (FR-304). */
export interface ApplicationCheckupReminder {
  noteId: string;
  startVerseId: number;
  endVerseId: number;
  passageReference: string;
  remindAt: string;
  dismissed: boolean;
}

/** Synced portable vector sketch canvas (`ink_canvases`, FR-305 / ADR-003). */
export interface InkCanvasRecord {
  id: string;
  userId: string;
  noteId?: string;
  canonicalVerseId: number;
  strokes: InkStroke[];
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type AudioStyle = 'SINGLE_VOICE' | 'DRAMATIZED';
export type AmbientTrackId = 'none' | 'rain' | 'piano' | 'pad';

/** Audio narration edition metadata (`audio_editions`, FR-106). */
export interface AudioEdition {
  editionId: string;
  translationCode: string;
  narratorName: string;
  style: AudioStyle;
  baseUrl: string;
  format: string;
}

/** Audio chapter metadata (`audio_chapters`, FR-106). */
export interface AudioChapter {
  id: number;
  editionId: string;
  bookNumber: number;
  chapter: number;
  relativePath: string;
  durationMs: number;
  fileSizeBytes: number;
  sha256?: string;
}

/** Verse-level audio timestamp (`audio_verse_timestamps`, FR-106). */
export interface AudioVerseTimestamp {
  editionId: string;
  canonicalVerseId: number;
  startMs: number;
  endMs: number;
}

/** Local-only audio LRU cache entry (`audio_cache_entries`, B4 §4.4 / FR-106). */
export interface AudioCacheEntry {
  cacheKey: string;
  filePath: string;
  fileSizeBytes: number;
  isPinned: boolean;
  lastAccessedAt: string;
}
