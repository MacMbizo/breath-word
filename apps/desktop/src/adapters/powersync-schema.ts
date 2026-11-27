// PowerSync client schema for the synced `user_data.sqlite` (B4 §4.3, ADR-002, FR-206).
//
// The PowerSync SDK owns the synced tables: `db.init()` materialises each table as a managed view
// over an internal row store, so the repositories in `packages/core/src/repositories` query the
// same table/column names they always have. This module is the client mirror of the canonical
// `USER_DATA_DDL` (B4 §4.3) — column names, storage classes and the non-unique read indexes —
// kept here (not in `packages/core`) because `packages/core` stays transport-free.
//
// Two DDL-only details are intentionally *not* mirrored, because they cannot be expressed on a
// PowerSync managed view:
//   * `DEFAULT` values — every repository INSERT supplies `created_at` / `updated_at` explicitly.
//   * `UNIQUE` constraints — `prayer_pool_members` / `user_profiles` writes use a
//     SELECT-then-INSERT/UPDATE inside one transaction instead of `ON CONFLICT`, which SQLite
//     cannot resolve against a view. Row-level LWW is enforced server-side (C2 §4.2).

import { Schema, Table, column } from '@powersync/web';

export const userDataSchema = new Schema({
  user_profiles: new Table({
    display_name: column.text,
    default_translation: column.text,
    manna_pacing_enabled: column.integer,
    e2ee_enabled: column.integer,
    e2ee_key_version: column.integer,
    e2ee_kdf_algo: column.text,
    e2ee_salt_b64: column.text,
    e2ee_wrapped_dek_passphrase: column.text,
    e2ee_wrapped_dek_recovery: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  }),

  highlights: new Table(
    {
      user_id: column.text,
      translation_code: column.text,
      start_verse_id: column.integer,
      end_verse_id: column.integer,
      start_offset: column.integer,
      end_offset: column.integer,
      color_hex: column.text,
      symbol_tag: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_highlights_user_range: ['user_id', 'start_verse_id', 'end_verse_id'] } },
  ),

  study_notes: new Table(
    {
      user_id: column.text,
      start_verse_id: column.integer,
      end_verse_id: column.integer,
      note_type: column.text,
      title_payload: column.text,
      body_payload: column.text,
      is_encrypted: column.integer,
      checkup_remind_at: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_notes_user_range: ['user_id', 'start_verse_id', 'end_verse_id'] } },
  ),

  ink_canvases: new Table(
    {
      user_id: column.text,
      note_id: column.text,
      canonical_verse_id: column.integer,
      strokes_payload: column.text,
      is_encrypted: column.integer,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_ink_user_verse: ['user_id', 'canonical_verse_id'] } },
  ),

  prayer_pools: new Table(
    {
      owner_user_id: column.text,
      title: column.text,
      description: column.text,
      category: column.text,
      color_hex: column.text,
      visibility: column.text,
      share_code: column.text,
      allow_member_contributions: column.integer,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_pools_owner: ['owner_user_id'] } },
  ),

  prayer_pool_members: new Table(
    {
      pool_id: column.text,
      user_id: column.text,
      role: column.text,
      joined_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_pool_members_user: ['user_id'] } },
  ),

  prayer_pool_items: new Table(
    {
      pool_id: column.text,
      created_by_user_id: column.text,
      start_verse_id: column.integer,
      end_verse_id: column.integer,
      translation_code: column.text,
      captured_text: column.text,
      shared_prompt_text: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_pool_items_pool: ['pool_id'] } },
  ),

  prayer_item_user_states: new Table(
    {
      item_id: column.text,
      pool_id: column.text,
      user_id: column.text,
      user_notes_payload: column.text,
      generated_prayer_prompt: column.text,
      is_encrypted: column.integer,
      pray_count: column.integer,
      last_prayed_at: column.text,
      answered_at: column.text,
      testimony_payload: column.text,
      is_archived: column.integer,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    {
      indexes: {
        idx_item_state_rotation: ['user_id', 'pool_id', 'is_archived', 'last_prayed_at'],
      },
    },
  ),

  prayer_session_logs: new Table(
    {
      user_id: column.text,
      pool_id: column.text,
      item_id: column.text,
      framework: column.text,
      duration_seconds: column.integer,
      journal_payload: column.text,
      is_encrypted: column.integer,
      completed_at: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text,
    },
    { indexes: { idx_sessions_user_time: ['user_id', 'completed_at'] } },
  ),

  reading_plan_enrollments: new Table({
    user_id: column.text,
    plan_id: column.text,
    started_at: column.text,
    manna_locked: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  }),

  reading_progress: new Table({
    user_id: column.text,
    enrollment_id: column.text,
    plan_id: column.text,
    day_number: column.integer,
    completed_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  }),
});
