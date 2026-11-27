# S2: Build History & Progress

**Document ID:** `S2`
**Version:** `1.0.0`
**Status:** `Living`
**Last Updated:** `2026-11-27`
**Related Docs:** `S1`, `S3`, `S4`, `G3` (changelog), `G5` (register), `F1`, `AGENTS.md`

> Living record of **everything built so far**. Authoritative chronological changes live in
> `docs/G3-changelog.md`; requirement status lives in `docs/G5-requirements-register.md`.
> This file is the narrative "what exists and where".

---

## 1. The repository at a glance

A pnpm-workspaces + Turborepo monorepo:

```
breath-word/
├─ packages/
│  ├─ core/        # 100% pure TypeScript — domain, logic, repositories, stores
│  └─ tokens/      # design tokens (colors, fonts, spacing, radii, springs)
├─ apps/
│  ├─ mobile/      # Expo React Native (Reanimated + Skia)
│  └─ desktop/     # Tauri v2 + React 19 + Vite 6 (Tailwind + framer-motion)
├─ tools/
│  └─ pack-builder # ETL: USFM → modular content packs
├─ supabase/       # migrations, PowerSync sync rules, RLS test suite
└─ docs/           # canonical spec suite (A*–G*) + status docs (S*)
```

**Root scripts:** `lint`, `typecheck`, `test`, `build` (each `turbo run …`).
**The gate:** `pnpm turbo lint typecheck test` must stay green.

### `packages/core/src` map (what logic exists)

| Area | Purpose |
| --- | --- |
| `adapters/` | Transport/platform seams (`UserDbAdapter`, `ContentDbAdapter`, `CryptoPrimitivesAdapter`, `SecureStorageAdapter`, `AuthAdapter`, `PoolShareAdapter`, `SyncAdapter`, …) |
| `auth/` | Canonical auth error copy (`AUTH_REQUIRED`, `AUTH_GUEST_MIGRATION_FAILED`) |
| `config/` | Phase feature flags (`PHASE_FLAGS[1..4]`) |
| `content/` | Content-pack schemas, `user-data-schema.ts` (client SQLite DDL) |
| `crypto/` | E2EE engine — `envelope.ts`, `vault.ts`, `recovery-key.ts`, `field-cipher.ts`, `recovery-qr.ts`, `base64url.ts`, `uuid.ts` |
| `domain/` | Domain types (`PrayerCategory`, `PoolRole`, `PrayerPoolView`, …) |
| `errors/` | Canonical `AppError` model (`C3`) |
| `events/` | `CoreEvent` union + typed emitter (`C2 §4.3`) |
| `pools/` | Shared-pool RPC fallback copy + error mappers (`poolJoinError`, `poolShareCodeError`) |
| `prayer/` | Prompt-template engine (`prompt-templates.ts`) + engines |
| `repositories/` | All SQL: reader, pack-mgr, reading-plan, prayer-pool, prayer-engine, vault, habits, esv-cache |
| `runtime/` | `core-runtime.ts` — assembles repositories + stores |
| `search/` | Volatile in-RAM `MiniSearch` note index (`note-search.ts`) |
| `stores/` | `zustand/vanilla` stores — prayer, vault, account, sync |
| `sync/` | PowerSync `Schema`, `SupabaseConnector`, env-guarded `connect()` |

### App `src` map

- `apps/mobile/src`: `adapters/`, `app/` (screens), `config/`, `boot`.
- `apps/desktop/src`: `adapters/`, `app/` (views), `config/`, `boot`.

---

## 2. Phase 0 — Specification & architecture (pre-build)

The normalized documentation suite was extracted and ratified: `A*` (product), `B*`
(architecture incl. `B6` security/E2EE), `C*` (contracts: API, sync buckets, error model,
auth/tenancy), `D*` (design system, UX + WCAG), `E*` (ops), `F1` (testing/DoD), `G1`/`G3`/`G4`/`G5`
(living docs). Five ADRs ratified: `ADR-001` monorepo/rich-UI, `ADR-002` dual-SQLite +
PowerSync boundary, `ADR-003` portable Skia ink canvas, `ADR-004` opt-in zero-knowledge
E2EE + volatile in-memory search, `ADR-005` zero-egress content-pack/audio distribution.

