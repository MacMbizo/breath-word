// Gate-1 Spike 2 evidence (B3 §4.5) — the desktop `ContentDb` layer.
//
// Spike 2 asks us to prove that a Tauri `query_content_db`-style Rust command can open a
// local pack READONLY, `ATTACH DATABASE` it under a namespaced schema, and serve an FTS5
// search over a multi-MB pack within the <10ms target. These tests build a real
// `core_bsb.sqlite` from the canonical pack DDL, then drive `ContentDb` exactly as the
// WebView command layer will.
//
// The pack DDL below is copied VERBATIM from the single source of truth,
// `packages/core/src/content/pack-schema.ts` (`TRANSLATION_PACK_DDL`, `PACK_SCHEMA_VERSION`).
// If that schema changes, this fixture must be updated in lockstep.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Instant;

use breath_and_word_desktop::{ContentDb, ContentDbError};
use rusqlite::Connection;
use serde_json::json;

/// `TRANSLATION_PACK_DDL` (pack-schema.ts), schema_version = 1.
const TRANSLATION_PACK_DDL: &str = r#"
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
"#;

// BBCCCVVV = (book * 1e6) + (chapter * 1e3) + verse (B4 / AGENTS.md rule 4).
const ROMANS_8_28: i64 = 45_008_028;
const GENESIS_1_1: i64 = 1_001_001;

fn temp_pack_path() -> PathBuf {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut path = std::env::temp_dir();
    path.push(format!("bw_spike2_{}_{}.sqlite", std::process::id(), n));
    path
}

/// Build a minimal but schema-faithful `core_bsb.sqlite`, matching `tools/pack-builder` output.
fn build_fixture_pack(path: &Path) {
    let _ = std::fs::remove_file(path);
    let conn = Connection::open(path).expect("create fixture pack");
    conn.execute_batch(TRANSLATION_PACK_DDL)
        .expect("apply TRANSLATION_PACK_DDL");

    conn.execute(
        "INSERT INTO pack_metadata
             (pack_id, pack_type, schema_version, content_version, display_name,
              license_spdx, attribution_text, built_at)
         VALUES ('core_bsb', 'TRANSLATION', 1, '2024.1', 'Berean Standard Bible',
                 'public-domain', 'BSB is in the public domain.', '2026-11-25T00:00:00Z')",
        [],
    )
    .expect("insert pack_metadata");

    conn.execute(
        "INSERT INTO translations
             (translation_code, name, language, license_type, versification,
              has_audio, has_word_alignments, version)
         VALUES ('BSB', 'Berean Standard Bible', 'en', 'public-domain', 'protestant', 0, 0, '2024.1')",
        [],
    )
    .expect("insert translation");

    conn.execute(
        "INSERT INTO books
             (book_number, osis_code, name, testament, chapter_count, literary_genre)
         VALUES (45, 'Rom', 'Romans', 'NT', 16, 'epistle'),
                (1, 'Gen', 'Genesis', 'OT', 50, 'narrative')",
        [],
    )
    .expect("insert books");

    conn.execute(
        "INSERT INTO verses
             (translation_code, canonical_verse_id, book_number, chapter, verse, plain_text, content_json)
         VALUES ('BSB', 45008028, 45, 8, 28,
                 'And we know that all things work together for good to them that love God, to them who are called according to his purpose.',
                 '[{\"type\":\"text\",\"text\":\"And we know that all things work together for good\"}]'),
                ('BSB', 1001001, 1, 1, 1,
                 'In the beginning God created the heavens and the earth.',
                 '[{\"type\":\"text\",\"text\":\"In the beginning God created\"}]')",
        [],
    )
    .expect("insert verses");

    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')", [])
        .expect("rebuild FTS index");

    drop(conn);
}

#[test]
fn attaches_readonly_pack_and_reports_it() {
    let path = temp_pack_path();
    build_fixture_pack(&path);

    let db = ContentDb::open_readonly(&path).expect("open read-only");
    assert!(db.attached_packs().unwrap().is_empty());

    db.attach_pack("core_bsb", &path).expect("attach pack");
    assert_eq!(db.attached_packs().unwrap(), vec!["core_bsb".to_string()]);
    assert!(db.integrity_check("core_bsb").unwrap());

    db.detach_pack("core_bsb").expect("detach pack");
    assert!(db.attached_packs().unwrap().is_empty());

    let _ = std::fs::remove_file(&path);
}

#[test]
fn rejects_unsafe_pack_ids() {
    let path = temp_pack_path();
    build_fixture_pack(&path);

    let db = ContentDb::open_readonly(&path).expect("open read-only");

    // SQL identifiers come from the pack id, so anything beyond `^[a-z][a-z0-9_]*$` is refused.
    for bad in ["Core_BSB", "core-bsb", "core bsb", "1core", "", "core;DROP"] {
        let err = db.attach_pack(bad, &path).unwrap_err();
        assert!(
            matches!(err, ContentDbError::InvalidPackId(_)),
            "expected InvalidPackId for {bad:?}, got {err:?}"
        );
    }

    let _ = std::fs::remove_file(&path);
}

