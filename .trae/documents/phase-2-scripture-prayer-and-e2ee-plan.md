# Phase 2 Execution Plan — Scripture Prayer & E2EE Sync

**Plan ID:** `phase-2-scripture-prayer-and-e2ee-plan`
**Author:** Athena
**Status:** Complete — Phase-2 exit gate PASSED (2026-11-27; WS1–WS6 landed, hosted Supabase + PowerSync provisioned, two-device sync + shared-pool join-by-code verified on real devices)
**Created:** 2026-11-26
**Predecessor:** `full-scope-delivery-and-prayer-scripture-plan` (Phase 1 — exit gate PASSED)
**Related Docs:** `A3 §4.1` (phase matrix), `A2 §4.2` (prayer FRs), `G5` (register), `B4 §4.3` (schema), `B6` (E2EE), `C2` (sync buckets/events), `C4` (auth/RLS/RPC), `F1` (§4 test suites), `E1` (provisioning), `AGENTS.md`

---

## 1. Objective

Deliver Phase 2 (**Scripture Prayer & E2EE Sync**) so that the six Phase-2 requirements are `Implemented` and the `A3 §4.1` Phase-2 exit gate passes:

> "Offline edits sync via PowerSync across Android + iPad + Desktop; E2EE vault + Recovery Key passes crypto test suite; Shared Church Pool tested with ≥2 accounts."

Phase-2 scope (from `A3 §4.1` + `G5 §2`): **FR-107, FR-201, FR-202, FR-203, FR-204 (offline templates only), FR-205 (all 4 engines), FR-206**. FR-204's AI mode and all of FR-301..403 remain **out of scope** (`AGENTS.md` rule 7, `A3 §4.2`).

---

## 2. Current State (verified against the repo, 2026-11-26)

### 2.1 Already built — do NOT rebuild

