# S4: Current Backend Setup — Supabase & PowerSync

**Document ID:** `S4`
**Version:** `1.0.0`
**Status:** `Living`
**Last Updated:** `2026-11-27`
**Related Docs:** `S1`, `S2`, `S3`, `B2`, `B4`, `C2`, `C4`, `E1`, `E1-RB`

> Reference for the **current cloud/backend configuration** of Breath & Word: what Supabase
> and PowerSync are doing, how the data flows, and exactly which values and files are
> involved. Companion to the `E1` configuration matrix and the `E1-RB` provisioning runbook.

---

## 1. The topology in one picture

```
 Android (Expo RN) ─┐
 iPad    (Expo RN) ─┼─►  user_data.sqlite  ──►  PowerSync SDK  ──►  PowerSync Cloud
 Desktop (Tauri)   ─┘        (local)             (sync engine)        │  (sync rules)
                                                                       ▼
                                                              Supabase Postgres
                                                              (11 synced tables,
                                                               RLS + RPCs)
```

**Two hard rules shape everything** (`AGENTS.md` rules 2–5, `B4`, `ADR-002`):

1. **Static Scripture is never synced.** Biblical text lives only in read-only content packs
   (`ContentDbAdapter`), served from object storage — never in Postgres, never synced.
2. **User data is local-first.** Synced tables use `id` (UUID v4) primary keys and **soft
   deletes** (`deleted_at`); clients never issue hard `DELETE`. Local-only state (installed
   packs, audio LRU cache, ESV ephemeral cache, workspace layout) lives in `local_device.sqlite`.

---

## 2. Supabase

### 2.1 Hosted project

| Item | Value |
| --- | --- |
| Project ref | `xpwnmcqglybcreyllvvw` |
| API URL | `https://xpwnmcqglybcreyllvvw.supabase.co` |
| Anon key | set in `apps/mobile/.env.local` (`EXPO_PUBLIC_SUPABASE_ANON_KEY`) — **client-safe**, protected by RLS |
| Migrations dir | [`supabase/migrations/`](../../supabase/migrations) |
| Sync rules | [`supabase/powersync/sync-rules.yaml`](../../supabase/powersync/sync-rules.yaml) |
| RLS/RPC tests | [`supabase/tests/rls_and_rpcs.test.sql`](../../supabase/tests/rls_and_rpcs.test.sql) |
| Seed | [`supabase/seed.sql`](../../supabase/seed.sql) — **intentionally empty** (no static Scripture in Postgres) |

The CLI is invoked as `npx --no-install supabase …` (not on `PATH`). The project is linked to
the hosted ref; migration history was repaired and the remote schema verified to match.

### 2.2 Migrations

| File | What it does |
| --- | --- |
| [`0001_user_schema.sql`](../../supabase/migrations/0001_user_schema.sql) | The **11 synced tables** mirroring the client `user_data.sqlite` (types mapped `uuid→TEXT`, `timestamptz→TEXT`, `boolean→INTEGER`). `prayer_pools.share_code text UNIQUE`. The privacy split is enforced structurally: `prayer_pool_items` holds only shared pool content; per-user state lives in `prayer_item_user_states`. |
| [`0002_triggers_and_powersync.sql`](../../supabase/migrations/0002_triggers_and_powersync.sql) | `CREATE PUBLICATION powersync FOR TABLE` (all 11) so PowerSync can stream changes; `set_server_updated_at()` + `trg_*_updated_at` ×11 (LWW clock); `enforce_pray_count_monotonic()` (`pray_count := GREATEST(old, new)`); `cascade_pool_soft_delete()`; `add_pool_owner_member()` (the **sole** owner-membership provisioner). |
| [`0003_rls_and_rpcs.sql`](../../supabase/migrations/0003_rls_and_rpcs.sql) | RLS enabled on all 11 tables with the `C4 §4.3` policy matrix; `SECURITY DEFINER` helpers `is_pool_member` / `is_pool_leader_or_owner`; the `share_code_attempts` table (brute-force log); RPCs `join_shared_pool_by_code` and `rotate_pool_share_code`. |
| [`0004_fix_join_rate_limit_attempt_log.sql`](../../supabase/migrations/0004_fix_join_rate_limit_attempt_log.sql) | Rate-limit fix (`S3 §3.3`): the invalid-code branch **returns** `{"error":"POOL_SHARE_CODE_INVALID"}` so the failed-attempt log commits; `AUTH_REQUIRED` / `POOL_JOIN_RATE_LIMITED` still raise. |

Local verification: `supabase db reset` applies all four migrations + `seed.sql` cleanly.
`supabase test db` runs the 34 pgTAP assertions in `rls_and_rpcs.test.sql` — **PASS**.

### 2.3 The 11 synced tables

`user_profiles` · `highlights` · `study_notes` · `ink_canvases` ·
`prayer_item_user_states` · `prayer_session_logs` · `reading_plan_enrollments` ·
`reading_progress` · `prayer_pool_members` · `prayer_pools` · `prayer_pool_items`

Every one uses a UUID `id` PK and a `deleted_at` soft-delete column.

### 2.4 RLS & the shared-pool RPCs (`C4`)

- **RLS** (`C4 §4.3`): a user can read/write only their own rows; shared-pool rows are visible
  to members via `is_pool_member`, and leadership actions gated by `is_pool_leader_or_owner`.
  Three roles: `OWNER`, `LEADER`, `MEMBER`.
- **`join_shared_pool_by_code(p_code)`** — matches
  `share_code = upper(trim(p_code)) AND visibility = 'SHARED' AND deleted_at IS NULL`,
  inserts a `MEMBER` row. **Rate-limited:** 5 failures / 15 min, then
  `POOL_JOIN_RATE_LIMITED`.
