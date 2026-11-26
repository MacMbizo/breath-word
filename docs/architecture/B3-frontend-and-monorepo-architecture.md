# B3: Frontend & Monorepo Architecture

**Document ID:** `B3`  
**Version:** `1.0.13`  
**Status:** `Approved`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-25`  
**Related Docs:** `B1`, `B4`, `B8` (`ADR-001..003`), `D1`, `D3`, `E2`, `F1`

## Purpose & Scope

Specifies the exact `pnpm`/Turborepo directory structure, `packages/core` adapter interfaces, state management architecture, rich animation tooling for Mobile (`apps/mobile`) and Desktop/Web (`apps/desktop`), and the **48-Hour Gate-1 Technical Spike** checklist.

## Audience

Founder and AI coding partner. Use this document verbatim to scaffold the repository on Day 1.

## Body

### 4.1 Canonical Monorepo Structure (`pnpm` Workspaces + Turborepo)

```text
breath-and-word/
├── package.json                     # pnpm workspaces + turbo scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── docs/                            # Living documentation suite (G1, A1..G4)
├── supabase/                        # Supabase migrations, RLS, Edge Functions, PowerSync YAML
│   ├── migrations/
│   ├── functions/
│   └── powersync/sync-rules.yaml
├── tools/
│   └── pack-builder/                # Node/TS CLI ETL building *.sqlite.gz + manifest.json
│       ├── src/parsers/             # bsb, usfm, stepbible, tsk, theographic
│       ├── src/versification/       # MT -> Protestant BBCCCVVV maps
│       ├── scripts/serve-packs.mjs  # dev-only static file server for on-device pack install (Spike 1/2)
│       └── src/build-pack.ts        # + `--sample` mode: synthetic ~31k-verse Gate-1 fixture
├── packages/
│   ├── tokens/                      # Shared design tokens (colors, type, spacing, springs)
│   │   └── src/{colors,typography,motion,spacing}.ts
│   └── core/                        # 100% Pure TypeScript (ZERO React Native or DOM imports!)
│       └── src/
│           ├── domain/              # Types (B4 §4.5), BBCCCVVV parser/formatter, Zod schemas
│           ├── adapters/            # Abstract interfaces: ContentDb, UserDb, Crypto, Audio, FileSystem
│           ├── repositories/        # VerseRepo, ExegesisRepo, PrayerPoolRepo, StudyNoteRepo, PlanRepo
│           ├── runtime/             # initCoreRuntime(adapters) composition root (B3 §4.2 rule 2)
│           ├── crypto/              # E2EE Envelope engine (PBKDF2 + AES-256-GCM + Recovery Key)
│           ├── search/              # Volatile in-memory MiniSearch for decrypted notes
│           ├── prayer/              # Smart Rotation selector, Lectio/3Rs/ACTS/Breath state machines, offline templates
│           ├── sync/                # PowerSync AppSchema definition + soft-delete cascade helpers
│           ├── packs/               # PackManager state machine (download, SHA-256 verify, swap)
│           ├── ai/                  # Grounded AI client + citation parser
│           └── stores/              # Headless Zustand stores (useReaderStore, usePrayerStore, useVaultStore, useAudioStore)
└── apps/
    ├── mobile/                      # Expo SDK 58 (Android Phones + iPadOS Tablets)
    │   ├── app/                     # Expo Router file-based routes
    │   │   ├── _layout.tsx          # boots bootMobile() -> <CoreRuntimeProvider><Stack/> (loading/error states)
    │   │   ├── index.tsx            # home route (Breath Ring) + dev-only link to the spike harness
    │   │   └── diagnostics.tsx      # dev-only Gate-1 spike harness route (src/app/SpikeDiagnostics)
    │   ├── src/adapters/            # content-db/local-device (op-sqlite), user-db (@powersync/react-native), crypto (quick-crypto), secure-storage (expo-secure-store), audio (TrackPlayer), pack-installer (expo-file-system + fflate)
    │   ├── src/app/                 # CoreRuntimeProvider (context) + BreathRing (FR-205 Skia + Reanimated) + SpikeDiagnostics (dev-only)
    │   ├── src/boot.ts              # bootMobile()/bootMobileApp(adapters): initCoreRuntime + restore attached packs
    │   └── app.json / babel.config.js / metro.config.js / tsconfig.json
    └── desktop/                     # Tauri v2 + Vite + React 19 (Win11 + macOS + Web Companion target)
        ├── src-tauri/               # Rust backend (rusqlite FTS5 commands, pack downloader, native fs)
        │   └── src/{lib.rs,main.rs,content_db.rs,device_db.rs,sql_json.rs,commands.rs,pack_io.rs}
        └── src/
            ├── main.tsx             # Vite entry: bootDesktop() -> <CoreRuntimeProvider><App/>; applies the D1 theme
            ├── app/                 # React 19 shell: App (tabs + theme switch), ReaderView (FR-101), SearchView (FR-103), CompareView (FR-102), LibraryView (FR-105), BreathRing (FR-205), VerseSpans
            ├── adapters/            # Tauri invoke ContentDb/UserDb/LocalDevice, WebCrypto, WebAudio, WebView fetch pack downloader
            ├── boot.ts              # bootDesktopApp(adapters): initCoreRuntime + restore attached packs
            ├── workspace/           # Dockview panel registry + global keyboard shortcuts (Cmd/Ctrl+K/P/E)
            └── components/          # Tailwind CSS + Motion (PrayerDeck, InkCanvas)
