# HANDOFF — Breath & Word

> **Read this first** when resuming work in a fresh session, on a new machine, or after the
> project folder was renamed. It is a concise orientation, **not** a replacement for the specs.
> Authoritative specs live in `docs/` — start at `docs/G1-index.md`. The living documentation
> changelog is `docs/G3-changelog.md`.

---

## 1. What this project is

**Breath & Word** — a local-first, privacy-respecting **Bible Study & Scripture Prayer** app.
Monorepo: **pnpm workspaces + Turborepo + strict TypeScript**. One pure-TS core with two UI targets:

- `apps/mobile` — Expo SDK 58 (Android phones + iPadOS), React Native + Reanimated + Skia.
- `apps/desktop` — Tauri v2 + Vite + React 19 (Windows/macOS + web companion), Tailwind + Motion + Dockview.

Build strictly to the **active Phase** (Phase 1 → 2 → 3 → 4). Do **not** implement v1.1 features
(Syntax Trees / Macula, on-device USFM importer, widgets) prematurely. See `docs/product/A3-*.md`.

## 2. Repo layout (canonical tree: `docs/architecture/B3-*.md` §4.1)

```text
breath-word/
├── AGENTS.md                  # non-negotiable engineering contract (see §3)
├── package.json               # pnpm workspaces + turbo scripts
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json · eslint.config.mjs · .npmrc
├── docs/                      # living spec suite (G1 index, A1..G4)
├── supabase/                  # migrations / functions / powersync sync-rules (Phase 2+)
├── tools/pack-builder/        # Node/TS CLI: builds modular content packs (.sqlite + .gz + manifest.json)
│   ├── src/build-pack.ts      #   + `--sample` synthetic Gate-1 fixture
│   └── scripts/serve-packs.mjs#   dev-only static file server (:8787) for on-device pack install
├── packages/
│   ├── tokens/                # design tokens ONLY source of colors/fonts/spacing/motion
│   └── core/                  # 100% PURE TypeScript (no RN / no DOM / no Tauri imports)
│       └── src/{domain,adapters,repositories,runtime,crypto,content,stores,errors,config}
└── apps/{mobile,desktop}/
```

## 3. Golden rules — `AGENTS.md` (non-negotiable)

1. **Monorepo boundaries:** `packages/core` stays 100% pure TS (never import `react-native`,
   `expo-*`, `@tauri-apps/*`, `window`, `document`). UI apps must **never** write raw SQL — all
   queries live in `packages/core/src/repositories/`.
2. **Dual-SQLite separation (`ADR-002`):** static scripture lives only in read-only content packs
   (`ContentDbAdapter`); synced user data in `user_data.sqlite` (`UserDbAdapter` via PowerSync,
   local-only in Phase 1 — `connect()` is never called); local-only state in `local_device.sqlite`.
   Every synced table uses a UUID v4 `id` PK + soft deletes (`deleted_at`); never hard-`DELETE`.
3. **Prayer pool privacy split:** personal notes / `pray_count` / `last_prayed_at` / testimonies
   live only in `prayer_item_user_states`, never on `prayer_pool_items`.
4. **Canonical refs:** verse IDs are Protestant 32-bit `BBCCCVVV` ints `(book*1e6)+(ch*1e3)+v`;
   Strong's IDs are unpadded uppercase (`G26`, `H430`).
5. **Zero-knowledge E2EE (`ADR-004`):** `e2ee:v1:<iv_b64url>:<ct_tag_b64url>`, AES-256-GCM,
   fresh 12-byte IV every write, AAD = `v1|<table>|<row_id>|<column>`. Never persist/log decrypted
   notes; never send private notes to AI unless `includeUserNotes === true`.
6. **UI & a11y:** import ALL colors/fonts/spacing/springs from `@breath-and-word/tokens` (no hex).
   120 Hz animations on the UI thread (Reanimated worklets) with Reduced Motion fallbacks.
   Wrap Hebrew/Aramaic inline tokens in `dir="rtl"` + `unicode-bidi: isolate`.
7. **Errors & gate:** every thrown error is a canonical `AppError` (`packages/core/src/errors/`).
   **The gate is `pnpm turbo lint typecheck test` and must be green (12/12 tasks).**

## 4. Dev environment

