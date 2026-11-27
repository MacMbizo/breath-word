# S3: Challenges & How They Were Solved

**Document ID:** `S3`
**Version:** `1.0.0`
**Status:** `Living`
**Last Updated:** `2026-11-27`
**Related Docs:** `S1`, `S2`, `S4`, `C3`, `C4`, `B4`, `B6`, `G3`

> A record of the non-trivial problems hit while building Breath & Word and how each was
> resolved. Each entry is **Problem → Cause → Resolution**. Ordering is thematic, not
> chronological. All fixes are landed and the gate is green.

---

## 1. Content packs & on-device storage

### 1.1 Device-side pack install failure (Gate-1 Spike 1 blocked)
- **Problem:** The offline reader could not install a content pack on-device; the Library
  reported *"The downloaded pack could not be verified."*
- **Cause:** `op-sqlite`'s `:memory:` configuration froze the `base_path`, so the pack
  database could not be attached correctly on device.
- **Resolution:** Reworked `apps/mobile/src/adapters/content-db.ts` to use a direct
  `ATTACH DATABASE ? AS ?` (the `FR-105` fix). Shipped in the ready build; Spike 1 then
  passed on device.

### 1.2 Building a real translation through the production ETL
- **Problem:** Phase-1 on-device packs were synthetic Gate-1 fixtures, not real Scripture.
- **Resolution:** Ran the production pipeline (`B5 §4.1`, no API keys) against the
  public-domain **World English Bible** USFM → `trans_web`, 31,103 verses, integrity clean
  (`G3 v1.0.40`). `core_bsb` and `trans_kjv` likewise built and verified.

---

## 2. Mobile device & Metro bundling

### 2.1 Emulator "Unable to load script" after the offline test
- **Problem:** After force-stopping and relaunching the app, logcat showed
  `RuntimeException: Unable to load script` / `loadJSBundleFromAssets`.
- **Cause (two-fold):** (a) the emulator's **virtual network was still down** — a leftover from
  the earlier "turn mobile Wi-Fi and data off" offline test — so `10.0.2.2:8081` (the host
  loopback alias a stock debug build fetches its bundle from) was unreachable; (b) a **second
  Metro instance** had landed on port `8082` while `8081` was already held by
  `expo start --clear`.
- **Resolution:** Re-enabled connectivity
  (`settings put global airplane_mode_on 0`, `cmd connectivity airplane-mode disable`,
  `svc wifi enable`, `svc data enable`), stopped the duplicate Metro process,
  `adb reverse tcp:8081 tcp:8081`, then force-stop + relaunch. Confirmed the new bundle loads
  (`loadJSBundleFromMetro()` + `Running "main"`).

### 2.2 Offline errors look like failures (they are not)
- **Problem:** With Wi-Fi/data off, PowerSync logs `java.net.UnknownHostException` and
  *"Software caused connection abort"*, which reads like a crash.
- **Cause:** These are the expected shape of an offline sync attempt.
- **Resolution:** No code change — they are surfaced as the canonical `SYNC_OFFLINE` state
  (`C3`), not an error bubble. Documented here so the behaviour is not mistaken for a bug.

---

## 3. Sync & shared-pool tenancy

### 3.1 A created pool vanished after leaving and re-entering it
- **Problem:** A pool created on mobile did not appear on desktop, and after navigating out of
  the pool and back in, the pool was gone.
- **Cause:** A **stale guest user id** was being used for the request, so the row was written
  under the wrong identity; the subsequent read hit **RLS 403** and the rejected mutation went
  to the dead-letter queue — the local row was never reconciled.
- **Resolution:** Resolved the identity at write time via `getOrCreateCurrentUserId`, so the
  row owner and the requester always match.

### 3.2 Duplicate OWNER membership rows
- **Problem:** Creating a pool could produce two OWNER membership rows.
- **Cause:** Both the client and the database trigger tried to provision the owner membership.
- **Resolution:** The `add_pool_owner_member()` trigger is the **sole provisioner**; the client
  no longer inserts the owner row itself.

### 3.3 Shared-pool join rate-limit was inert (High-severity, caught by tests)
- **Problem:** The 6-failed-attempts brute-force limit did not actually block anything.
- **Cause:** The failed-attempt log insert was rolled back together with the `RAISE`, so no
  attempt was ever recorded.
- **Resolution:** Migration
  [`0004_fix_join_rate_limit_attempt_log.sql`](../../supabase/migrations/0004_fix_join_rate_limit_attempt_log.sql):
  the invalid-code branch now **`RETURN`s** `{"error":"POOL_SHARE_CODE_INVALID"}` (letting the
  attempt commit) instead of raising; `AUTH_REQUIRED` / `POOL_JOIN_RATE_LIMITED` still raise.
  Ratified as-is in `C4 §4.4` rather than amending the contract.

### 3.4 Share code not visible immediately after minting
- **Problem:** After generating a share code, the UI did not show it.
- **Cause:** `share_code` is **server-authoritative and synced** — the local `prayer_pools`
  row only updates on the **next PowerSync checkpoint**, which may be seconds away.
- **Resolution:** The UI renders the value **returned by the RPC** immediately, held in a local
  `freshShareCode` state (reset when switching pools).

