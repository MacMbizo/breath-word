// B4 §4.2 — Canonical modular static content pack schemas.
//
// Phase 1 ships TRANSLATION packs (`core_bsb`, `trans_web`, `trans_kjv`, A3 §4.1) and the
// STUDY_REFS pack (`reading_plans` / `reading_plan_days`) that FR-104 Manna Pacing reads.
// Runtime packs are opened READONLY (`ContentDbAdapter`); this DDL is executed only by
// `tools/pack-builder` at ETL build time. The schema is frozen at `schema_version = 1`
// so every pack carries the same table set and future phases populate more of it
// without a breaking migration.

/** Bumped only on a breaking pack-schema change; persisted in `pack_metadata.schema_version`. */
export const PACK_SCHEMA_VERSION = 1;

/**
 * Common header present in EVERY content pack `.sqlite` file (B4 §4.2).
 * Emitted verbatim by the ETL and rebuilt identically here so packs never drift.
 */
export const PACK_METADATA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE pack_metadata (
    pack_id TEXT PRIMARY KEY,
    pack_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    content_version TEXT NOT NULL,
    display_name TEXT NOT NULL,
    license_spdx TEXT NOT NULL,
    attribution_text TEXT NOT NULL,
    built_at TEXT NOT NULL
);
`.trim();

/** DDL for a Phase-1 TRANSLATION pack `.sqlite` file (B4 §4.2). */
export const TRANSLATION_PACK_DDL = `
${PACK_METADATA_DDL}

CREATE TABLE translations (
    translation_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    license_type TEXT NOT NULL,
    versification TEXT NOT NULL DEFAULT 'protestant',
    has_audio INTEGER NOT NULL DEFAULT 0,
    has_word_alignments INTEGER NOT NULL DEFAULT 0,
    version TEXT NOT NULL
);

CREATE TABLE books (
    book_number INTEGER PRIMARY KEY,
    osis_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    testament TEXT NOT NULL,
    chapter_count INTEGER NOT NULL,
    literary_genre TEXT NOT NULL
);

CREATE TABLE verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_code TEXT NOT NULL,
    canonical_verse_id INTEGER NOT NULL,
    book_number INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    plain_text TEXT NOT NULL,
    content_json TEXT NOT NULL,
    CONSTRAINT unq_verse UNIQUE (translation_code, canonical_verse_id),
    FOREIGN KEY (translation_code) REFERENCES translations(translation_code) ON DELETE CASCADE,
    FOREIGN KEY (book_number) REFERENCES books(book_number)
);
CREATE INDEX idx_verses_bcv ON verses(translation_code, book_number, chapter, verse);
CREATE INDEX idx_verses_canonical ON verses(canonical_verse_id);

-- External-content FTS5 index. Populated at ETL build time via:
--   INSERT INTO verses_fts(verses_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE verses_fts USING fts5(
    translation_code UNINDEXED,
    canonical_verse_id UNINDEXED,
    plain_text,
    content='verses',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE footnotes (
    footnote_id TEXT PRIMARY KEY,
    translation_code TEXT NOT NULL,
    canonical_verse_id INTEGER NOT NULL,
    marker TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'NOTE',
    body_text TEXT NOT NULL,
    FOREIGN KEY (translation_code) REFERENCES translations(translation_code) ON DELETE CASCADE
);
CREATE INDEX idx_footnotes_verse ON footnotes(translation_code, canonical_verse_id);

CREATE TABLE verse_word_alignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_code TEXT NOT NULL,
    canonical_verse_id INTEGER NOT NULL,
    span_index INTEGER NOT NULL,
    char_start INTEGER NOT NULL,
    char_end INTEGER NOT NULL,
    strongs_id TEXT,
    interlinear_word_pos INTEGER
);
CREATE INDEX idx_align_verse ON verse_word_alignments(translation_code, canonical_verse_id);

CREATE TABLE audio_editions (
    edition_id TEXT PRIMARY KEY,
    translation_code TEXT NOT NULL,
    narrator_name TEXT NOT NULL,
    style TEXT NOT NULL,
    base_url TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'mp3',
    FOREIGN KEY (translation_code) REFERENCES translations(translation_code)
);

CREATE TABLE audio_chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id TEXT NOT NULL,
    book_number INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    relative_path TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    sha256 TEXT,
    CONSTRAINT unq_audio_ch UNIQUE (edition_id, book_number, chapter),
    FOREIGN KEY (edition_id) REFERENCES audio_editions(edition_id) ON DELETE CASCADE
);