- **OS:** Windows 11 · PowerShell 5 · timezone Asia/Shanghai.
- **Node `v24.19.0`** — native TS type-stripping and `node:sqlite` (`DatabaseSync`) work unflagged.
- **pnpm 9+** with Turborepo. `.npmrc`: `auto-install-peers=true`, `strict-peer-dependencies=false`.
- Rust stable (MSVC Build Tools) for Tauri v2 · Android SDK/emulator for `apps/mobile`.
- **Git:** repository initialized; `origin` = <https://github.com/MacMbizo/breath-word.git>, default branch `main`. Run the gate (`pnpm turbo lint typecheck test`) before pushing.
- `tools/pack-builder` needs **`tsx`** to run its CLI (`pack:sample`) because `core` emits
  extensionless relative imports that bare `node` cannot resolve.

## 5. Status snapshot (as of 2026-11-25)

### Done
- **Monorepo scaffold** + Turborepo pipeline (`lint` / `typecheck` / `test`) across 5 packages.
- **`packages/tokens`** — 4 semantic themes (`daylight`/`parchment`/`midnight`/`sanctuary`),
  typography, 4pt spacing scale, motion/breath tokens, `cssVariables`.
- **`packages/core`** (pure TS, 88 tests passing):
  - `domain` — `BBCCCVVV` parser/formatter, `BOOKS` (66-book canon), shared types.
  - `errors` — canonical `AppError` taxonomy + `asAppError`/`AppErrorFallback` (`C3`).
  - `crypto` — E2EE envelope engine, vault (PBKDF2 + AES-256-GCM), recovery key, base64url, uuid.
  - `content` — pack schema DDL, `USER_DATA_DDL`, `local_device` DDL, pack manifest contract.
  - `adapters` — the `CoreAdapters` interface contract (`B3` §4.3).
  - `repositories` — `reader` (FR-101..103), `pack-manager` (FR-105 install/update/remove/attach),
    `reading-plan` (FR-104 enroll / Manna gating / markDayComplete).
  - `runtime` — `initCoreRuntime(adapters)` composition root (`repositories` + headless `stores`).
  - `stores` — framework-free Zustand vanilla stores (reader, pack) with `AsyncStatus`.
- **`tools/pack-builder`** — CLI building `.sqlite` + `.gz` + `manifest.json`; **`--sample`** mode
  emits a deterministic synthetic `core_bsb` fixture (**31,707** verses, **not scripture**) with a
  Rom 8:28 marker; `serve:packs` local server (:8787). 9 tests passing.
- **`apps/desktop`** — Tauri v2 Rust shell (`content_db`, `device_db`, `sql_json`, `pack_io`,
  `commands` — 25 commands) + TS Tauri adapters + Vite/React 19 UI (Reader/Search/Compare/Library
  views, BreathRing, theme switch, headless-store hooks). Rust tests: `content_db`, `device_db`, `pack_io`.
- **`apps/mobile`** — Expo SDK 58 shell over native modules (`op-sqlite`, `@powersync/react-native`,
  `react-native-quick-crypto`, `expo-secure-store`, `react-native-track-player`, Skia);
  Expo Router tree (`_layout`, `index`, dev-only `diagnostics`); `SpikeDiagnostics` on-device harness;
  `run:android` / `run:ios` scripts; `android/` prebuilt.
- **Docs** — full living spec suite in `docs/` (A1..A3, B1..B8, C1..C4, D1/D3, E1/E2/E4, F1, G1/G3/G4).

### Gate-1 spikes (device-only items pending)
| # | Scope | Status |
|---|---|---|
| 1 | Mobile SQLite + FTS5 + WAL isolation | Pass (host) · **Pending (device)** — harness built |
| 2 | Desktop Tauri + PowerSync (WA-SQLite/OPFS) + rusqlite | Pass (host) · **Pending (device)** |
| 3 | Crypto parity (`e2ee:v1`, PBKDF2-SHA256) | Pass (host) · Pending (cross-device) |
| 4 | 120 Hz Breath Ring + Reduced Motion | Pass (host) · **Pending (device)** |
> Details & evidence: `docs/G3-changelog.md` → "Gate-1 Technical Spike Results".

### Next up
1. Run the device spikes on an Android emulator (Spikes 1 & 4) — see §6.
2. Spike 2 runtime check: Tauri app + a real 30 MB pack in the WebView (OPFS restart persistence).
3. Spike 3 cross-device: `quick-crypto` ↔ WebCrypto envelope exchange.
4. Replace the synthetic fixture with a real `core_bsb` pack (needs a BSB-XML → `PackSource` parser).
5. Phase-1 product work: FR-104 Focus Mode / Manna pacing UI; FR-101..105 screens; Dockview
   workspace + `cmdk` on desktop; OS Keychain secure-storage swap on desktop.

## 6. How to run