### 3.5 No way to create/share a code for a shared pool
- **Problem:** There was no owner-side UI to mint a share code.
- **Resolution:** Added the full owner-side flow end-to-end:
  `PoolShareAdapter.rotatePoolShareCode` (`packages/core/src/adapters/index.ts`) → both app
  adapters (`apps/{mobile,desktop}/src/adapters/pool-share.ts` calling
  `supabase.rpc('rotate_pool_share_code', { p_pool_id })`) →
  `prayer-store.rotateShareCode` (+ `shareCodeStatus`/`shareCodeError`) →
  `poolShareCodeError` mapper (`POOL_PERMISSION_DENIED`) → a `ShareCodePanel` on **both**
  mobile (RN `Share.share`) and desktop (copy to clipboard), with tests.

---

## 4. Supabase CLI & provisioning ops

### 4.1 `supabase` not on PATH
- **Resolution:** Always invoked as `npx --no-install supabase …`.

### 4.2 Remote migration history mismatch
- **Resolution:** Repaired the migration history against the hosted project, then verified the
  remote schema matched the local migrations.

### 4.3 `migration repair` and `--linked` ergonomics
- **Resolution:** `migration repair` needs `--yes` for non-interactive use; `--linked` is
  deprecated in favour of `--remote`.

### 4.4 Local stack port clash with a sibling project
- **Problem:** The default Supabase DB port `54322` was already taken by another local stack
  (`C:\Prj\mccShepherd`).
- **Resolution:** Shifted this project's `db.port` to **54332** (and `shadow_port` to 54330) in
  [`config.jsonc`](../../supabase/config.jsonc) so both stacks run side-by-side.

### 4.5 PowerSync 401 (`PSYNC_S2101`) after sign-in
- **Problem:** PowerSync sync failed with an HTTP 401 `PSYNC_S2101`.
- **Cause:** The Supabase JWT's **audience** did not satisfy PowerSync's configured verification.
- **Resolution:** Add `authenticated` to the JWT audience and ensure the signing key/JWKS is the
  one PowerSync verifies against. After sign-out/sign-in on both devices the sync connected.

### 4.6 Stuck "Working…" sign-in button
- **Problem:** The sign-in button greyed out and stayed on "working" on both platforms without
  ever completing.
- **Resolution:** Corrected the account/session flow so the auth store resolves to a terminal
  state (and the app returns to the app rather than parking on the sign-out option).

---

## 5. Cryptography & privacy

### 5.1 Searching decrypted notes without persisting plaintext
- **Problem:** Users want to search their notes, but `sqlite-vec`/FTS over **ciphertext** is
  impossible and persisting decrypted text would violate `B6`/`ADR-004`.
- **Resolution:** `packages/core/src/search/note-search.ts` — a **volatile, in-RAM**
  `MiniSearch` index. It is destroyed by `stores.vault.lock()` **and** on sign-out
  (`account-store.onSignOut` → vault lock). Decrypted plaintext never touches disk or FTS5.

### 5.2 Never park the raw DEK in a non-hardware store
- **Problem:** Biometric fast-unlock needs the DEK available, but writing a raw key to a
  non-hardware-backed store would break the threat model.
- **Resolution:** Mobile uses `expo-secure-store` behind a user-presence check
  (`supportsBiometric` + `requireAuthentication`). Desktop's placeholder reports
  `supportsBiometric: false`, so **no raw DEK is ever written there**. The key is cleared on a
  fresh `initVault`.

---

## 6. UI & toolchain

### 6.1 Desktop `PoolsView.tsx` failed to compile mid-edit
- **Problem:** A half-applied edit left `ShareCodePanel` referenced but undefined and the
  `ActionChip` JSX missing its `return (`.
- **Resolution:** Inserted the desktop `ShareCodePanel` (port of the mobile panel to
  HTML/Tailwind) and restored `return (`; the view compiles and the gate is green.

### 6.2 Core tests failed `typecheck` after the adapter gained a method
- **Problem:** `PoolShareAdapter` gained required `rotatePoolShareCode`, so the fake adapters
  in `packages/core/test/stores.test.ts` no longer satisfied the interface.
- **Resolution:** Added the method to the fixture adapters and appended a dedicated
  `rotateShareCode` suite (unprovisioned → `AUTH_REQUIRED`; success returns the code;
  non-owner → `POOL_PERMISSION_DENIED`).

### 6.3 A stale assumption: "platform crypto/secure-storage adapters are missing"
- **Problem:** Early planning assumed those adapters had to be written.
- **Resolution:** Verified they were **already fully implemented** on both platforms (mobile:
  `react-native-quick-crypto` + `expo-secure-store`; desktop: WebCrypto + Tauri keychain) — no
  effort spent there (plan decision `R2`).

---

## 7. Process & guardrails (how the work stayed safe)

- **Phase guardrail (`AGENTS.md` rule 7):** Phase-2 features were built **only** after the
  Phase-1 exit gate passed; `FR-204`'s AI mode stayed deferred to Phase 4.
- **Gate discipline (`P2-23`):** `pnpm turbo lint typecheck test` was kept green after every
  unit; failures were fixed at the point of change, never deferred.
- **Provable-offline-first sequencing:** WS1–WS3 (repositories, stores, prompt engine) were
  built and unit-tested with **zero external infrastructure**, so provisioning was never on the
  critical path for the bulk of Phase 2.