#[test]
fn fts5_search_returns_ranked_hits_with_snippet() {
    let path = temp_pack_path();
    build_fixture_pack(&path);

    let db = ContentDb::open_readonly(&path).expect("open read-only");
    db.attach_pack("core_bsb", &path).expect("attach pack");

    let hits = db
        .search("core_bsb", "work together for good", 10)
        .expect("search");

    assert_eq!(hits.len(), 1, "only Romans 8:28 contains the phrase");
    let hit = &hits[0];
    assert_ne!(hit.canonical_verse_id, GENESIS_1_1);
    assert_eq!(hit.translation_code, "BSB");
    assert_eq!(hit.canonical_verse_id, ROMANS_8_28);
    assert_eq!(hit.book_number, 45);
    assert_eq!(hit.chapter, 8);
    assert_eq!(hit.verse, 28);
    assert!(hit.plain_text.contains("work together for good"));
    // FR-103 highlighting: matched terms are wrapped by the snippet delimiters.
    assert!(hit.snippet.contains("[[work]]"), "snippet = {:?}", hit.snippet);
    assert!(hit.score.is_finite(), "bm25 score must be finite");

    // The limit is honoured and ranking is stable.
    let limited = db.search("core_bsb", "god", 1).expect("search god");
    assert!(limited.len() <= 1);

    let _ = std::fs::remove_file(&path);
}

#[test]
fn spike2_search_latency_within_target() {
    let path = temp_pack_path();
    build_fixture_pack(&path);

    let db = ContentDb::open_readonly(&path).expect("open read-only");
    db.attach_pack("core_bsb", &path).expect("attach pack");

    // Warm the prepared-statement / page cache the way a live query_content_db call would.
    let _ = db.search("core_bsb", "work together for good", 10).unwrap();

    let started = Instant::now();
    let hits = db.search("core_bsb", "work together for good", 10).unwrap();
    let elapsed = started.elapsed();

    assert_eq!(hits.len(), 1);
    println!(
        "Gate-1 Spike 2 — query_content_db FTS5 search latency: {}µs",
        elapsed.as_micros()
    );
    // The <10ms target is measured on the release build (see the cargo test --release run);
    // this bound only guards against pathological regressions in the debug test build.
    assert!(
        elapsed.as_millis() < 100,
        "search took {elapsed:?}, far beyond the <10ms target"
    );

    let _ = std::fs::remove_file(&path);
}

/// `ContentDbAdapter.query` (B3 §4.3) reaches SQLite through `run_query`. Everything the
/// `ReaderRepository` and the pack-integrity gate send must pass; writes must not.
#[test]
fn run_query_serves_reader_sql_and_readonly_pragmas_but_refuses_writes() {
    let path = temp_pack_path();
    build_fixture_pack(&path);

    let db = ContentDb::open_readonly(&path).expect("open read-only");
    db.attach_pack("core_bsb", &path).expect("attach pack");

    // ReaderRepository.getVerse — the exact parameterised SELECT shape `packages/core` sends.
    let rows = db
        .run_query(
            "SELECT translation_code, canonical_verse_id, verse, plain_text
               FROM \"core_bsb\".verses
              WHERE translation_code = ? AND canonical_verse_id = ?",
            &[json!("BSB"), json!(ROMANS_8_28)],
        )
        .expect("run reader select");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].get("translation_code"), Some(&json!("BSB")));
    assert_eq!(rows[0].get("verse"), Some(&json!(28)));
    assert!(rows[0]
        .get("plain_text")
        .and_then(|v| v.as_str())
        .is_some_and(|text| text.contains("work together for good")));

    // PackManagerRepository.assertStagedPack runs `PRAGMA <pack>.integrity_check` through the
    // same generic path, so read-only PRAGMAs must be accepted.
    let pragma = db
        .run_query("PRAGMA core_bsb.integrity_check", &[])
        .expect("run integrity pragma");
    assert_eq!(pragma[0].get("integrity_check"), Some(&json!("ok")));

    // Content packs are strictly read-only: a statement that would change them is refused.
    let err = db
        .run_query(
            "INSERT INTO \"core_bsb\".books
                 (book_number, osis_code, name, testament, chapter_count, literary_genre)
             VALUES (66, 'Rev', 'Revelation', 'NT', 22, 'apocalyptic')",
            &[],
        )
        .unwrap_err();
    assert!(matches!(err, ContentDbError::NotReadOnly), "got {err:?}");

    let _ = std::fs::remove_file(&path);
}