| Asset | Location | State |
| --- | --- | --- |
| Phase-2 flags | [flags.ts](file:///c:/Prj/breath-word/packages/core/src/config/flags.ts#L25-L33) | `PHASE_FLAGS[2]` already sets `ENABLE_PRAYER_ENGINE`, `ENABLE_CLOUD_SYNC`, `ENABLE_E2EE_VAULT` = `true`. **No code change needed**; the work is to *consume* the flags. |
| Prayer DB schema (client) | [user-data-schema.ts](file:///c:/Prj/breath-word/packages/core/src/content/user-data-schema.ts#L88-L165) | All 5 prayer tables + `user_profiles` E2EE columns present, UUID PKs + `deleted_at`. |
| Prayer domain types | [types.ts](file:///c:/Prj/breath-word/packages/core/src/domain/types.ts#L5-L98) | `PrayerCategory`, `PrayerFramework`, `PoolVisibility`, `PoolRole`, `PrayerPoolRecord`, `PrayerPoolView`, `PrayerPoolItemView` all defined. |
| E2EE engine (pure fns) | [crypto/](file:///c:/Prj/breath-word/packages/core/src/crypto) (`envelope.ts`, `vault.ts`, `recovery-key.ts`, `base64url.ts`, `uuid.ts`) | `initializeVault` / `unlockVaultWithPassphrase` / `unlockVaultWithRecoveryKey(Display)` / `rewrapVaultPassphrase` / `zeroizeDek`; `e2ee:v1` envelope + AAD per `B6 §4.2`. |
| Crypto + secure-storage adapters | [mobile crypto.ts](file:///c:/Prj/breath-word/apps/mobile/src/adapters/crypto.ts), [mobile secure-storage.ts](file:///c:/Prj/breath-word/apps/mobile/src/adapters/secure-storage.ts), [desktop crypto.ts](file:///c:/Prj/breath-word/apps/desktop/src/adapters/crypto.ts), desktop `secure-storage.ts` | **Fully implemented** on both platforms (`react-native-quick-crypto` + `expo-secure-store`; WebCrypto + Tauri keychain). |
| Crypto test suites | [vault.test.ts](file:///c:/Prj/breath-word/packages/core/test/vault.test.ts), [crypto-parity.test.ts](file:///c:/Prj/breath-word/packages/core/test/crypto-parity.test.ts) | Round-trip, IV uniqueness, AAD-swap rejection, Recovery-Key unwrap, rotation — `F1 §4` suite 2 already green. |
| Adapter contracts | [adapters/index.ts](file:///c:/Prj/breath-word/packages/core/src/adapters/index.ts) | `CryptoPrimitivesAdapter`, `SecureStorageAdapter`, `UserDbAdapter.watch` all defined. |
| Breath-ring component | `apps/{mobile,desktop}/src/app/BreathRing.tsx` | Presentation-only ring exists (Gate-1 Spike 4); **no engine, no session logging**. |

### 2.2 Missing — the actual Phase-2 work

1. **No prayer repositories** in `packages/core/src/repositories/` — only `reader`, `pack-mgr`, `reading-plan`.
2. **No vault repository** — `crypto/vault.ts` is pure functions; nothing reads/writes the `user_profiles` E2EE columns.
3. **No prayer/vault stores** in `packages/core/src/stores/`.
4. **No `packages/core/src/events/`** — `C2 §4.3` `CoreEvent` union not implemented.
5. **No `packages/core/src/sync/`** — no status store, no upload-queue dead-letter, no `SYNC_OFFLINE` handling.
6. **No `supabase/` directory at all** — no migrations (`0001` schema, `0002` triggers, `0003` RLS/RPCs per `C4`), no `sync-rules.yaml` (`C2 §4.1`), no Edge Functions.
7. **PowerSync is inert** — both apps open `new Schema({})` and never call `connect()` ([mobile user-db.ts](file:///c:/Prj/breath-word/apps/mobile/src/adapters/user-db.ts#L60-L79), desktop equivalent).
8. **No FR-107** habits/reminders/ESV ephemeral cache.
9. **No prayer UI** — capture action bar, pools screen, rotation deck, engine screens, vault wizard.

---

## 3. Hard Constraints (from `AGENTS.md`)

- Prayer SQL lives **only** in `packages/core/src/repositories/`; UI never writes SQL (rule 1).
- Every synced write is `UPDATE … SET deleted_at`; **never** client `DELETE` (rule 2).
- Personal state (`user_notes_payload`, `pray_count`, `last_prayed_at`, `testimony_payload`) **never** on `prayer_pool_items` — only on `prayer_item_user_states` (rule 3). Shared-pool privacy split (`C4 §4.2`).
- Decrypted E2EE plaintext is never written to disk or FTS5; `*_payload` is never logged (rule 5).
- Colors/springs from `@breath-and-word/tokens`; 120 Hz worklets with Reduced-Motion fallbacks (rule 6).
- Every thrown error is a canonical `AppError` (`C3`); gate `pnpm turbo lint typecheck test` must stay green (rule 7).

---

## 4. Sequenced Workstreams

Work is ordered by dependency and by **provability without external infrastructure** — the largest provable block (WS1–WS3) ships and is unit-tested before any cloud account exists.

### WS1 — Core prayer repositories + stores (infra-free, pure TS)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P2-01` | `packages/core/src/repositories/prayer-pool-repository.ts` — CRUD for `prayer_pools`, `prayer_pool_members`, `prayer_pool_items`, `prayer_item_user_states`; create/read pools, add captured items, lazy-create a user state on first interaction, `recordPray` (monotonic `pray_count` + `last_prayed_at`), mark answered + testimony, archive. Soft-delete only. | FR-201/202/203 | `test/prayer-pool.test.ts` against an in-memory `UserDbAdapter` (mirror `reading-plan.test.ts`). |
| `P2-02` | `packages/core/src/repositories/prayer-engine-repository.ts` — write `prayer_session_logs` (framework, duration, optional `journal_payload`), list recent sessions. | FR-205 | `test/prayer-engine.test.ts`. |
| `P2-03` | `packages/core/src/stores/prayer-store.ts` `createPrayerStore(repo)` — `zustand/vanilla`, `AsyncStatus`/`error: AppError`, never throws; selectors for pools, active pool items, rotation queue, today's session. | FR-201/202/203 | `test/stores.test.ts` extension. |
| `P2-04` | Wire both repositories + the store into [core-runtime.ts](file:///c:/Prj/breath-word/packages/core/src/runtime/core-runtime.ts) (`CoreRepositories.prayer`, `CoreStores.prayer`), constructed exactly like `ReadingPlanRepository` (`{userDb, crypto: Pick<…,'randomBytes'>, now?}`). | all | `test/core-runtime.test.ts` extension. |

### WS2 — Vault repository + store (infra-free)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P2-05` | `packages/core/src/repositories/vault-repository.ts` — `initVault(userId, passphrase)` (calls `initializeVault`, persists the 4 `user_profiles` E2EE columns, sets `e2ee_enabled=1`), `unlock(userId, passphrase|recoveryKey)`, `rewrap`, `lock`, `isEnabled`; holds the DEK in RAM only and zeroizes on lock. | FR-206 | `test/vault-repository.test.ts`. |
| `P2-06` | `packages/core/src/stores/vault-store.ts` `createVaultStore(repo)` — `locked`/`unlocked` status, never exposes the DEK to selectors. | FR-206 | `test/stores.test.ts`. |
| `P2-07` | Encrypt-on-write helper: a single internal function that turns a plaintext `user_notes_payload` / `testimony_payload` / `journal_payload` into an `e2ee:v1` envelope using the in-RAM DEK, throwing `CRYPTO_VAULT_LOCKED` when locked; decrypt-on-read that throws `CRYPTO_DECRYPT_FAILED` on AAD/tag failure and degrades the row (never crashes a list). Used by WS1 repositories + WS5 UI. | FR-202/206 | `test/vault-repository.test.ts` (locked-write rejection + tamper). |

### WS3 — Prayer Prompt Generator, offline mode (infra-free)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P2-08` | `packages/core/src/prayer/prompt-templates.ts` — deterministic, offline template engine over `PrayerFramework` (`LECTIO_DIVINA`, `THREE_RS`, `ACTS`, `BREATH`) + `PrayerCategory`; produces structured `{ sections: {stage, prompt}[] }` from `passageReference` + `capturedText` + (optional) up-to-500-char `optionalUserContext`. **No network.** Mirrors the `C1` `PRAYER_PROMPT` response shape so the P4 AI mode is a drop-in swap. | FR-204 (offline) | `test/prompt-templates.test.ts` — snapshot per framework, airplane-mode (no I/O) assertion, `includeUserNotes=false ⇒ context null`. |

### WS4 — Sync backbone (REQUIRES PROVISIONING — see §6)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P2-09` | `packages/core/src/events/types.ts` — the `CoreEvent` union exactly as `C2 §4.3`; a tiny typed emitter. | FR-206 | `test/events.test.ts`. |
| `P2-10` | `packages/core/src/sync/` — sync-status store (`connected/uploading/downloading/lastSyncedAt`), offline pill state (`SYNC_OFFLINE`), dead-letter for rejected mutations (`SYNC_MUTATION_REJECTED`). Consumes PowerSync status callbacks via a new `SyncAdapter` contract in `adapters/index.ts`. | FR-206 | `test/sync-store.test.ts`. |
| `P2-11` | `supabase/migrations/0001_schema.sql` (PostgreSQL DDL from `B4 §4.3`), `0002_triggers.sql` (`trg_*_updated_at`, `pray_count := GREATEST`, `cascade_pool_soft_delete`), `0003_rls_and_rpcs.sql` (verbatim from `C4 §4.3/§4.4` incl. `share_code_attempts`, `join_shared_pool_by_code`, `rotate_pool_share_code`). | FR-202/206 | Local Supabase CLI: `supabase db reset` clean. |
| `P2-12` | `supabase/powersync/sync-rules.yaml` — the two buckets (`user_private`, `joined_pools`) verbatim from `C2 §4.1`. | FR-206 | `powersync validate` passes (`C2` DoD). |
| `P2-13` | PowerSync client wiring in **both** apps: replace `new Schema({})` with the full table `Schema`; add a `SupabaseConnector` (`fetchCredentials` + `uploadData` with LWW/`GREATEST`/soft-delete + 400/403 dead-letter per `C2 §4.2`); call `connect()`; expose status to WS4 store. | FR-206 | Two-device manual round-trip. |
| `P2-14` | Guest → Account upgrade (`C4 §4.1`): atomic local rewrite `guestUserId → authUserId` across local rows, then `connect()` and upload. | FR-206 | `C4` DoD — zero data loss. |
| `P2-15` | **Supabase RLS & RPC test suite** (`F1 §4` suite 4): 2-user tenancy (owner/member/outsider), `cascade_pool_soft_delete`, 6th bad code → `POOL_JOIN_RATE_LIMITED`. | FR-202/206 | Runnable against local Supabase; also satisfies the "≥2 accounts" exit-gate clause once run on real devices. |

### WS5 — UI surfaces (per app: mobile + desktop, tokens-only)

| Unit | Deliverable | FR |
| --- | --- | --- |
| `P2-16` | Capture action bar on the reader — Capture (≤2 taps, full passage expansion) writing a `prayer_pool_items` row via the store. | FR-201 |
| `P2-17` | Pools screen — categorized private/shared pools, create/rename/colour, **collapse answers** ("answered" section), join-by-code, leader prompt + item list, per-member E2EE note. | FR-202 |
| `P2-18` | Swipe-deck rotation session — 5-minute timer, `pray_count+1` on completion, prayed cards rotate to the back of the next queue; answered-flow with testimony capture. UI-thread worklets + Reduced-Motion fallback. | FR-203 |
| `P2-19` | Four guided engines over the existing `BreathRing` — Lectio Divina, Three Rs, ACTS, Breath; each logs a `prayer_session_logs` entry on finish. Breath ring stays 60/120 fps on mid-range Android + iPad. | FR-205 |
| `P2-20` | Offline prompt generator surfaced in each engine (consumes `P2-08`). | FR-204 (offline) |
| `P2-21` | Vault wizard (30 s) — passphrase → Recovery Key display (52 Crockford chars, 13×4) + QR, "I saved my Recovery Key" gate, batch-encrypt existing plaintext, volatile `MiniSearch` purge, biometric fast-unlock via `SecureStorageAdapter`, lock/auto-lock (15 min). | FR-206 |
| `P2-22` | FR-107 — kind habits & reminders (gentle resume copy, never punitive), reminder scheduling in `local_device.sqlite`; ESV ephemeral cache with TTL/verse-cap eviction (BYOK key in `SecureStorageAdapter`, never synced). | FR-107 |

### WS6 — Regression + gate

| Unit | Deliverable |
| --- | --- |
| `P2-23` | Keep `pnpm turbo lint typecheck test` green after every unit; extend `packages/core/test/` per unit above. |
| `P2-24` | Update `G5` (FR-107/201–206 → `Implemented`), `G3` (changelog rows), and mark this plan Complete when the gate below is met. |

---

## 5. Phase-2 Exit-Gate Checklist (`A3 §4.1`)

- [x] Offline edits made on Android sync to iPad **and** Desktop via PowerSync on reconnect (`P2-13`, `P2-14`) — verified on real devices (2026-11-27).
- [x] E2EE vault + Recovery Key passes the crypto suite (`F1 §4` suite 2) **and** a device round-trip (`P2-05`, `P2-07`, `P2-21`).
- [x] Shared Church Pool tested with ≥2 real accounts — User B sees verses + leader prompt, adds an E2EE note, and User A **cannot** read it (`P2-15`, `P2-17`) — two devices now share a pool end-to-end (2026-11-27).
- [x] FR-201 ≤2-tap capture; FR-203 `pray_count` + rotation; FR-204 offline prompts with airplane mode on; FR-205 all 4 engines log sessions; FR-107 gentle resume + ESV eviction.
- [x] `pnpm turbo lint typecheck test` green (`P2-23`) — 12/12 tasks, core 240 tests / 22 files, pack-builder 37 tests.

---

## 6. External Provisioning Required (founder actions — blocking only WS4)

WS1–WS3 + tests run with **zero** external services and can be completed immediately. WS4 is blocked until these exist (checklist per the E1 runbook):

1. **Supabase project** — capture `SUPABASE_URL` + anon key; run migrations `0001–0003` (`supabase db push` / SQL editor).
2. **PowerSync instance** — capture the PowerSync URL; upload `sync-rules.yaml`; point it at the Supabase DB.
3. **Env values** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POWERSYNC_URL` (mobile) and the `VITE_*` equivalents (desktop). These are the same `EXPO_PUBLIC_*` values already outstanding from Phase 1 §6.3 housekeeping.
4. **Auth providers** — enable Email+Password / Magic Link (and Sign in with Apple before any iPad TestFlight, `C4 §4.1`).

Until (1)–(3) exist, `ENABLE_CLOUD_SYNC` stays `true` in code but `connect()` is simply not called, so the app remains fully local — no regression to Phase 1.

---

## 7. Decisions & Risks

- **D1 — Flags already `true`.** No flag edits; Phase 2 is enforced by *consuming* `getPhaseFlags(2)` at boot and by the UI only rendering prayer surfaces when enabled.
- **D2 — Events first.** `C2 §4.3`'s `CoreEvent` union is the seam every later unit publishes through (pack, vault, sync, pool), so `P2-09` lands before the stores that emit.
- **D3 — Prompt template shape mirrors `C1`.** `P2-08` returns the same `{ sections: {stage,prompt}[] }` shape the P4 AI gateway will, so FR-204's P4 upgrade is a backend swap, not a UI rewrite.
- **R1 — `sqlite-vec`/FTS on ciphertext.** Decrypted notes are searched only in a **volatile** `MiniSearch` index (`ADR-004`); never persisted. Must be purged on lock (`P2-21`).
- **R2 — Adapter note.** The earlier assumption that platform crypto/secure-storage adapters were missing was **wrong** — they are fully implemented. Phase-2 does not spend effort there.
- **R3 — Provisioning is the critical path.** WS1–WS3 are provable offline; the exit gate cannot close without §6. Recommend completing WS1–WS3 while provisioning runs.

---

## 8. Non-Goals (explicitly excluded)

FR-106, FR-301..305 (Phase 3); FR-204 AI mode, FR-401..403 (Phase 4); syntax trees, BYO USFM importer, widgets, collaborative comments, i18n (`A3 §4.2` / v1.1). No new SQLite tables beyond `B4 §4.3`.

---

## 9. Immediate Next Step

On approval: start **WS1 unit `P2-01`** (prayer-pool repository + tests), then `P2-02..P2-04`, keeping the gate green — the same build-and-record loop that closed Phase 1. Provisioning (§6) requested in parallel so WS4 is unblocked when WS1–WS3 land.

---

## 10. Progress Ledger (updated each build)

Gate: `pnpm turbo lint typecheck test` — **12/12 tasks, core 240 tests / 22 files, pack-builder 37 tests** green.

| Unit | State | Where |
| --- | --- | --- |
| `P2-01` | ✅ Done | `packages/core/src/repositories/prayer-pool-repository.ts` + `test/prayer-pool.test.ts` |
| `P2-02` | ✅ Done | `packages/core/src/repositories/prayer-engine-repository.ts` + `test/prayer-engine.test.ts` |
| `P2-03` | ✅ Done | `packages/core/src/stores/prayer-store.ts` |
| `P2-04` | ✅ Done | `runtime/core-runtime.ts` (`repositories.prayer`, `stores.prayer`) |
| `P2-05` | ✅ Done | `packages/core/src/repositories/vault-repository.ts` + `test/vault-repository.test.ts` |
| `P2-06` | ✅ Done | `packages/core/src/stores/vault-store.ts` |
| `P2-07` | ✅ Done | `crypto/field-cipher.ts` + encrypt/decrypt-on-read in the prayer repositories |
| `P2-08` | ✅ Done | `packages/core/src/prayer/prompt-templates.ts` + `test/prompt-templates.test.ts` |
| `P2-09` | ✅ Done | `packages/core/src/events/` + `test/events.test.ts` |
| `P2-10` | ✅ Done | `packages/core/src/sync/` + `test/sync-store.test.ts` |
| `P2-11` | ✅ Done | `supabase/migrations/0001_user_schema.sql`, `0002_triggers_and_powersync.sql`, `0003_rls_and_rpcs.sql`, `0004_fix_join_rate_limit_attempt_log.sql` |
| `P2-12` | ✅ Done | `supabase/powersync/sync-rules.yaml` — deployed & verified via live two-device sync (2026-11-27) |
| `P2-13` | ✅ Done | PowerSync client wiring in both apps (`powersync-schema`, `supabase-connector`, `sync`, `sync-service`). Two-device sync round-trip verified on real devices (2026-11-27). |
| `P2-14` | ✅ Done | Zero-Loss Guest → Account upgrade (`auth/`, `account-store`, `AccountScreen`/`AccountView`). Verified end-to-end with two-device sync (2026-11-27). |
| `P2-15` | ✅ Done | `supabase/tests/rls_and_rpcs.test.sql` (34 pgTAP assertions PASS) + live ≥2-device shared-pool join-by-code & sync verified (2026-11-27). |
| `P2-16` | ✅ Done (mobile + desktop) | `apps/mobile/src/app/CaptureSheet.tsx` wired into `ReaderScreen.tsx`; desktop `apps/desktop/src/app/CapturePanel.tsx` wired into `ReaderView.tsx` |
| `P2-17` | ✅ Done (mobile + desktop) | `apps/mobile/src/app/PoolsScreen.tsx` (+ `app/pools.tsx`); desktop `apps/desktop/src/app/PoolsView.tsx` (incl. `ShareCodePanel`) |
| `P2-18` | ✅ Done (mobile + desktop) | `apps/mobile/src/app/PrayerSessionScreen.tsx` (+ `app/prayer-session.tsx`); desktop `apps/desktop/src/app/PrayerSessionView.tsx` (framer-motion drag + Reduced-Motion fallback) |
| `P2-19` | ✅ Done (mobile + desktop) | `apps/mobile/src/app/EngineScreen.tsx` (+ `app/prayer-engines.tsx`); desktop `apps/desktop/src/app/EngineView.tsx` |
| `P2-20` | ✅ Done (mobile + desktop) | offline generator surfaced in `EngineScreen.tsx` / `EngineView.tsx` |
| `P2-21` | ✅ Done (mobile + desktop) | `apps/mobile/src/app/VaultWizardScreen.tsx`, `apps/desktop/src/app/VaultView.tsx` — passphrase → 13×4 Recovery Key + offline QR → saved-gate → batch-encrypt → App Lock (15 min) → volatile `MiniSearch` purge → biometric fast-unlock. |
| `P2-22` | ✅ Done (core + mobile + desktop UI) | `repositories/habits-repository.ts`, `repositories/esv-cache-repository.ts` + `apps/mobile/src/app/HabitsScreen.tsx`, `apps/desktop/src/app/HabitsView.tsx` |
| Desktop mirrors of `P2-16`..`P2-22` | ✅ Done | `apps/desktop/src/app/{CapturePanel,PoolsView,PrayerSessionView,EngineView,VaultView,HabitsView}.tsx` + tabs in `App.tsx` |
| `P2-23` | ✅ Done | gate green throughout (`12/12`, core `240`, pack-builder `37`) |
| `P2-24` | ✅ Done | `G5` bumped to `1.0.3`, `G3` `v1.0.42`, `S2`/`S4` updated, and Phase-2 exit gate marked **PASSED** (2026-11-27). Phase 3 is now unblocked (`A3 §4.1`). |

