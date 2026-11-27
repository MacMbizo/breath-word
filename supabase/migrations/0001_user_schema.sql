-- ============================================================================
-- 0001_user_schema.sql — Synced user database schema (Supabase PostgreSQL)
-- Authority: B4 §4.3 ("Synced User Database Schema"), ADR-002, ADR-004.
--
-- Mirror of the client `user_data.sqlite` (`USER_DATA_DDL`,
-- packages/core/src/content/user-data-schema.ts, USER_DATA_SCHEMA_VERSION = 1):
--   uuid  -> TEXT, timestamptz -> TEXT, boolean -> INTEGER (0/1).
-- PowerSync replicates these 11 tables; RLS/triggers live in 0002 and 0003.
--
-- Invariants:
--   * EVERY synced table uses `id` as its primary key.
--   * Soft deletes only (`deleted_at`); clients never issue hard DELETE.
--   * Shared Pool Privacy Split: `prayer_pool_items` holds ONLY canonical passage
--     content + optional leader prompt. Per-user notes/counts/testimony live
--     exclusively in `prayer_item_user_states` (AGENTS.md rule 3).
-- ============================================================================

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,                 -- Matches auth.users.id (or local UUID in offline guest mode)
    display_name text,
    default_translation text NOT NULL DEFAULT 'BSB',
    manna_pacing_enabled boolean NOT NULL DEFAULT false,
    e2ee_enabled boolean NOT NULL DEFAULT false,
    e2ee_key_version integer NOT NULL DEFAULT 1,
    e2ee_kdf_algo text,                  -- 'PBKDF2-SHA256-600K'
    e2ee_salt_b64 text,
    e2ee_wrapped_dek_passphrase text,    -- AES-GCM wrapped DEK using passphrase KEK
    e2ee_wrapped_dek_recovery text,      -- AES-GCM wrapped DEK using recovery key KEK
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.highlights (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    translation_code text NOT NULL,
    start_verse_id integer NOT NULL,
    end_verse_id integer NOT NULL,
    start_offset integer,
    end_offset integer,
    color_hex text NOT NULL,
    symbol_tag text,                     -- 'KEY_TERM' | 'GOD_REF' | 'TRANSITION' | 'PROMISE' | 'COMMAND' | NULL
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX idx_highlights_user_range ON public.highlights(user_id, start_verse_id, end_verse_id) WHERE deleted_at IS NULL;

CREATE TABLE public.study_notes (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    start_verse_id integer NOT NULL,
    end_verse_id integer NOT NULL,
    note_type text NOT NULL DEFAULT 'GENERAL', -- 'GENERAL' | 'INDUCTIVE_5WH' | 'PARAPHRASE' | 'APPLICATION'
    title_payload text,                  -- Plaintext or e2ee:v1:... envelope
    body_payload text NOT NULL,          -- Plaintext JSON/Markdown or e2ee:v1:... envelope
    is_encrypted boolean NOT NULL DEFAULT false,
    checkup_remind_at timestamptz,       -- For Inductive Application Step 5 (Checkup)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX idx_notes_user_range ON public.study_notes(user_id, start_verse_id, end_verse_id) WHERE deleted_at IS NULL;

CREATE TABLE public.ink_canvases (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    note_id uuid,                        -- Optional parent study_note.id
    canonical_verse_id integer NOT NULL, -- Primary anchor verse
    strokes_payload text NOT NULL,       -- Portable JSON strokes (normalized 0..1000) or e2ee:v1:...
    is_encrypted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX idx_ink_user_verse ON public.ink_canvases(user_id, canonical_verse_id) WHERE deleted_at IS NULL;

-- Forward-thinking Shared & Private Prayer Pools
CREATE TABLE public.prayer_pools (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,              -- 'ANXIETY' | 'GUIDANCE' | 'THANKSGIVING' | 'FAMILY' | 'FINANCE' | 'HEALING' | 'CUSTOM'
    color_hex text NOT NULL DEFAULT '#3B82F6',
    visibility text NOT NULL DEFAULT 'PRIVATE', -- 'PRIVATE' | 'SHARED'
    share_code text UNIQUE,              -- 8-char Crockford Base32 code when visibility = 'SHARED'
    allow_member_contributions boolean NOT NULL DEFAULT false, -- False = Leader-Curated (v1 default); True = Collaborative
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX idx_pools_owner ON public.prayer_pools(owner_user_id) WHERE deleted_at IS NULL;

CREATE TABLE public.prayer_pool_members (
    id uuid PRIMARY KEY,
    pool_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'MEMBER', -- 'OWNER' | 'LEADER' | 'MEMBER'
    joined_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT unq_pool_member UNIQUE (pool_id, user_id)
);
CREATE INDEX idx_pool_members_user ON public.prayer_pool_members(user_id) WHERE deleted_at IS NULL;

-- Pool Items: Strictly SHARED/CANONICAL passage content (no private user notes/counts!)
CREATE TABLE public.prayer_pool_items (
    id uuid PRIMARY KEY,
    pool_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    start_verse_id integer NOT NULL,
    end_verse_id integer NOT NULL,
    translation_code text NOT NULL,
    captured_text text NOT NULL,
    shared_prompt_text text,             -- Optional leader prayer prompt for church pool
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX idx_pool_items_pool ON public.prayer_pool_items(pool_id) WHERE deleted_at IS NULL;

-- Per-User Private State for ANY Prayer Pool Item (Private OR Shared Pools)
CREATE TABLE public.prayer_item_user_states (
    id uuid PRIMARY KEY,
    item_id uuid NOT NULL,
    pool_id uuid NOT NULL,               -- Denormalized for fast PowerSync bucket filtering & rotation queries
    user_id uuid NOT NULL,
    user_notes_payload text,             -- Plaintext or e2ee:v1:...
    generated_prayer_prompt text,        -- User's personal AI/template prayer
    is_encrypted boolean NOT NULL DEFAULT false,
    pray_count integer NOT NULL DEFAULT 0,
    last_prayed_at timestamptz,          -- Drives Smart Session Rotation (ORDER BY last_prayed_at ASC NULLS FIRST)
    answered_at timestamptz,
    testimony_payload text,              -- Plaintext or e2ee:v1:...
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT unq_item_user_state UNIQUE (item_id, user_id)
);
CREATE INDEX idx_item_state_rotation ON public.prayer_item_user_states(user_id, pool_id, is_archived, last_prayed_at) WHERE deleted_at IS NULL;

CREATE TABLE public.prayer_session_logs (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    pool_id uuid,
    item_id uuid,
    framework text NOT NULL,             -- 'LECTIO_DIVINA' | 'THREE_RS' | 'ACTS' | 'BREATH' | 'DECK'
    duration_seconds integer NOT NULL DEFAULT 0,
    journal_payload text,                -- Plaintext or e2ee:v1:...
    is_encrypted boolean NOT NULL DEFAULT false,
    completed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX idx_sessions_user_time ON public.prayer_session_logs(user_id, completed_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.reading_plan_enrollments (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    plan_id text NOT NULL,               -- References study_refs.reading_plans.plan_id
    started_at timestamptz NOT NULL,
    manna_locked boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.reading_progress (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    plan_id text NOT NULL,
    day_number integer NOT NULL,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT unq_reading_day UNIQUE (enrollment_id, day_number)
);
