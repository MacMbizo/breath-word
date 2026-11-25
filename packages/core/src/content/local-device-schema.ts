// B4 §4.4 — Canonical `local_device.sqlite` schema (local-only, NEVER synced).
//
// Holds device-local state: installed content packs, the audio LRU cache, the ESV
// ephemeral cache, and workspace layout. Because this DB is never synced, it uses
// hard deletes (unlike the `user_data.sqlite` soft-delete contract). Executed by each
// app at first boot; `packages/core` only owns the DDL + queries (AGENTS.md rule 1).

/** Bumped only on a breaking local-device-schema change. */
export const LOCAL_DEVICE_SCHEMA_VERSION = 1;

/** DDL for `local_device.sqlite` (B4 §4.4). */
export const LOCAL_DEVICE_DDL = `
CREATE TABLE installed_packs (
    pack_id TEXT PRIMARY KEY,
    pack_type TEXT NOT NULL,
    content_version TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    installed_at TEXT NOT NULL
);

CREATE TABLE audio_cache_entries (
    cache_key TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TEXT NOT NULL
);

CREATE TABLE api_ephemeral_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    verse_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL
);

CREATE TABLE workspace_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`.trim();