`AGENTS.md` fixed the seven non-negotiable engineering rules that govern every change.

---

## 3. Phase 1 — Core Local Reader MVP ✅ (exit gate PASSED)

Host-side implementation + tests for all five features, then **on-device verification**:

| FR | What landed | Verified |
| --- | --- | --- |
| `FR-101` | Structured verse renderer — Psalm 23 poetry/heading indents, Matthew 5 red-letter, footnote sheet | ✅ device |
| `FR-102` | Multi-translation & parallel reader (`core_bsb:BSB` + `trans_kjv:KJV` aligned, shared scroll) | ✅ device |
| `FR-103` | Offline FTS5 search — ranked highlighted snippets, OT/NT filter | ✅ device |
| `FR-104` | Focus Mode (chrome clear/restore). Full Manna Pacing is Phase-3 (`study_refs` pack) | ✅ device (chrome) |
| `FR-105` | Content Pack Manager — catalogue install/remove, hash-verified, atomic, no restart | ✅ device |

**Gate-1 spikes (all device-passed):** Spike 1 pack install + FTS5 timing (`G3 v1.0.37`),
Spike 2 Tauri + PowerSync (`v1.0.38`), Spike 3 crypto parity (`v1.0.37`), Spike 4 frame
pacing (`v1.0.36`).

**`tools/pack-builder` ETL (37 tests):**
- `core_bsb` — Berean Standard Bible (public-domain USFM).
- `trans_kjv` — King James Version.
- `trans_web` — World English Bible, built through the **real public-domain ETL**
  (31,103 verses, integrity clean) — `G3 v1.0.40`.

---

## 4. Phase 2 — Scripture Prayer & E2EE Sync ✅ (exit gate PASSED)

Seven FRs (`FR-107`, `FR-201`–`FR-206`) are `Implemented` and device-verified in `G5` `1.0.3`
and recorded in `G3` `v1.0.42`. Built as six workstreams (WS1–WS6), units `P2-01`–`P2-24`:

### WS1 — Prayer repositories + stores (pure TS)
- `P2-01` `repositories/prayer-pool-repository.ts` — CRUD for pools, members, items,
  user-states; `recordPray` (monotonic `pray_count` + `last_prayed_at`), mark answered +
  testimony, archive. **Soft-delete only.**
- `P2-02` `repositories/prayer-engine-repository.ts` — `prayer_session_logs` write/list.
- `P2-03` `stores/prayer-store.ts` — `zustand/vanilla` state; never throws; exposes pools,
  rotation queue, today's session, join + share-code status.
- `P2-04` wired into `runtime/core-runtime.ts`.

### WS2 — Vault repository + store
- `P2-05` `repositories/vault-repository.ts` — `initVault` / `unlock(passphrase|recoveryKey)`
  / `rewrap` / `lock` / `isEnabled`; DEK held in RAM only, zeroized on lock.
- `P2-06` `stores/vault-store.ts` — locked/unlocked status; DEK never exposed to selectors.
- `P2-07` `crypto/field-cipher.ts` — encrypt-on-write / decrypt-on-read helper
  (`e2ee:v1` envelope; throws `CRYPTO_VAULT_LOCKED` / `CRYPTO_DECRYPT_FAILED`).

### WS3 — Offline prompt generator
- `P2-08` `prayer/prompt-templates.ts` — deterministic, zero-network templates per
  `PrayerFramework` + `PrayerCategory`; mirrors the `C1` response shape so Phase-4 AI mode is
  a drop-in swap.

### WS4 — Sync backbone
- `P2-09` `events/` — `CoreEvent` union + emitter.
- `P2-10` `sync/` — sync-status store (`connected/uploading/downloading/lastSyncedAt`),
  `SYNC_OFFLINE`, dead-letter for rejected mutations (`SYNC_MUTATION_REJECTED`).
