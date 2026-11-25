# C2: Sync Buckets & Offline Event Contracts

**Document ID:** `C2`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-24`  
**Related Docs:** `B2`, `B4`, `B8` (`ADR-002`), `C3`, `C4`

## Purpose & Scope

Defines the production PowerSync `sync-rules.yaml` bucket definitions, client upload queue connector semantics, conflict resolution rules, and internal typed event bus contracts (`packages/core`) for sync, vault, and content pack lifecycles.

## Audience

Developer and AI coding partner configuring PowerSync Cloud (`supabase/powersync/sync-rules.yaml`) and `packages/core/src/sync/`.

## Body

### 4.1 Production PowerSync Sync Rules (`supabase/powersync/sync-rules.yaml`)

This two-tier bucket design syncs all private user data in `user_private` and dynamically syncs any shared church pools via `joined_pools`. If a member leaves or is removed from a pool (`prayer_pool_members.deleted_at IS NOT NULL`), PowerSync automatically evicts that pool and its items from the ex-member's device while keeping their personal `prayer_item_user_states` (answered prayers & testimonies) safe in `user_private`.

```yaml
bucket_definitions:
  # Bucket 1: All personal data owned strictly by the authenticated user
  user_private:
    parameters:
      - SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM user_profiles WHERE id = bucket.user_id
      - SELECT * FROM highlights WHERE user_id = bucket.user_id
      - SELECT * FROM study_notes WHERE user_id = bucket.user_id
      - SELECT * FROM ink_canvases WHERE user_id = bucket.user_id
      - SELECT * FROM prayer_item_user_states WHERE user_id = bucket.user_id
      - SELECT * FROM prayer_session_logs WHERE user_id = bucket.user_id
      - SELECT * FROM reading_plan_enrollments WHERE user_id = bucket.user_id
      - SELECT * FROM reading_progress WHERE user_id = bucket.user_id
      - SELECT * FROM prayer_pool_members WHERE user_id = bucket.user_id

  # Bucket 2: Private & Shared Prayer Pools the user belongs to (as OWNER, LEADER, or MEMBER)
  joined_pools:
    parameters:
      - SELECT pool_id FROM prayer_pool_members
        WHERE user_id = request.user_id() AND deleted_at IS NULL
    data:
      - SELECT * FROM prayer_pools WHERE id = bucket.pool_id
      - SELECT * FROM prayer_pool_items WHERE pool_id = bucket.pool_id
      - SELECT id, pool_id, user_id, role, joined_at, updated_at, deleted_at
        FROM prayer_pool_members WHERE pool_id = bucket.pool_id
```

### 4.2 Client Upload Connector & Conflict Resolution Policy

1. **Batch Upload (`PowerSyncBackendConnector.uploadData`):**
   - Reads queued `CrudEntry` mutations (`PUT`, `PATCH`, `DELETE`) sequentially per transaction batch and submits via Supabase JS client (`upsert` / `update` / soft-delete `update({ deleted_at })`).
   - **Hard Deletes Prohibited on Client:** Client repositories **never** issue SQL `DELETE` on synced tables; they strictly execute `UPDATE <table> SET deleted_at = ?, updated_at = ? WHERE id = ?`.
2. **Conflict Resolution Policy (Per Entity):**
   - **Default (Row-Level LWW):** `user_profiles`, `highlights`, `study_notes`, `ink_canvases`, `prayer_pools`, `prayer_pool_items`, `reading_progress` resolve via **Last-Write-Wins** guarded by PostgreSQL's `trg_*_updated_at` server timestamp (`B2 §4.2`).
   - **Monotonic Counters (`prayer_item_user_states.pray_count`):** Client sends `PATCH` with incremented `pray_count`; if two offline devices both pray the same card, a lightweight `BEFORE UPDATE` Postgres trigger can enforce `NEW.pray_count := GREATEST(OLD.pray_count, NEW.pray_count)` (or accept minor ±1 drift on concurrent offline sessions—acceptable for personal devotion).
   - **Fatal Upload Errors (HTTP 400 / 403 RLS Violation):** Log structured error (`C3`), dead-letter/discard the offending mutation so it does not permanently wedge the PowerSync upload queue, and notify the UI via `SYNC_MUTATION_REJECTED`.

### 4.3 Internal Typed Event Contracts (`packages/core/src/events/types.ts`)

```typescript
export type CoreEvent =
  | { type: 'SYNC_STATUS_CHANGED'; connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt?: string }
  | { type: 'SYNC_MUTATION_REJECTED'; table: string; rowId: string; errorCode: string }
  | { type: 'VAULT_LOCKED'; reason: 'MANUAL' | 'TIMEOUT' | 'SIGN_OUT' }
  | { type: 'VAULT_UNLOCKED'; indexedNoteCount: number }
  | { type: 'PACK_DOWNLOAD_PROGRESS'; packId: string; bytesReceived: number; totalBytes: number }
  | { type: 'PACK_INSTALLED'; packId: string; contentVersion: string }
  | { type: 'PACK_INSTALL_FAILED'; packId: string; errorCode: string }
  | { type: 'AUDIO_VERSE_CHANGED'; canonicalVerseId: number; editionId: string }
  | { type: 'POOL_SHARED_JOINED'; poolId: string; title: string };
```

## Acceptance / Done Criteria

- `powersync validate sync-rules.yaml` passes against the `B4` PostgreSQL schema.
- Leaving a shared pool removes its `prayer_pools` and `prayer_pool_items` rows from the ex-member's local SQLite within 5 seconds while preserving their `prayer_item_user_states`.
- A simulated 403 RLS error on one queued mutation does not stall subsequent valid mutations in the upload queue.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` PowerSync Free/Starter bucket limits comfortably support ≤250 users with ≤20 pools per user.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Production PowerSync `sync-rules.yaml`, upload connector conflict policy, and CoreEvent contracts.

## Traceability

- Upstream: `B2`, `B4`, `B8` (`ADR-002`). Downstream: `C3`, `C4`, `F1`.
