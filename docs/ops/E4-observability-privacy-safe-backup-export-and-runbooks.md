# E4: Observability, Privacy-Safe Backup/Export & Runbooks

**Document ID:** `E4`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Ops  
**Last Updated:** `2026-11-24`  
**Related Docs:** `B2`, `B4`, `B6`, `B7`, `C2`, `C3`, `C4`

## Purpose & Scope

Specifies privacy-scrubbed crash telemetry, user-owned full data backup/export/import (guaranteeing zero vendor lock-in), and concise incident response runbooks for a solo developer operating Breath & Word for personal and church use.

## Audience

Founder operating staging/prod environments and troubleshooting user/church issues.

## Body

### 4.1 Privacy-Safe Observability & Telemetry

- **Crash Reporting (Opt-In):** Sentry Free Tier (`@sentry/react-native`, `@sentry/react`) disabled by default in offline guest mode; opt-in toggle in Settings.
- **Mandatory `beforeSend` Privacy Scrubber (`B6 §4.3`):**
  - Strips any breadcrumb, event extra, or request header containing: `e2ee:v1:`, `user_notes`, `journal`, `testimony`, `body_payload`, `title_payload`, `strokes_payload`, `X-BYOK-Key`, `Authorization`, or SQL bind arrays.
- **Key Lightweight Dashboards (Supabase + PowerSync + Cloudflare Built-Ins):**
  1. Supabase: Daily active users, `ai_usage_daily` count (cost guardrail alert at >80% of $5/mo budget), Edge Function 5xx rate.
  2. PowerSync: Connected clients, sync replication lag (<3s SLO), failed upload rate (`SYNC_MUTATION_REJECTED`).
  3. Cloudflare R2: Storage used (alert at 8 GB of 10 GB free cap).

### 4.2 User-Owned Data Backup, Export & Restore (Zero Lock-In)

In **Settings → Data & Backup**, every user can export their entire `user_data.sqlite` graph to a portable file (`breath-and-word-backup-YYYY-MM-DD.json`) with **two explicit modes**:

1. **Encrypted Archive (Default when E2EE active):** Exports raw `e2ee:v1:...` payloads plus `user_profiles.e2ee_*` wrapped DEK metadata. Safe to store in Google Drive / iCloud Drive without exposing private confession journals.
2. **Decrypted Portable Export (Requires Vault Unlock):** Exports readable JSON + human-friendly Markdown folder (`notes/`, `prayer-pools/`, `answered-testimonies.md`) so users own their spiritual journal forever even outside Breath & Word.

- **Idempotent Restore:** Importing a backup JSON merges by `id` (UUID) keeping the newer `updated_at`, never duplicating existing highlights or prayer testimonies.

### 4.3 Solo-Operator Incident Runbooks

#### `RB-01`: Corrupt or Bad Content Pack Published to R2

- **Symptom:** Users report `PACK_CHECKSUM_MISMATCH` or `PACK_INTEGRITY_FAILED` (`C3`) after a pack release.
- **Impact:** Zero impact on already-installed packs (atomic swap prevents replacing working SQLite files, `B4 §4.6`).
- **Resolution (<5 min):**
  1. Fetch previous good `manifest.json` from GitHub Release history.
  2. Upload reverted `manifest.json` to Cloudflare R2 (immutable old `.sqlite.gz` files remain intact).
  3. Fix parser bug in `tools/pack-builder`, bump patch version, re-run `release-packs.yml`.

#### `RB-02`: PowerSync Upload Queue Wedged on a User Device

- **Symptom:** User sees persistent sync spinner or `SYNC_MUTATION_REJECTED` banner; local edits not appearing on second device.
- **Resolution:**
  1. Instruct user to tap **Settings → Export Encrypted Backup** first (guarantees zero data loss).
  2. Tap **Settings → Sync Diagnostics → Reset Sync Cache** (calls `powersync.disconnectAndClear()` then reconnects to pull clean authoritative state from Supabase).
  3. If local unuploaded edits were dropped by a bad RLS rule, re-import the backup JSON from step 1.

#### `RB-03`: Shared Church Prayer Pool `share_code` Leaked

- **Symptom:** Uninvited person joins a church's shared pool.
- **Resolution (<1 min, Self-Service by Pool Owner):**
  1. Pool Owner opens **Pool Settings → Rotate Share Code** (invokes `rotate_pool_share_code` RPC, `C4 §4.4`), immediately invalidating the old code.
  2. Owner opens **Members List → Remove** on the unauthorized member (sets `prayer_pool_members.deleted_at = now()`).
  3. PowerSync `joined_pools` bucket (`C2 §4.1`) automatically evicts the pool and its items from the removed user's device within seconds. *(No other member's private notes were ever exposed.)*

## Acceptance / Done Criteria

- Unit test verifies Sentry `beforeSend` scrubber strips `e2ee:v1:...` and `X-BYOK-Key` strings 100% of the time.
- Export → Clear Local DB → Import round-trip restores all highlights, notes, ink canvases, pools, and testimonies identically.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` Supabase Automated Daily Backups (or weekly `pg_dump` via GitHub Actions on free tier) protect server-side PostgreSQL state.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Initial privacy-safe observability spec, dual-mode user backup/export, and 3 operational runbooks.

## Traceability

- Upstream: `B2`, `B6`, `B7`, `C2`, `C3`, `C4`. Downstream: `F1`, `G4`.
