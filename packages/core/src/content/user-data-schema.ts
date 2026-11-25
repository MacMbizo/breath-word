// B4 §4.3 — Canonical synced user database schema (`user_data.sqlite`).
//
// `user_data.sqlite` is the PowerSync-managed, synced mirror of the Supabase PostgreSQL
// tables. B4 §4.3 gives the authoritative PostgreSQL DDL; this module is the *client
// SQLite* form the apps create at first boot (uuid -> TEXT, timestamptz -> TEXT,
// boolean -> INTEGER 0/1), exactly as the PowerSync client materializes it.
//
// PowerSync alignment rules enforced here (B4 §4.3):
//   1. Every synced table uses `id` (TEXT PK = UUID v4) — no autoincrement, no composite PK.
//   2. Timestamps are ISO-8601 UTC strings.
//   3. Soft deletes only: no `ON DELETE CASCADE`; parents tombstone children via `deleted_at`.
//   4. Shared-pool privacy split: `prayer_pool_items` holds only canonical passage content;
//      all per-user state lives in `prayer_item_user_states`.
//
// Frozen at `USER_DATA_SCHEMA_VERSION = 1`; bump only on a breaking change.

/** Bumped only on a breaking user_data schema change (mirrors the Supabase migration). */
export const USER_DATA_SCHEMA_VERSION = 1;

/** ISO-8601 UTC default, standing in for PostgreSQL's `now()`. */
const NOW_UTC = `(strftime('%Y-%m-%dT%H:%M:%SZ','now'))`;

/** DDL for the client `user_data.sqlite` (B4 §4.3). */
export const USER_DATA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE user_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    default_translation TEXT NOT NULL DEFAULT 'BSB',
    manna_pacing_enabled INTEGER NOT NULL DEFAULT 0,
    e2ee_enabled INTEGER NOT NULL DEFAULT 0,
    e2ee_key_version INTEGER NOT NULL DEFAULT 1,
    e2ee_kdf_algo TEXT,
    e2ee_salt_b64 TEXT,
    e2ee_wrapped_dek_passphrase TEXT,
    e2ee_wrapped_dek_recovery TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);

CREATE TABLE highlights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    translation_code TEXT NOT NULL,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    start_offset INTEGER,
    end_offset INTEGER,
    color_hex TEXT NOT NULL,
    symbol_tag TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);
CREATE INDEX idx_highlights_user_range ON highlights(user_id, start_verse_id, end_verse_id) WHERE deleted_at IS NULL;

CREATE TABLE study_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'GENERAL',
    title_payload TEXT,
    body_payload TEXT NOT NULL,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    checkup_remind_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);
CREATE INDEX idx_notes_user_range ON study_notes(user_id, start_verse_id, end_verse_id) WHERE deleted_at IS NULL;

CREATE TABLE ink_canvases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    note_id TEXT,
    canonical_verse_id INTEGER NOT NULL,
    strokes_payload TEXT NOT NULL,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);
CREATE INDEX idx_ink_user_verse ON ink_canvases(user_id, canonical_verse_id) WHERE deleted_at IS NULL;

CREATE TABLE prayer_pools (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#3B82F6',
    visibility TEXT NOT NULL DEFAULT 'PRIVATE',
    share_code TEXT UNIQUE,
    allow_member_contributions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);
CREATE INDEX idx_pools_owner ON prayer_pools(owner_user_id) WHERE deleted_at IS NULL;

CREATE TABLE prayer_pool_members (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    joined_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT,
    CONSTRAINT unq_pool_member UNIQUE (pool_id, user_id)
);
CREATE INDEX idx_pool_members_user ON prayer_pool_members(user_id) WHERE deleted_at IS NULL;

CREATE TABLE prayer_pool_items (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    translation_code TEXT NOT NULL,
    captured_text TEXT NOT NULL,
    shared_prompt_text TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);
CREATE INDEX idx_pool_items_pool ON prayer_pool_items(pool_id) WHERE deleted_at IS NULL;

CREATE TABLE prayer_item_user_states (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    pool_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_notes_payload TEXT,
    generated_prayer_prompt TEXT,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    pray_count INTEGER NOT NULL DEFAULT 0,
    last_prayed_at TEXT,
    answered_at TEXT,
    testimony_payload TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT,
    CONSTRAINT unq_item_user_state UNIQUE (item_id, user_id)
);
CREATE INDEX idx_item_state_rotation ON prayer_item_user_states(user_id, pool_id, is_archived, last_prayed_at) WHERE deleted_at IS NULL;

CREATE TABLE prayer_session_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pool_id TEXT,
    item_id TEXT,
    framework TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    journal_payload TEXT,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);
CREATE INDEX idx_sessions_user_time ON prayer_session_logs(user_id, completed_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE reading_plan_enrollments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    manna_locked INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT
);

CREATE TABLE reading_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    enrollment_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
    deleted_at TEXT,
    CONSTRAINT unq_reading_day UNIQUE (enrollment_id, day_number)
);
`.trim();