```powershell
pnpm install                                   # from the repo root
pnpm turbo lint typecheck test                 # THE GATE -> expect 12/12
pnpm turbo build                               # build all packages/apps

# Desktop (Tauri) — needs Rust toolchain
pnpm --filter @breath-and-word/desktop tauri dev

# Mobile on-device (needs Android emulator/device; Expo Go will NOT work — native modules)
pnpm --filter @breath-and-word/pack-builder pack:sample     # build the ~31k-verse fixture into out/
pnpm --filter @breath-and-word/pack-builder serve:packs      # serve out/ on http://0.0.0.0:8787
pnpm --filter @breath-and-word/mobile run:android            # build & install the native dev build
#   In the app: "Gate-1 spike diagnostics" -> Install sample pack -> Run Spike 1
```

## 7. Repo relocation note

The project folder was renamed **`C:\Prj\breath&word` → `C:\Prj\breath-word`** because the `&`
character breaks PowerShell path parsing (`&` is the call operator, so `cd C:\Prj\breath&word`
splits into two commands). No source/config/doc file hard-coded the old absolute path — only
regenerable caches did (`node_modules/.modules.yaml`, `node_modules/.pnpm-workspace-state-v1.json`,
`.bin` shims, `apps/desktop/src-tauri/target`, `.turbo` logs), all of which are regenerated by a
fresh `pnpm install` / `cargo` build. `pnpm-lock.yaml` is path-independent (no lockfile churn).

If anything still points at the old path (IDE recent-projects, shortcuts, shell history), update it
to `C:\Prj\breath-word`. Trae project memory is keyed off the folder path, so a rename may start a
fresh memory namespace — this file exists to cover that gap.

> **The rename is performed OUTSIDE Trae** (a running editor holds the workspace folder open and blocks
> it on Windows). After reopening the project at `C:\Prj\breath-word`, execute **§9** below.

## 8. Recent history

See **`docs/G3-changelog.md`** (currently `v1.0.17`) for the append-only change log, and
**`docs/architecture/B3-*.md`** (currently `1.0.13`) for the frontend/monorepo + Gate-1 spike record.

---

## 9. Post-rename checklist — run AFTER the folder is moved to `C:\Prj\breath-word`

The `&` in the old name breaks PowerShell path parsing (`&` is the call operator), so the folder is
renamed **outside Trae** while the editor is closed. No source/config/doc file hard-codes the old
absolute path — only regenerable caches do — so the source tree and `pnpm-lock.yaml` are untouched.
Once the project is reopened at `C:\Prj\breath-word`, do the following in order:

1. **Confirm the move.** `Test-Path C:\Prj\breath-word` → `True`, and `HANDOFF.md` is present at the
   repo root. (The old `C:\Prj\breath&word` must no longer exist.)
2. **Delete the caches that embed the old absolute path** (all safe / regenerable):
   - `apps/desktop/src-tauri/target` — Rust build cache (`.d`, `output`, `root-output` files).
   - every `.turbo` folder (Turborepo logs/cache).
   - `apps/mobile/android/.gradle` and `apps/mobile/android/app/build` (if present).
   ```powershell
   Remove-Item -Recurse -Force -ErrorAction SilentlyContinue `
     .\apps\desktop\src-tauri\target,
     .\apps\mobile\android\.gradle,
     .\apps\mobile\android\app\build
   Get-ChildItem -Recurse -Force -Directory -Filter '.turbo' -ErrorAction SilentlyContinue |
     Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
   ```
3. **Reinstall dependencies** from the repo root — this regenerates the path-bearing pnpm metadata
   (`node_modules/.modules.yaml`, `node_modules/.pnpm-workspace-state-v1.json`, and every
   `node_modules/**/.bin` shim). If pnpm errors or behaves oddly, delete every `node_modules` folder
   and reinstall.
   ```powershell
   pnpm install
   ```
4. **Run the gate** — expect **12/12** (the first run after the move is uncached).
   ```powershell
   pnpm turbo lint typecheck test
   ```
5. **Rebuild the Gate-1 fixture** (lives in the gitignored `out/`).
   ```powershell
   pnpm --filter @breath-and-word/pack-builder pack:sample
   ```
6. **Optional native resets.** `cargo clean` inside `apps/desktop/src-tauri` before the next Tauri
   build; `npx expo prebuild --clean` inside `apps/mobile` if Gradle complains about the prebuilt
   `android/`.
7. **Verify nothing stale remains.** Search the repo (excluding `node_modules`, `target`, `.turbo`)
   for `C:\Prj\breath&word` → expect **zero** hits.
8. Nothing else to change: `pnpm-lock.yaml` is path-independent and all in-repo paths are relative.

After §9 the project is fully functional at `C:\Prj\breath-word`; resume from **§5 → Next up**.