CREATE TABLE audio_verse_timestamps (
    edition_id TEXT NOT NULL,
    canonical_verse_id INTEGER NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    PRIMARY KEY (edition_id, canonical_verse_id),
    FOREIGN KEY (edition_id) REFERENCES audio_editions(edition_id) ON DELETE CASCADE
);
CREATE INDEX idx_audio_ts_lookup ON audio_verse_timestamps(edition_id, start_ms);
`.trim();

/**
 * DDL for the EXEGESIS pack `.sqlite` file (`exegesis_step.sqlite`; B4 §4.2, pack type 2).
 * Holds versification maps, word-level interlinear tokens with pre-expanded morphology,
 * and structured BDB / Thayer / Abbott-Smith lexicon entries keyed by unpadded Strong's ID.
 */
export const EXEGESIS_PACK_DDL = `
${PACK_METADATA_DDL}

CREATE TABLE versification_maps (
    source_versification TEXT NOT NULL,
    source_verse_id INTEGER NOT NULL,
    canonical_verse_id INTEGER NOT NULL,
    mapping_type TEXT NOT NULL DEFAULT 'EXACT',
    PRIMARY KEY (source_versification, source_verse_id, canonical_verse_id)
);
CREATE INDEX idx_vmap_canonical ON versification_maps(canonical_verse_id);

CREATE TABLE interlinear_tokens (
    token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_verse_id INTEGER NOT NULL,
    source_verse_id INTEGER NOT NULL,
    word_position INTEGER NOT NULL,
    original_word TEXT NOT NULL,
    transliteration TEXT,
    english_gloss TEXT,
    strongs_id TEXT,
    lemma TEXT,
    morphology_code TEXT,
    morphology_human TEXT,
    CONSTRAINT unq_token UNIQUE (canonical_verse_id, word_position)
);
CREATE INDEX idx_tokens_verse ON interlinear_tokens(canonical_verse_id);
CREATE INDEX idx_tokens_strongs ON interlinear_tokens(strongs_id);
CREATE INDEX idx_tokens_lemma ON interlinear_tokens(lemma);

CREATE TABLE lexicon_entries (
    strongs_id TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    lemma TEXT NOT NULL,
    transliteration TEXT,
    pronunciation TEXT,
    short_definition TEXT NOT NULL,
    full_entry_json TEXT NOT NULL,
    ot_occurrences INTEGER NOT NULL DEFAULT 0,
    nt_occurrences INTEGER NOT NULL DEFAULT 0,
    total_occurrences INTEGER NOT NULL DEFAULT 0
);
`.trim();

/**
 * DDL for the STUDY_REFS pack `.sqlite` file (B4 §4.2, pack type 3).
 * FR-104 Manna Pacing reads `reading_plans` / `reading_plan_days`; the cross-reference and
 * factbook tables ship in the same pack for the later Passage Guide / Factbook surfaces.
 */
export const STUDY_REFS_PACK_DDL = `
${PACK_METADATA_DDL}

CREATE TABLE cross_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_verse_id INTEGER NOT NULL,
    to_start_verse_id INTEGER NOT NULL,
    to_end_verse_id INTEGER NOT NULL,
    votes INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'TSK'
);
CREATE INDEX idx_xref_from ON cross_references(from_verse_id, votes DESC);

CREATE TABLE factbook_entities (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    era_label TEXT,
    metadata_json TEXT NOT NULL
);
CREATE INDEX idx_factbook_type_name ON factbook_entities(entity_type, name);

CREATE TABLE factbook_verse_links (
    entity_id TEXT NOT NULL,
    canonical_verse_id INTEGER NOT NULL,
    PRIMARY KEY (entity_id, canonical_verse_id),
    FOREIGN KEY (entity_id) REFERENCES factbook_entities(entity_id) ON DELETE CASCADE
);
CREATE INDEX idx_factbook_verse ON factbook_verse_links(canonical_verse_id);

CREATE TABLE reading_plans (
    plan_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    total_days INTEGER NOT NULL,
    category TEXT NOT NULL,
    recommended_manna_mode INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE reading_plan_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES reading_plans(plan_id) ON DELETE CASCADE
);
CREATE INDEX idx_plan_days ON reading_plan_days(plan_id, day_number, sequence_order);
`.trim();