- **`rotate_pool_share_code(p_pool_id)`** — **owner-only**; raises `POOL_PERMISSION_DENIED`
  otherwise. Generates an **8-character Crockford Base32** code
  (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) and **sets `visibility = 'SHARED'`**.
- **Privacy split (non-negotiable):** `prayer_pool_items` never carries personal notes,
  `pray_count`, `last_prayed_at`, or testimonies — those live only in
  `prayer_item_user_states`, per-user and E2EE.

### 2.5 Auth configuration

- **Hosted:** Email + Password (and Magic Link) must be enabled; **Sign in with Apple** is
  required before any iPad TestFlight (`C4 §4.1`).
- **Local** ([`config.jsonc`](../../supabase/config.jsonc)): email enabled,
  `enable_confirmations: false`, `enable_signup: true`, `minimum_password_length: 6`,
  anonymous sign-ins off, SMS/OAuth-providers off. DB major version **17** (must match the
  hosted project).
- **Guest → Account upgrade** (`P2-14`): an offline guest's local rows are atomically rewritten
  `guestUserId → authUserId`, then PowerSync `connect()`es and uploads with **zero data loss**.

### 2.6 Local development stack (ports)

`config.jsonc` keeps the local stack clear of a sibling project (`C:\Prj\mccShepherd`):

| Service | Port |
| --- | --- |
| API | `54321` |
| DB (shifted off default `54322`) | `54332` |
| Shadow DB | `54330` |
| Studio | `54323` |

Stop it when not needed: `npx --no-install supabase stop`.

---

## 3. PowerSync

### 3.1 Instance

| Item | Value |
| --- | --- |
| Endpoint | `https://6b08ab77819a635a44faf1fb.powersync.journeyapps.com` |
| Client env var | `EXPO_PUBLIC_POWERSYNC_URL` (mobile) / `VITE_POWERSYNC_URL` (desktop) |
| Sync rules | [`supabase/powersync/sync-rules.yaml`](../../supabase/powersync/sync-rules.yaml) |
| Backend | the Supabase Postgres project above (via the `powersync` publication) |

Validate rules with `powersync validate`. Sync rules are deployed to the hosted PowerSync
instance and live two-device sync is verified (`G3 v1.0.42`).

### 3.2 The two sync buckets (`C2 §4.1`)

- **`user_private`** — everything owned strictly by the authenticated user:
  `user_profiles`, `highlights`, `study_notes`, `ink_canvases`, `prayer_item_user_states`,
  `prayer_session_logs`, `reading_plan_enrollments`, `reading_progress`, `prayer_pool_members`
  (the user's own membership rows).
- **`joined_pools`** — parameterised by the pools the user belongs to (as OWNER/LEADER/MEMBER):
  `prayer_pools`, `prayer_pool_items`, and the members of those pools.

**Key behaviour:** if a member leaves or is removed from a pool
(`prayer_pool_members.deleted_at IS NOT NULL`), PowerSync evicts that pool and its items from
the ex-member's device **but keeps their personal `prayer_item_user_states`** (answered prayers
& testimonies) safe in `user_private`.

### 3.3 Client wiring

Both apps build the full synced `Schema`, assemble a `SupabaseConnector`
(`fetchCredentials` + `uploadData` with LWW / `GREATEST` / soft-delete, plus 400/403
dead-letter per `C2 §4.2`), and call `connect()`. The sync status
(`connected / uploading / downloading / lastSyncedAt`, `SYNC_OFFLINE`,
`SYNC_MUTATION_REJECTED`) is surfaced through the sync store.

**Env-guarded:** if the Supabase/PowerSync env vars are absent, `connect()` is simply not
called and the app stays fully local — an unprovisioned build has no regression.

---

## 4. Environment variables

Only **client-safe** values belong in `.env.local` (git-ignored; `E1 §4.2`). Secrets
(server-side LLM key, ESV token, BYOK keys) never appear here — ESV/BYOK keys live in OS
secure storage at runtime.

| Mobile (`apps/mobile/.env.local`) | Desktop (`apps/desktop/.env.local`) | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | Public anon key (RLS-protected) |
| `EXPO_PUBLIC_POWERSYNC_URL` | `VITE_POWERSYNC_URL` | PowerSync Cloud endpoint |
| `EXPO_PUBLIC_PACK_MANIFEST_URL` | `VITE_PACK_MANIFEST_URL` | Content-pack manifest (Cloudflare R2, Phase 3) |
| `EXPO_PUBLIC_SENTRY_DSN` | `VITE_SENTRY_DSN` | Optional opt-in crash reporting |

`EXPO_TOKEN` (mobile `.env.local`) is **build tooling only** — no `EXPO_PUBLIC_` prefix, so it
is never inlined into the bundle.

Templates with empty values are committed as `apps/{mobile,desktop}/.env.example`.

---

## 5. Provisioning & Phase-2 verification status

All Phase-2 provisioning and live device exit-gate checks are **complete** (`G3 v1.0.42`, 2026-11-27):

- [x] Sync rules ([`sync-rules.yaml`](../../supabase/powersync/sync-rules.yaml)) deployed to PowerSync Cloud and verified live.
- [x] Hosted Supabase Auth enabled and JWT audience configured (`authenticated`, `S3 §4.5`).
- [x] Two-device pool sync round-trip verified end-to-end.
- [x] Two devices sharing a `SHARED` pool end-to-end verified.

Remaining pre-TestFlight / Phase-3+ backend items:
- Add **Sign in with Apple** before any iPad TestFlight (`C4 §4.1`).
- Configure **Cloudflare R2** bucket + `PACK_MANIFEST_URL` when publishing Phase-3 content packs (`exegesis_step`, `study_refs`, audio editions).