- `P2-11` Supabase migrations `0001`–`0003` (see `S4`).
- `P2-12` `supabase/powersync/sync-rules.yaml` (two buckets).
- `P2-13` PowerSync client wiring in both apps — `Schema`, `SupabaseConnector`
  (`fetchCredentials` + `uploadData` with LWW/`GREATEST`/soft-delete + 400/403 dead-letter),
  `connect()`, status surfaced to the store. Env-guarded (unprovisioned build stays local).
- `P2-14` Zero-loss Guest → Account upgrade (`stores/account-store.ts`, shared Supabase client).
- `P2-15` `supabase/tests/rls_and_rpcs.test.sql` — 34 pgTAP assertions, `supabase test db` PASS
  (2-account tenancy, cascade soft-delete, 6th bad code → `POOL_JOIN_RATE_LIMITED`).

### WS5 — UI surfaces (mobile + desktop, tokens-only)
- `P2-16` Capture action bar (`CaptureSheet.tsx` / `CapturePanel.tsx`).
- `P2-17` Pools screen (`PoolsScreen.tsx` / `PoolsView.tsx`) — categories, create/rename,
  collapse answers, join-by-code, leader prompt, per-member E2EE note, **owner share-code panel**.
- `P2-18` Swipe-deck rotation session (`PrayerSessionScreen.tsx` / `PrayerSessionView.tsx`).
- `P2-19` Four guided engines over `BreathRing` (`EngineScreen.tsx` / `EngineView.tsx`).
- `P2-20` Offline prompt generator surfaced in each engine.
- `P2-21` Vault wizard (`VaultWizardScreen.tsx` / `VaultView.tsx`) — passphrase → 13×4
  Recovery Key (+ QR) → saved-gate → unlock/lock; batch-encrypt of pre-existing plaintext;
  biometric fast-unlock; App Lock on 15-min background; volatile `MiniSearch` purge on
  lock/sign-out.
- `P2-22` FR-107 habits & reminders (`HabitsScreen.tsx` / `HabitsView.tsx`) +
  `repositories/habits-repository.ts`, `repositories/esv-cache-repository.ts`.
- Desktop mirrors of all of the above + tabs in `App.tsx`.

### WS6 — Regression + gate
- `P2-23` gate kept green after every unit.
- `P2-24` `G5` bumped to `1.0.3`; `G3` `v1.0.42`. ✅ **Complete** — §5 exit-gate device checks passed (2026-11-27).

---

## 5. Current gate health

```
pnpm turbo lint typecheck test  →  12 successful / 12 total
  @breath-and-word/core          →  240 tests / 22 files
  tools/pack-builder             →  37 tests
```

---

## 6. What is done vs. what remains

**Done (device-verified):**
- Phase 1 — all five FRs device-verified; all three packs built (incl. real WEB ETL).
- Phase 2 — all seven FRs implemented with tests; hosted Supabase + PowerSync provisioned;
  two-device pool sync and shared-pool join-by-code verified on real devices (`G3 v1.0.42`).

**Next active phase — Phase 3 (Exegesis, Inductive, Ink & Audio):**
- `FR-301` Clickable Strong's, Interlinear & Morphology (`exegesis_step` pack)
- `FR-302` Lexicon & Word Frequency Suite (`exegesis_step` pack)
- `FR-303` Automated Passage Guide & Factbook (`study_refs` pack)
- `FR-304` Inductive Bible Study Suite (`highlights` + `study_notes` + checkup reminders)
- `FR-305` Cross-Platform Stylus Ink Canvas (`ink_canvases`, `ADR-003`)
- `FR-106` Synchronized Audio & Ambient Mixer (`audio_*` tables + two-stream mixer + LRU cache)

See [`S4-backend-setup-supabase-and-powersync.md`](S4-backend-setup-supabase-and-powersync.md)
for the backend topology and
[`S3-challenges-and-solutions.md`](S3-challenges-and-solutions.md) for the problems that were
overcome to get here.