```

### 4.2 Strict Dependency & Boundary Rules

1. `packages/core` **MUST NOT** import `react-native`, `expo-*`, `@tauri-apps/*`, or browser `window`/`document` globals. (Enforced via ESLint `no-restricted-imports`.)
2. All UI components receive state via headless Zustand stores or repository hooks initialized with platform-injected adapters at app boot (`initCoreRuntime(adapters)`).
3. All database queries live inside `packages/core/src/repositories/`—UI components **never** write raw SQL.

### 4.3 Core Platform Adapter Contracts (`packages/core/src/adapters/index.ts`)

```typescript
export interface SqlQueryResult<T = Record<string, unknown>> {
  rows: T[];
}

/** Read-only adapter for modular bible_content/*.sqlite packs (op-sqlite on Mobile; Rust rusqlite on Tauri) */
export interface ContentDbAdapter {
  attachPack(packId: string, absolutePath: string): Promise<void>;
  detachPack(packId: string): Promise<void>;
  getAttachedPacks(): Promise<string[]>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

/** Synced read/write adapter for user_data.sqlite (@powersync/react-native on Mobile; @powersync/web on Desktop/Web) */
export interface UserDbAdapter {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  writeTransaction<T>(fn: (tx: Pick<UserDbAdapter, 'execute' | 'query'>) => Promise<T>): Promise<T>;
  watch<T>(sql: string, params: unknown[], onChange: (rows: T[]) => void): () => void;
}

/** Local-only, never-synced device database (B4 §4.4 local_device.sqlite; op-sqlite / rusqlite) */
export interface LocalDeviceAdapter {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

/** Resolved absolute paths for one pack install (B4 §4.6 atomic swap) */
export interface PackInstallPaths {
  readonly directory: string;      // installed .sqlite pack directory (created if missing)
  readonly installed: string;      // final installed .sqlite path for this pack version
  readonly tempDownload: string;   // scratch path for the in-flight *.sqlite.gz download
  readonly tempExtract: string;    // scratch path for the decompressed staging .sqlite
}

/** Platform file/network primitives for the Content Pack Manager (FR-105, B4 §4.6) */
export interface PackInstallerAdapter {
  resolvePaths(packId: string, contentVersion: string): Promise<PackInstallPaths>;
  download(url: string, destPath: string, onProgress?: (receivedBytes: number) => void): Promise<void>;
  sha256HexFile(path: string): Promise<string>;
  gunzip(srcGzPath: string, destPath: string): Promise<void>;
  fileSizeBytes(path: string): Promise<number>;
  removeFile(path: string): Promise<void>;
  rename(fromPath: string, toPath: string): Promise<void>; // atomic replace (same filesystem)
  availableDiskSpaceBytes(directory: string): Promise<number>;
}

/** Platform-native CSPRNG & WebCrypto primitives (react-native-quick-crypto / globalThis.crypto.subtle) */
export interface CryptoPrimitivesAdapter {
  randomBytes(length: number): Uint8Array;
  pbkdf2Sha256(passphrase: string, salt: Uint8Array, iterations: number, keyLengthBytes: number): Promise<Uint8Array>;
  aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertextWithTag: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  sha256Hex(data: Uint8Array): Promise<string>;
}

/** Secure key storage for optional biometric vault unlock (expo-secure-store / OS Keychain via Tauri) */
export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/** Dual-track narration + ambient audio controller (TrackPlayer on Mobile; HTML5/WebAudio on Desktop) */
export interface AudioEngineAdapter {
  loadChapter(urlOrPath: string, title: string, subtitle: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(ms: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>; // 0.8 .. 2.0
  setAmbientTrack(trackId: 'none' | 'rain' | 'piano' | 'pad', volume: number): Promise<void>;
  setNarrationVolume(volume: number): Promise<void>;
  setSleepTimer(minutes: number | null): Promise<void>;
  onPositionUpdate(cb: (positionMs: number) => void): () => void;
}
```

### 4.4 Rich & Animated UI Architecture (Per `ADR-001` & User Goal)

| Surface | Mobile (`apps/mobile` — Android & iPadOS) | Desktop & Web (`apps/desktop` — Win11, macOS, Browser) |
| --- | --- | --- |
| **Layout Engine** | Adaptive breakpoints (`useWindowDimensions`): `<768px` = single-column phone reader + bottom sheets (`@gorhom/bottom-sheet`); `≥768px` (iPadOS) = resizable 2-pane split view + drag-to-pool. | `dockview` multi-pane tabbed workspace (Left: Library/Pools; Center: Parallel Reader; Right: Exegesis/Factbook; Bottom: Journal/AI) + `cmdk` palette (`Ctrl/Cmd+K`). |
| **Motion & 120Hz Flows** | `react-native-reanimated` v3 (UI-thread worklets for Breath Prayer ring, swipeable Prayer Deck cards, Focus Mode toolbar fade, Tap-to-Capture spring bar) + `expo-haptics` subtle tactile cues on inhale/exhale transitions. | `motion` (Framer Motion) spring physics driven by shared `packages/tokens/src/motion.ts` spring curves (`gentle`, `breath`, `snappy`). |
| **List Virtualization** | `@shopify/flash-list` for instant 66-book / 1,189-chapter scrolling and parallel verse sync without blank frames. | `@tanstack/react-virtual` for synchronized multi-column parallel scrolling across up to 4 translations. |
| **Stylus Ink** | `@shopify/react-native-skia` `<Canvas>` + `Gesture.Pan()` capturing Apple Pencil pressure + `perfect-freehand` polygon paths. | HTML5 `<canvas>` / SVG PointerEvents (`e.pressure`) + identical `perfect-freehand` renderer. |

### 4.5 Mandatory 48-Hour Gate-1 Technical Spike Checklist

Before writing Phase 1 application screens, execute and verify these **4 micro-spikes** in a throwaway branch:

1. **Spike 1 (`apps/mobile` SQLite):** Verify `@op-engineering/op-sqlite` opens a test `core_bsb.sqlite` read-only via `ATTACH DATABASE`, executes an FTS5 query in <20ms on Android emulator & iPad simulator, *alongside* a separate `@powersync/react-native` database instance without lock contention. *Host halves wired:* `apps/mobile/src/adapters/content-db.ts` (op-sqlite `ATTACH DATABASE` per pack) and `apps/mobile/src/adapters/user-db.ts` (`@powersync/react-native` `PowerSyncDatabase`, `dbFilename: user_data.sqlite`, local-only) now implement the §4.3 `ContentDbAdapter`/`UserDbAdapter` contract. *Device harness wired:* `pack-builder --sample` (or `pnpm --filter @breath-and-word/pack-builder pack:sample`) emits a deterministic synthetic `core_bsb` fixture (~31,707 verses, ~18.6 MB `.sqlite` + `.gz` + `manifest.json`) — filler text, **not scripture**, with a single distinctive marker verse (Rom 8:28) for the FTS5 assertion; `scripts/serve-packs.mjs` (`serve:packs`, `:8787`) serves `out/` so the device exercises the real FR-105 install flow; and the dev-only `apps/mobile/app/diagnostics.tsx` → `src/app/SpikeDiagnostics.tsx` screen installs that pack through `repositories.packs.install` and times `SEARCH_ITERATIONS` FTS5 `search` reads concurrently with `CONCURRENT_WRITES` `user_data.sqlite` writes (routed only through core repositories — no UI SQL). The emulator/simulator FTS5 latency + lock-contention measurement is still pending.
2. **Spike 2 (`apps/desktop` Tauri + PowerSync):** Verify Tauri v2 WebView runs `@powersync/web` (WA-SQLite + OPFS persistence across app restarts) while Tauri Rust command `query_content_db` (`rusqlite` with `bundled` + `fts5`) queries a local 30MB SQLite pack in <10ms.
3. **Spike 3 (`packages/core` Crypto Parity):** Encrypt a UTF-8 string with `react-native-quick-crypto` on Mobile and decrypt the exact `e2ee:v1:...` payload with `crypto.subtle` on Desktop/Node (and vice versa) using identical AAD and PBKDF2-SHA256 output.
4. **Spike 4 (120Hz Breath Ring):** Render a Skia/Reanimated animated breathing circle on Android/iPad verifying smooth frame pacing and `AccessibilityInfo.isReduceMotionEnabled()` fallback. *Pass (host) on the desktop/web analogue:* `apps/desktop/src/app/BreathRing.tsx` renders the `FR-205` ring from `BREATH_TIMING`/`BREATH_EASING`, animating only `transform`/`opacity` (compositor-friendly for 120Hz) with a `useReducedMotion()` (`prefers-reduced-motion`) fallback. The mobile analogue is now wired — `apps/mobile/src/app/BreathRing.tsx` renders the same `FR-205` cycle as a Skia `<Canvas>` whose `Circle` `r`/`opacity` are driven by Reanimated shared values (`withTiming` on the UI thread) with a `useReducedMotion()` still-ring fallback — but the on-device frame-pacing + `AccessibilityInfo.isReduceMotionEnabled()` measurement is still pending.

## Acceptance / Done Criteria

- Monorepo scaffolds with `pnpm install && pnpm turbo typecheck test` green across `packages/core`, `packages/tokens`, `apps/mobile`, and `apps/desktop`.
- ESLint blocks any platform-specific import inside `packages/core`.
- All 4 Gate-1 Technical Spikes pass and are recorded in `G3`.

## Open Questions

- `[OPEN]` Confirm whether `apps/desktop` will also compile as a pure SPA (`VITE_TARGET=web`) via conditional adapter swap (`WebContentApiAdapter` vs `TauriRusqliteAdapter`) in Phase 4.

## Assumptions

- `[ASSUMPTION]` Node 22 LTS, `pnpm` 9+, Rust stable (for Tauri v2), and Expo SDK 52+ are available on the developer's workstation.

## Change Log

- `1.0.13` | `2026-11-25` | Athena | Unblocked the device-only Gate-1 Spikes 1 & 4 with the tooling + harness the emulator runs against. **`tools/pack-builder`:** `src/build-pack.ts` gained a `--sample` mode (`createSamplePackSource()` → a deterministic synthetic `core_bsb` fixture of **31,707** verses across the full 66-book canon — generated filler text, **not scripture** — with Romans 8 emitted at its real length so the Rom 8:28 marker (`45008028`) exists for the FTS5 assertion; `SAMPLE_VERSE_COUNT` is the single source of truth for tests). Bulk-load is now wrapped in one `BEGIN`/`COMMIT` (per-row autocommit made ~31k inserts take minutes; a single transaction ≈0.6 s) and `buildPackDatabase` is idempotent (`rmSync` the target first); added `pack:sample` + `serve:packs` scripts and the `tsx` dev-dependency (bare `node` cannot load core's extensionless TS imports). New `scripts/serve-packs.mjs` — a dev-only static file server (default `:8787`, path-traversal-guarded) that serves `out/` so a device exercises the real FR-105 install flow. **`apps/mobile`:** added `run:android`/`run:ios` (`expo run:*` — a native dev build is required because Expo Go cannot load op-sqlite/quick-crypto/Skia/TrackPlayer) and the dev-only `app/diagnostics.tsx` → `src/app/SpikeDiagnostics.tsx` harness: it installs the sample pack via `repositories.packs.install` then times `SEARCH_ITERATIONS` FTS5 `search` reads against `CONCURRENT_WRITES` concurrent `user_data.sqlite` writes (`readingPlans.markDayComplete`), logging min/p50/max against the 20 ms budget — all routed through `packages/core` repositories (no UI SQL, AGENTS.md rule 1). Taught the root ESLint config to treat `*.config.{js,cjs}` as Node CommonJS and Node ESM helper scripts (`.mjs`) as module-scoped Node globals. Gate green: `pnpm turbo lint typecheck test` **12/12**. Spike 1/4 on-device measurement still **Pending (device)**.
- `1.0.12` | `2026-11-25` | Athena | Stood up the §4.1 **`apps/mobile` Expo SDK 58** shell for Gate-1 Spikes 1 & 4. Full §4.3 `CoreAdapters` contract over native modules: `content-db`/`local-device` (`@op-engineering/op-sqlite`, packs `ATTACH DATABASE`d per id + canonical `local_device.sqlite` DDL gated on `PRAGMA user_version`), `user-db` (**`@powersync/react-native`** `PowerSyncDatabase`, `dbFilename: user_data.sqlite`, **local-only** — `connect()` never called, `ADR-002`), `crypto` (`react-native-quick-crypto` `subtle` + `getRandomValues`), `secure-storage` (`expo-secure-store`), `audio` (`react-native-track-player`), `pack-installer` (`expo-file-system` `File`/`Directory`/`Paths` + `fflate` `gunzipSync`), composed by `createMobileAdapters()` + a new `bootMobile()`. Wired the Expo Router tree: `app/_layout.tsx` boots `bootMobile()` → `<CoreRuntimeProvider><Stack/>` (loading/error states), `app/index.tsx` mounts the **Spike 4** `FR-205` Breath Ring (`src/app/BreathRing.tsx`: Skia `<Canvas>` `Circle` `r`/`opacity` driven by Reanimated shared values on the UI thread, `useReducedMotion()` still-ring fallback). Added the monorepo-aware `metro.config.js` (`watchFolders` + dual `nodeModulesPaths`) and `babel-preset-expo`-only `babel.config.js` (its worklets/Reanimated plugins are auto-added), plus `app.json`/`tsconfig.json`. Taught the root ESLint config to treat `*.config.js` as Node CommonJS (its `require`/`module`/`__dirname` usage). Spikes 1 & 4 host halves now wired; on-device verification (emulator/simulator FTS5 latency + lock contention; frame pacing + `AccessibilityInfo.isReduceMotionEnabled()`) remains pending. Gate green: `pnpm turbo lint typecheck test` **12/12**.
- `1.0.11` | `2026-11-25` | Athena | Backed the §4.1/§4.3 desktop `user_data.sqlite` with **PowerSync `@powersync/web`** (`apps/desktop/src/adapters/user-db.ts`, `ADR-002`), replacing the command-backed placeholder: `createUserDbAdapter()` opens a `PowerSyncDatabase` (`WA-SQLite` + OPFS in the Tauri WebView, `dbFilename: user_data.sqlite`) and adapts `execute`/`getAll`/`writeTransaction`/`watchWithAsyncGenerator` onto the §4.3 `UserDbAdapter` contract. Phase 1 runs **local-only** — `connect()` is never called, so no sync client/network starts — while the canonical `USER_DATA_DDL` (B4 §4.3) is applied verbatim at first boot, so every `packages/core` repository query runs unchanged and PowerSync's own sync schema starts empty (it gains the synced tables in Phase 2 behind the same adapter). All adapter failures are coerced to canonical `AppError`s (`asAppError`, AGENTS.md rule 7). Added the `@tauri-apps/cli` dev-dependency + `tauri` script and the required `worker: { format: 'es' }` Vite setting (PowerSync's WA-SQLite worker is code-split ESM, which Vite's default `iife` worker format cannot build). Gate-1 Spike 2 remains **Pass (host) · Pending (device)**.
- `1.0.10` | `2026-11-25` | Athena | Landed the §4.1 desktop **FR-102 / FR-103** reader screens (`apps/desktop/src/app/`): `SearchView` drives the headless reader store's `search` (offline `verses_fts` `MATCH`, optional translation/book filters) and highlights the `[[…]]` `snippet(...)` markers, with `formatCanonicalRange` for each hit's reference; `CompareView` parses `packId:code` `TranslationRef`s, computes the canonical id with `toCanonicalVerseId`, calls `compareVerses`, and renders the translations in a side-by-side grid (per-ref "not available" column). Extracted `VerseSpans` (the structured red-letter span renderer) and reused it in `ReaderView`. Both new screens read the wired reader store only — no SQL in the UI (AGENTS.md rule 1). Added a `Compare`/`Search` tab to `App`.
- `1.0.9` | `2026-11-25` | Athena | Landed the §4.5 Gate-1 **Spike 4** desktop/web analogue: the `FR-205` Breath Prayer ring (`apps/desktop/src/app/BreathRing.tsx` + a new `Breathe` tab in `App`). Its inhale/hold/exhale/rest cycle is driven entirely by the shared `packages/tokens/src/motion.ts` contract — `BREATH_TIMING` (4s inhale / 6s exhale) and `BREATH_EASING` (`bezier [0.37,0,0.63,1]`, `minScale 0.62`, `maxScale 1.0`, `holdPauseMs 400`) — animating only `transform`/`opacity` over a static guide ring so the WebView stays on the compositor at 120Hz, with a `useReducedMotion()` (`prefers-reduced-motion`) fallback that holds the ring still while the phase cue advances. Recorded **Pass (host) · Pending (device)** (mobile Skia/Reanimated + `AccessibilityInfo.isReduceMotionEnabled()` still to be confirmed on device). Updated the §4.1 tree to list `BreathRing` under `src/app/`.
- `1.0.8` | `2026-11-25` | Athena | Landed the §4.1 desktop Vite + React 19 frontend (`apps/desktop/index.html`, `src/main.tsx`, `src/app/`): React 19 + Vite 6 + Tailwind + Motion. `main.tsx` calls `bootDesktop()`, applies the D1 theme from `@breath-and-word/tokens`, then mounts `<CoreRuntimeProvider><App/></CoreRuntimeProvider>`; screens read the headless stores via `useCoreStore` (`useSyncExternalStore`) — `ReaderView` (FR-101 chapter spans + red letter) and `LibraryView` (FR-105 installed packs + storage total), plus an `App` shell with screen tabs and a four-theme switch. Tailwind utilities map onto the `--bw-*` token CSS variables (no hex in components) and Motion honours Reduced Motion. Added `vite.config.ts`/`tailwind.config.js`/`postcss.config.js` + `jsx: react-jsx`/`vite/client`, taught the root ESLint config to lint `.tsx`, and pointed `tauri.conf.json` `frontendDist` at `../dist` with `devUrl`.
- `1.0.7` | `2026-11-25` | Athena | Wired the §4.1 desktop TypeScript platform adapters (`apps/desktop/src/adapters/`) implementing the full §4.3 `CoreAdapters` contract over Tauri commands: `createContentDbAdapter` (attach/detach/list/query), `createPackInstallerAdapter` (WebView `fetch` streamed through `pack_create_file`/`pack_append_bytes`, Rust-side `hash`/`gunzip`/`rename`/disk checks), `createCryptoAdapter` (WebCrypto `subtle`), `createSecureStorageAdapter` (localStorage placeholder pending the OS Keychain swap), `createAudioAdapter` (HTML5 `Audio` + ambient tracks + sleep timer), plus `createLocalDeviceAdapter`/`createUserDbAdapter` which apply the canonical core DDL gated on `PRAGMA user_version`. To back the two writable device DBs, added the native `device_db.rs` (writable `rusqlite` user/local-device layer: `execute`/`query`/`execute_batch`/`begin`/`commit`/`rollback`) and the shared `sql_json.rs` JSON↔SQLite bridge, and exposed them through 9 new commands (`local_device_*`/`user_data_*`) — `commands.rs`/`main.rs` now register **25** commands and `setup()` opens both `local_device.sqlite` and `user_data.sqlite`. Added `createDesktopAdapters()` + the `bootDesktop()` end-to-end entry. Exercised by `apps/desktop/src-tauri/tests/device_db.rs` (3 cases).
- `1.0.6` | `2026-11-25` | Athena | Implemented the §4.1 desktop native pack file-I/O module (`apps/desktop/src-tauri/src/pack_io.rs`): the file half of the desktop `PackInstallerAdapter` (B4 §4.6 atomic swap) — `resolve_pack_paths`, `gunzip`, `sha256_file`, `file_size_bytes`, `remove_file`, `rename`, `available_disk_space` — exposed to the WebView through matching Tauri commands (`resolve_pack_paths`, `pack_gunzip`, `pack_sha256`, `pack_file_size`, `pack_remove_file`, `pack_rename`, `pack_available_disk_space`). The HTTPS pack transfer is performed by the WebView (`fetch`); Rust owns verification and the atomic on-disk swap.
- `1.0.5` | `2026-11-25` | Athena | Stood up the Tauri v2 shell for `apps/desktop/src-tauri/` (§4.1): added the `tauri`/`serde` dependency tree, `build.rs` (`tauri_build::build()`), `tauri.conf.json` (`$schema …/config/2`), and the shell `main.rs` that manages one `ContentDb` and forwards the §4.3 `ContentDbAdapter` operations (`attach_content_pack`, `detach_content_pack`, `list_attached_packs`, `check_content_pack_integrity`, `query_content_db`) via `generate_handler!`. Updated the §4.1 tree to record `commands.rs` and `lib.rs`; `pack_io.rs` (pack downloader) and the real Vite + React 19 frontend still land with the desktop UI milestone.
- `1.0.4` | `2026-11-25` | Athena | Implemented the Phase-1 headless stores from §4.1 `stores/` (`packages/core/src/stores/`): framework-free `zustand/vanilla` `createReaderStore` (FR-101..103) and `createPackStore` (FR-105), now composed by `initCoreRuntime` as `CoreRuntime.stores` per §4.2 rule 2.
- `1.0.3` | `2026-11-25` | Athena | Added the app-boot seam (`apps/*/src/boot.ts`) to the §4.1 tree: `bootMobileApp` / `bootDesktopApp` compose the core runtime (`initCoreRuntime`) and restore installed packs at startup.
- `1.0.2` | `2026-11-25` | Athena | Recorded `packages/core/src/runtime/` (`initCoreRuntime`) in the monorepo tree; the composition root from §4.2 rule 2 is implemented.
- `1.0.1` | `2026-11-25` | Athena | Added `LocalDeviceAdapter`, `PackInstallPaths`, and `PackInstallerAdapter` to the §4.3 adapter contracts (FR-105 content pack manager).
- `1.0.0` | `2026-11-24` | Athena | Complete monorepo architecture, strict adapter contracts, animation stack, and 48-hour spike checklist.

## Traceability

- Upstream: `A2`, `A3`, `B1`, `B4`, `B8`. Downstream: `D1`, `D3`, `E1`, `E2`, `F1`, `G4`.
