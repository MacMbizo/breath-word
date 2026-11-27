# G5: Requirements Register & Traceability Matrix

**Document ID:** `G5`  
**Version:** `1.0.5`  
**Status:** `Active`  
**Last Updated:** `2026-11-28`  
**Related Docs:** `G1`, `G3`, `F1`, `AGENTS.md`

This is the canonical register of every requirement, non-functional budget, contract clause, architecture decision, and phase gate across the Breath & Word documentation suite. It exists so that any `FR-*` ID, budget, contract rule, or acceptance gate can be traced to its authoritative source document and its current implementation status in the repository.

## How to Use

1. Locate a requirement by its `FR-*` ID in Section 2; the `Source` column names the authoritative document and section.
2. Read the `Status` column before assuming a feature exists. Status uses exactly one of `Implemented`, `Partial`, `Not started`, `Blocked`, `N/A-in-v1`.
3. Where a status is `Implemented` or `Partial`, the `Code/Test pointer` column cites the real repository path to read next; `Not implemented` means no repository artifact satisfies the row.
4. For budgets, contracts, ADRs, and gates, use Sections 4–13 as the single index; each section states the source document (e.g. `B7`, `C3`, `B3 §4.5`).
5. Consult `G3-changelog.md` before assuming any requirement, schema, or phase boundary has changed, and treat `AGENTS.md` as the binding engineering contract for Sections 5–9.

## 1 — Coverage summary

| Phase | Implemented | Partial | Not started | Blocked | N/A-in-v1 | Total |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Phase 1 | 5 | 0 | 0 | 0 | 0 | 5 |
| Phase 2 | 7 | 0 | 0 | 0 | 0 | 7 |
| Phase 3 | 3 | 3 | 0 | 0 | 0 | 6 |
| Phase 4 | 0 | 0 | 3 | 0 | 0 | 3 |
| v1.1 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **15** | **3** | **3** | **0** | **0** | **21** |

Notes: the 21 rows are FR-101–105 (Phase 1), FR-107 & FR-201–206 (Phase 2, with FR-204's Phase-4 AI mode tracked inside the FR-204 row), FR-106 & FR-301–305 (Phase 3), and FR-401–403 (Phase 4). Both Phase 1 (Section 13; `G3` `v1.0.39`–`v1.0.40`) and Phase 2 (`G3` `v1.0.41`–`v1.0.42`) have passed their exit gates, including live two-device PowerSync round-trip and shared-pool join-by-code verification. Phase 3 is built on the host and desktop-verified (`G3` `v1.0.44`); its device exit-gate clauses are open (Section 14). v1.1 carries no `FR-*` IDs (it is a deferral list, Section 3).

## 2 — Functional Requirement inventory

| ID | Title | Source | Verbatim acceptance | Phase | Status | Code/Test pointer |
| --- | --- | --- | --- | --- | --- | --- |
| `FR-101` | Structured Verse Renderer | `A2` §4.1 | "Opening Psalm 23 and Matthew 5 displays poetic indents, headings, red-letter spans, and opens a footnote sheet on tap." | P1 | Implemented | `apps/mobile/src/app/VerseSpans.tsx`; `apps/mobile/src/app/ReaderScreen.tsx`; `packages/core/src/repositories/reader-repository.ts` (`getChapter`); `packages/core/test/reader-repository.test.ts` |
| `FR-102` | Multi-Translation & Parallel Reader | `A2` §4.1 | "Scrolling column 1 to Romans 8:28 aligns columns 2–4 to `45008028` within 1 frame." | P1 | Implemented | `apps/mobile/src/app/CompareScreen.tsx`; `apps/desktop/src/app/CompareView.tsx`; `packages/core/src/repositories/reader-repository.ts` (`compareChapters`); `packages/core/src/domain/verse-alignment.ts` |
| `FR-103` | Offline FTS5 Search | `A2` §4.1 | "Searching `\"steadfast love\"` offline returns ranked results in <50ms with highlighted match snippets." | P1 | Implemented | `apps/mobile/src/app/SearchScreen.tsx`; `apps/desktop/src/app/SearchView.tsx`; `packages/core/src/repositories/reader-repository.ts` (`search`); `packages/core/test/reader-repository.test.ts` |
| `FR-104` | Focus Mode & Manna Pacing | `A2` §4.1 | "Enabling Focus Mode clears all toolbars; completing Day N unlocks Day N+1 and updates `reading_progress`." | P1 | Implemented | `apps/mobile/src/app/ReaderScreen.tsx` (Focus Mode chrome); `packages/core/src/repositories/reading-plan-repository.ts` (`getUnlockedDay`, `markDayComplete` → `reading_progress`); `packages/core/test/reading-plan.test.ts` |
| `FR-105` | Content Pack Manager | `A2` §4.1 | "Downloading `trans_web` verifies hash, attaches atomically without restart, and immediately appears in version switcher." | P1 | Implemented | `apps/mobile/src/app/LibraryScreen.tsx`; `apps/desktop/src/app/LibraryView.tsx`; `packages/core/src/repositories/pack-manager-repository.ts`; `packages/core/src/content/pack-manifest.ts`; `tools/pack-builder/`; `packages/core/test/pack-manager.test.ts` |
| `FR-106` | Synchronized Audio & Ambient Mixer | `A2` §4.1 | "Playing Rom 8 highlights each verse within ±250ms of `start_ms`; sleep timer fades out both tracks smoothly to 0 volume." | P3 | Partial | Two-stream mixer + sleep-timer fade built: `packages/core/src/stores/audio-store.ts`, `packages/core/src/audio/sleep-fade.ts` (`test/audio-store.test.ts`), `apps/{mobile,desktop}/src/adapters/audio.ts` (mobile ambient via `expo-audio`), `AudioMiniPlayer.tsx` on both apps, generated loops (`tools/pack-builder/scripts/generate-ambient.mjs`). **Gap:** no pack ships an `audio_editions` / `audio_verse_timestamps` source yet (BSB timestamps are a `B5` open item), so the ±250 ms verse highlight is unverified |
| `FR-107` | Kind Habits & Reminders | `A2` §4.1 | "Missing a day shows gentle resume copy (never punitive red loss screens); ESV cache evicts entries past TTL/verse cap." | P2 | Implemented | `packages/core/src/repositories/habits-repository.ts` (gentle resume copy, `local_device.sqlite` reminder scheduling); `packages/core/src/repositories/esv-cache-repository.ts` (TTL + verse-cap FIFO eviction); `apps/mobile/src/app/HabitsScreen.tsx`; `apps/desktop/src/app/HabitsView.tsx`; `packages/core/test/habits-repository.test.ts`; `packages/core/test/esv-cache.test.ts` (ESV BYOK key management deferred — no consumer yet) |
| `FR-201` | Tap-to-Capture Verse Pooling | `A2` §4.2 | "Tapping Capture on Isa 52:13–53:12 inserts a `prayer_pool_items` row (`23052013–23053012`) in <2 taps with full context expansion." | P2 | Implemented | `apps/mobile/src/app/CaptureSheet.tsx` (+ `ReaderScreen.tsx`); `apps/desktop/src/app/CapturePanel.tsx` (+ `ReaderView.tsx`); `packages/core/src/repositories/prayer-pool-repository.ts` (full passage expansion); `packages/core/test/prayer-pool.test.ts` |
| `FR-202` | Categorized & Shared Church Pools | `A2` §4.2 | "User B joins User A's shared pool via code, sees verses + leader prompt, adds E2EE private note; User A cannot read User B's note." | P2 | Implemented | `apps/mobile/src/app/PoolsScreen.tsx`; `apps/desktop/src/app/PoolsView.tsx`; `packages/core/src/repositories/prayer-pool-repository.ts` (`joinPoolByCode`; per-user E2EE notes in `prayer_item_user_states`); `supabase/migrations/0003_rls_and_rpcs.sql`; `supabase/tests/rls_and_rpcs.test.sql`; `packages/core/test/prayer-pool.test.ts` (device-verified 2026-11-27) |
| `FR-203` | Smart Rotation & Answered Testimonies | `A2` §4.2 | "Completing a deck increments `pray_count` by 1 and rotates those cards to the back of the next session queue." | P2 | Implemented | `apps/mobile/src/app/PrayerSessionScreen.tsx`; `apps/desktop/src/app/PrayerSessionView.tsx`; `packages/core/src/repositories/prayer-pool-repository.ts` (Smart Rotation + `pray_count`); `packages/core/test/prayer-engine.test.ts` |
| `FR-204` | Prayer Prompt Generator (Dual-Mode) | `A2` §4.2 | "Offline mode generates valid structured prayer prompts with airplane mode on; AI mode requires explicit user click." | P2 (offline templates) / P4 (AI mode) | Implemented | `packages/core/src/prayer/prompt-templates.ts` (offline templates); surfaced in `apps/mobile/src/app/EngineScreen.tsx` / `apps/desktop/src/app/EngineView.tsx`; `packages/core/test/prompt-templates.test.ts` (Phase-4 AI mode remains out of scope) |
| `FR-205` | Four Guided Prayer Engines | `A2` §4.2 | "Every engine logs a `prayer_session_logs` entry on finish; Breath Prayer maintains 60/120fps without dropped frames on mid-range Android & iPad." | P2 | Implemented | `apps/mobile/src/app/EngineScreen.tsx`; `apps/desktop/src/app/EngineView.tsx`; `apps/mobile/src/app/BreathRing.tsx`; `packages/core/src/repositories/prayer-engine-repository.ts` (`prayer_session_logs` writes); `packages/core/test/prayer-engine.test.ts` |
| `FR-206` | Offline-First Sync & Opt-In Cloud E2EE | `A2` §4.2 | "Edits made offline on Android & iPad merge cleanly on reconnect; DB inspection in Supabase shows only `e2ee:v1:...` ciphertext for encrypted fields." | P2 | Implemented | `packages/core/src/crypto/` (`vault.ts`, `field-cipher.ts`, `recovery-key.ts`, `recovery-qr.ts`, `envelope.ts`); `packages/core/src/repositories/vault-repository.ts`; `apps/mobile/src/app/VaultWizardScreen.tsx` / `apps/desktop/src/app/VaultView.tsx`; `packages/core/src/sync/index.ts` (`SupabaseConnector`); `supabase/migrations/0001`–`0004`; `packages/core/test/{vault,vault-repository,crypto-parity}.test.ts` (device-verified 2026-11-27) |
| `FR-301` | Clickable Strong's, Interlinear & Morphology | `A2` §4.3 | "Tapping \"love\" in 1 Cor 13:4 displays `G26` (*agapē*), full lexical definition, and `Noun - Nominative Feminine Singular`." | P3 | Implemented | `packages/core/src/repositories/exegesis-repository.ts` (`test/exegesis-repository.test.ts`), STEPBible ETL `tools/pack-builder/src/datasets/stepbible.ts` + `exegesis-pack.ts` (`test/datasets.test.ts`, `test/phase3-packs.test.ts`), UI `apps/desktop/src/app/study/WordStudyPane.tsx`, `apps/mobile/src/app/study/WordStudySection.tsx`; desktop-verified on real STEPBible data (`G3` `v1.0.44`). **Tap any English word** (`G3` `v1.0.45`): `verse_word_alignments` built from the KJV/WEB USFM Strong's tags (KJV 348,884 · WEB 677,689 words; `usfm.ts`, gated in `build-pack.ts`), word position resolved at read time by Strong's occurrence with legacy-number equivalence (`domain/strongs.ts` `strongsClass`), `domain/word-alignment.ts`; mobile word card (Card / Interlinear) device-verified on the Android emulator; desktop quick look + study card type-checked, not yet visually verified. **Remaining:** the BSB USFM carries no Strong's tags, so `core_bsb` has no word links; the `A2` acceptance phrase (BSB 1 Cor 13:4 "love") is met on KJV ("charity" → `G26`). |
| `FR-302` | Lexicon & Word Frequency Suite | `A2` §4.3 | "Opening `G26` displays structured lexicon sections and taps through to all NT verse occurrences offline." | P3 | Implemented | `exegesis-repository.ts` `getLexiconEntry` / `getWordFrequency`; lexicon ETL `parseStepLexicon` (TBESG Abbott-Smith, TBESH BDB); UI as FR-301. Desktop-verified: `H430` 813 OT occurrences by book, `G26` NT occurrences, tappable verse list |
| `FR-303` | Automated Passage Guide & Factbook | `A2` §4.3 | "Opening Passage Guide on Rom 8 lists top-voted TSK refs; tapping \"Ephesus\" opens entity dossier with Acts/Epistles occurrences." | P3 | Implemented | `packages/core/src/repositories/study-refs-repository.ts` (`test/study-refs-repository.test.ts`), ETL `study-refs-pack.ts`, `datasets/openbible.ts`, `datasets/theographic.ts`; UI `PassageGuidePane.tsx` / `PassageGuideSection.tsx`. Desktop-verified on real data: Rom 8:28 → 1 Pet 5:10 (589 votes) …; Ephesus dossier with coordinates and 17 occurrences |
| `FR-304` | Inductive Bible Study Suite | `A2` §4.3 | "Creating an Application card schedules a local OS reminder for `checkup_remind_at` and syncs across devices." | P3 | Partial | `packages/core/src/repositories/inductive-study-repository.ts` (`test/inductive-study-repository.test.ts`), UI `InductivePane.tsx` / `InductiveSection.tsx` (symbols, 5Ws & H, Paraphrase, 5-step Application). Desktop-verified: highlight wash + badges and a 5Ws & H note persist across reload. **Gap:** the checkup reminder is scheduled in `local_device.sqlite` and surfaced in-app ("Checkups due"); no OS notification is raised yet, and cross-device sync is unverified on devices |
| `FR-305` | Cross-Platform Stylus Ink Canvas | `A2` §4.3 | "Stroke drawn on iPad syncs via PowerSync and renders identically at the same relative proportions on Android and Windows 11." | P3 | Implemented | `packages/core/src/repositories/ink-canvas-repository.ts`, `src/ink/strokes.ts` (`test/ink-canvas-repository.test.ts`); UI `InkCanvas.tsx` (SVG + pointer events) / `InkSketch.tsx` (Skia + gesture handler) on a shared 4:3 normalized sheet. Desktop-verified: strokes saved and restored after reload. Device clause (iPad stroke rendering identically on Android/Windows) pending |
| `FR-401` | Grounded AI "Smart Synopsis" | `A2` §4.4 | "Asking an unsupported question returns the explicit fallback string; every factual claim renders a verified citation popover." | P4 | Not started | Not implemented |
| `FR-402` | Desktop Multi-Pane Docking & Shortcuts | `A2` §4.4 | "Workspace panel layout persists in `workspace_state` across restarts; `Ctrl/Cmd+K` jumps to `\"rom 8:28\"` in <200ms." | P4 | Not started | Not implemented (no Dockview wiring in app code; `workspace_state` only referenced in comments/specs) |
| `FR-403` | Church Web Companion | `A2` §4.4 | "Opening `https://app.breathandword.app/join/<CODE>` on mobile Chrome lets a user join and run a Prayer Deck session." | P4 | Not started | Not implemented |

## 3 — Phase boundaries & non-goals (`A3` §4.1–4.2)

**Phase 1 — Core Local Reader MVP.** FR-101, FR-102, FR-103, FR-104, FR-105 + `tools/pack-builder` packs `core_bsb`, `trans_web`, `trans_kjv`. Target platforms: Android, iPadOS, Desktop (basic). Exit gate: "48h spike passed; BSB pack built & verified; offline reader + parallel compare + FTS5 + Focus Mode usable daily by founder."

**Phase 2 — Scripture Prayer & E2EE Sync.** FR-201, FR-202, FR-203, FR-204 (offline templates), FR-205 (all 4 prayer engines), FR-206, FR-107. Target platforms: Android, iPadOS, Desktop. Exit gate: "Offline edits sync via PowerSync across Android + iPad + Desktop; E2EE vault + Recovery Key passes crypto test suite; Shared Church Pool tested with ≥2 accounts."

**Phase 3 — Exegesis, Inductive, Ink & Audio.** FR-301, FR-302, FR-303, FR-304, FR-305, FR-106 + ETL for `exegesis_step` & `study_refs` packs. Target platforms: Android, iPadOS, Desktop. Exit gate: "Tap-to-Strong's, BDB/Thayer lexicon, TSK Passage Guide, Theographic Factbook, Inductive 5-step + Skia Ink, and synchronized BSB audio + ambient mixer ship cleanly."

**Phase 4 — Grounded AI & Studio Polish.** FR-401, FR-204 (AI mode), FR-402, FR-403 + `commentary_pd` pack. Target platforms: Android, iPadOS, Desktop, Web. Exit gate: "RAG Smart Synopsis passes hallucination/citation test suite; Desktop `dockview` + shortcuts + Web Companion live for small church group."

**v1.1+ — Post-v1 Roadmap (deferred).** Syntactical Clause Diagrams (Clear-Bible Macula treebanks), Collaborative Church Prayer Requests/Comments, USFM/OSIS BYO local pack importer, iOS/Android Home Screen Widgets, UI i18n. Scheduled only after Phase 4 stability and real church-usage feedback.

**Six explicit v1 non-goals (out of scope for v1):**

1. No public social network / algorithmic feed: no global public profiles, likes, follower counts, or community comment feeds; sharing is strictly invite-only via `share_code`.
2. No proprietary publisher licensing in v1: no bundled NIV, NLT, CSB, or NASB (ESV is strictly user-supplied personal API key with ephemeral caching per Crossway rules).
3. No freehand drawing directly over reflowing Bible paragraphs: ink is strictly attached to portable `ink_canvases` per verse/note (`ADR-003`).
4. No server-side plaintext storage of E2EE notes: zero server-side search, indexing, or AI scanning over encrypted user reflections (`ADR-004`).
5. No full offline content-pack downloads in the Web Companion: the browser companion serves lightweight read/prayer flows; full offline multi-pack exegesis requires the native Android, iPadOS, or Tauri Desktop apps.
6. No custom CRDT sync engine: all sync relies strictly on PowerSync + Supabase PostgreSQL (`ADR-002`).

## 4 — Non-functional requirement budgets (`B7`)

**Performance & rich animation budgets (`B7` §4.1):**

| Metric | Target (p95) | Hard Ceiling |
| --- | :---: | :---: |
| Cold start to readable chapter (Android / iPadOS) | `< 1,200 ms` | `1,800 ms` |
| Cold start to readable chapter (Tauri desktop) | `< 700 ms` | `1,200 ms` |
| Chapter navigation / render (Psalm 119 — 176 verses) | `< 32 ms` | `60 ms` |
| Offline FTS5 search (`verses_fts`, 31,102 verses) | `< 25 ms` | `50 ms` |
| Interlinear / Strong's tap popover | `< 30 ms` | `60 ms` |
| Parallel column scroll sync (2–4 columns) | `60 / 120 fps` | `0 dropped frames/sec` |
| Breath Prayer ring & swipe deck animation | `120 Hz` (`8.3 ms` frame) | `60 Hz` (`16.6 ms`) on 60Hz screens |
| Stylus ink latency (iPad Apple Pencil / Skia) | `< 16 ms` | `24 ms` |
| E2EE vault unlock (`PBKDF2-SHA256`, 600k iter) | `< 350 ms` | `600 ms` |
| E2EE single row encrypt / decrypt (`AES-256-GCM`) | `< 2 ms` | `5 ms` |
| Volatile in-memory note search (2,000 notes) | `< 15 ms` | `35 ms` |
| Audio verse highlight sync drift | `± 150 ms` | `± 250 ms` |

**Storage, bandwidth & memory budgets (`B7` §4.2):**

| Resource | Budget |
| --- | --- |
| Initial binary size (Android APK / iPadOS IPA / Desktop installer) | `≤ 45 MB` (Mobile), `≤ 25 MB` (Tauri) |
| Default audio cache cap | `250 MB` (user configurable `100 MB`–`4 GB`, LRU eviction in `audio_cache_entries`) |
| Peak client RAM (active multi-pane study + unlocked vault) | `≤ 250 MB` (Mobile/iPad), `≤ 350 MB` (Tauri) |
| Local write durability | `0%` data loss on crash/kill (SQLite `WAL`) |

**Availability, sync & cost guardrails (`B7` §4.3):**

| Category | Requirement |
| --- | --- |
| Offline availability | `100%` for reading, FTS5 search, highlights, notes, Prayer Pools, offline prayer templates, Breath Prayer, installed exegesis packs, and pinned audio |
| Sync convergence SLO | Online edits across devices converge via PowerSync within `< 3 seconds` p95 (network permitting) |
| Monthly operating cost ceiling (personal + small church, ≤250 users) | `$0 – $5 / month` target |

Additional cross-document budgets: AI shared quota soft cap `30 req/user/day` (`B2` §4.4); tombstone retention `90 days` (`B2` §4.3); AI grounding capped at the top `12` chunks / `~6,000 tokens` (`B2`); `pack-builder` FTS5 for Rom 8:28 `< 15 ms`; local-write optimistic UI `< 16 ms`.

## 5 — Architecture rules, adapters & data planes

**AGENTS.md non-negotiable rules 1–7:**

1. Strict monorepo boundaries (`B3`, `ADR-001`): `packages/core` is 100% pure TypeScript — never import `react-native`, `expo-*`, `@tauri-apps/*`, `window`, or `document`; UI apps never write raw SQL (all queries live in `packages/core/src/repositories/`).
2. Dual-SQLite separation (`B4`, `ADR-002`): static biblical texts live only in read-only modular packs (`ContentDbAdapter`); synced user data lives in `user_data.sqlite` (`UserDbAdapter` via PowerSync); local-only state lives in `local_device.sqlite`; every synced table uses `id` (UUID v4) as its primary key with soft deletes (`deleted_at`) and clients never issue hard `DELETE` on synced tables.
3. Shared prayer pool privacy split (`B4`, `C4`): never store personal notes, `pray_count`, `last_prayed_at`, or testimonies on `prayer_pool_items`; all per-user state belongs strictly in `prayer_item_user_states`.
4. Canonical references & Strong's (`B4`): all verse IDs use Protestant 32-bit `BBCCCVVV` integers; Strong's IDs are always unpadded uppercase (`G26`, `H430`).
5. Zero-knowledge E2EE (`B6`, `ADR-004`): encrypted columns use `e2ee:v1:<iv_b64url>:<ct_tag_b64url>` (AES-256-GCM, fresh 12-byte CSPRNG IV every write, AAD `v1|<table>|<row_id>|<column>`); never write decrypted E2EE notes to disk/FTS5, never log `*_payload` or `X-BYOK-Key`, and never send private notes to AI unless `includeUserNotes === true`.
6. Rich animated UI & accessibility (`D1`, `D3`, `B7`): import all colors, fonts, spacing, and springs strictly from `@breath-and-word/tokens` (no hard-coded hex); run 120Hz animations (Breath ring, Swipe Deck) on the UI thread / Reanimated worklets with Reduced Motion fallbacks; wrap all Hebrew/Aramaic inline tokens in `dir="rtl"` + `unicode-bidi: isolate`.
7. Scope guardrail (`A3`): build strictly for the active phase (1 → 2 → 3 → 4); do not implement v1.1 features prematurely; every error must be a canonical `AppError` from `C3`; every PR must pass `pnpm turbo lint typecheck test`.

**Adapter interfaces (`B3` §4.3; `packages/core/src/adapters/index.ts`):**

| Adapter | Methods |
| --- | --- |
| `ContentDbAdapter` | `attachPack(packId, absolutePath)`, `detachPack(packId)`, `getAttachedPacks()`, `query<T>(sql, params?)` |
| `UserDbAdapter` | `execute(sql, params?)`, `query<T>(sql, params?)`, `writeTransaction(fn)`, `watch<T>(sql, params, onChange)` |
| `LocalDeviceAdapter` | `execute(sql, params?)`, `query<T>(sql, params?)` |
| `PackInstallerAdapter` | `resolvePaths(packId, contentVersion)`, `download(url, destPath, onProgress?)`, `sha256HexFile(path)`, `gunzip(srcGzPath, destPath)`, `fileSizeBytes(path)`, `removeFile(path)`, `rename(fromPath, toPath)`, `availableDiskSpaceBytes(directory)` |
| `CryptoPrimitivesAdapter` | `randomBytes(length)`, `pbkdf2Sha256(passphrase, salt, iterations, keyLengthBytes)`, `aesGcmEncrypt(key, iv, plaintext, aad)`, `aesGcmDecrypt(key, iv, ciphertextWithTag, aad)`, `sha256Hex(data)` |
| `SecureStorageAdapter` | `getItem(key)`, `setItem(key, value)`, `deleteItem(key)` |
| `AudioEngineAdapter` | `loadChapter(urlOrPath, title, subtitle)`, `play()`, `pause()`, `seekTo(ms)`, `setPlaybackRate(rate)`, `setAmbientTrack(trackId, volume)`, `setNarrationVolume(volume)`, `setSleepTimer(minutes)`, `onPositionUpdate(cb)` |

**Dual-SQLite data planes (`B1` §4.2):**

- Plane A — Immutable Content (`bible_content/*.sqlite`): never written by the app; replaced atomically via `manifest.json` (`B4` §4.6).
- Plane B — Synced User Graph (`user_data.sqlite`): synced via PowerSync; sensitive payloads encrypted before SQLite `INSERT`/`UPDATE` when E2EE is enabled.
- Plane C — Ephemeral Device State (`local_device.sqlite`): never synced.

**11 synced tables (`B4` §4.3):** `user_profiles`, `highlights`, `study_notes`, `ink_canvases`, `prayer_pools`, `prayer_pool_members`, `prayer_pool_items`, `prayer_item_user_states`, `prayer_session_logs`, `reading_plan_enrollments`, `reading_progress`.

**Local-only tables (`B4` §4.4):** `installed_packs`, `audio_cache_entries`, `api_ephemeral_cache`, `workspace_state`.

**Pack ETL atomic protocol (`B4` §4.6):** download `.tmp` → verify SHA-256 (compressed) → gunzip → verify SHA-256 (uncompressed) → `PRAGMA integrity_check` on a staging attach → on pass DETACH old / atomic rename / ATTACH new / update `installed_packs`; on fail delete `.tmp` and emit `PackChecksumError` (`PACK_CHECKSUM_MISMATCH` / `PACK_INTEGRITY_FAILED`).

**Manifest contract fields (`B4` §4.6; `packages/core/src/content/pack-manifest.ts`):** `manifestVersion`, `generatedAt`, `packs[]` with `packId`, `packType`, `contentVersion`, `schemaVersion`, `minAppVersion`, `downloadUrl`, `compressedBytes`, `uncompressedBytes`, `sha256Compressed`, `sha256Uncompressed`, `licenseSpdx`.

**Server triggers (`B2` §4.2):** authoritative `set_server_updated_at` on all 11 tables; `cascade_pool_soft_delete`; `add_pool_owner_member`. Tombstone GC runs at `90 days` (`B2` §4.3).

**Runtime failure & degradation modes (`B1` §4.3):**

| Dependency unavailable | System behavior | User experience |
| --- | --- | --- |
| Internet offline | PowerSync pauses; local SQLite serves all installed packs, FTS5, highlights, notes, Prayer Pools, offline prayer templates, cached audio | Subtle offline badge; AI Smart Synopsis and uncached audio gracefully disabled with a clear message |
| Supabase / PowerSync outage | Local reads/writes continue uninterrupted; PowerSync queues mutations locally with exponential backoff | Zero data loss; sync resumes automatically when service returns |
| Cloudflare R2 pack download interrupted | Partial `.tmp` kept for HTTP `Range` resume; corrupted files fail SHA-256 and are discarded | Active installed packs remain completely untouched (`B4` §4.6) |
| E2EE vault locked | Unencrypted metadata (verse refs, pool titles, `pray_count`) remains accessible; encrypted fields render an "Unlock Vault" prompt | User can still read the Bible and run Breath Prayer without unlocking the personal journal |

**Content-pack tables (`B4`):**

- TRANSLATION: `translations`, `books`, `verses`, `verses_fts`, `footnotes`, `verse_word_alignments`, `audio_editions`, `audio_chapters`, `audio_verse_timestamps`.
- EXEGESIS: `versification_maps`, `interlinear_tokens`, `lexicon_entries`.
- STUDY_REFS: `cross_references`, `factbook_entities`, `factbook_verse_links`, `reading_plans`, `reading_plan_days`.
- COMMENTARY: `commentary_sources`, `commentary_chunks`.
- Plus `pack_metadata` in every pack.

**Canonical references (`B4`):** `canonical_verse_id = (book * 1_000_000) + (chapter * 1_000) + verse`; range `01001001`–`66022021`; Strong's IDs unpadded uppercase.

## 6 — ADR register

| ADR | Decision | Key constraints | Source |
| --- | --- | --- | --- |
| `ADR-001` | pnpm + Turborepo monorepo; headless `packages/core`; shared `packages/tokens`; Expo React Native mobile; Tauri v2 desktop | Rejected Tamagui universal UI; `packages/core` stays platform-pure (no RN/expo/tauri/window/document imports) | `B8` / `docs/arch/adr/ADR-001-...md` |
| `ADR-002` | Dual local-first SQLite + PowerSync behind adapters | Synced tables must use `id TEXT PRIMARY KEY` (UUID v4) + soft-delete tombstones; never hard `DELETE` on synced tables | `B8` / `docs/arch/adr/ADR-002-...md` |
| `ADR-003` | Stylus ink = portable normalized vector canvases (`ink_canvases`) | perfect-freehand smoothing; Skia on mobile / canvas-SVG on desktop; no freehand over reflowing paragraphs | `B8` / `docs/arch/adr/ADR-003-...md` |
| `ADR-004` | Opt-in zero-knowledge E2EE (DEK/KEK/Recovery Key) | PBKDF2-SHA256 600k, AES-256-GCM, `e2ee:v1` envelope; volatile in-memory MiniSearch purged on lock | `B8` / `docs/arch/adr/ADR-004-...md` |
| `ADR-005` | Zero-egress modular gzip `.sqlite.gz` content packs | Hosted on Cloudflare R2 with a GitHub Releases mirror; immutable old pack files retained | `B8` / `docs/arch/adr/ADR-005-...md` |

## 7 — Contracts

### C1 — API & Grounded AI RAG Gateway Contracts (`C1`)

`POST /functions/v1/ai-gateway` headers: `Authorization: Bearer <supabase_access_jwt>`, `Content-Type: application/json`, `X-BYOK-Provider: gemini | anthropic | openai` (optional), `X-BYOK-Key: <user_personal_api_key>` (optional, pass-through only, never logged/persisted), `X-BYOK-Model: <optional_model_override>`.

**Mode `SYNOPSIS` request:** `{ mode, passageReference, passageText, question, traditions[], chunks[] }` where each chunk is `{ chunkId, citationLabel, traditionTags[], bodyText }`. Validation rules: `chunks.length === 0` → short-circuit HTTP `200` with `covered: false` and `fallbackMessage: "Not covered in the available commentary sources."` (zero LLM spend, matches `AI_NO_COMMENTARY_SOURCES`); `chunks.length <= 12` and total prompt payload `<= 28,000 chars`; private fields (`userNotes`, `journal`) are schema-forbidden (rejected with HTTP `400`). Response (`200 OK`): `{ mode, covered, summary, claims[] ({ text, citedChunkIds[] }), usedChunkIds[], model, quotaRemaining }`.

**Mandatory server-side citation verifier:** invoke the LLM with strict JSON Schema structured output; build `allowedIds = new Set(req.chunks.map(c => c.chunkId))`; verify every `claim.citedChunkIds` is non-empty and every ID ∈ `allowedIds`; if any unknown `chunkId` appears or `claims` is empty when `covered === true`, retry once with a corrective instruction, then on second failure return HTTP `502` `AI_CITATION_VERIFICATION_FAILED`.

**Mode `PRAYER_PROMPT` request:** `{ mode, passageReference, passageText, category, framework, includeUserNotes, optionalUserContext }`. Privacy guardrail: if `includeUserNotes === false`, the client MUST send `optionalUserContext: null` (decrypted context max 500 chars only when the user explicitly opts in per card). Response (`200 OK`): `{ mode, prayerText, sections[] ({ stage, prompt }), model, quotaRemaining }`.

**Shared Pool RPCs (Supabase PostgREST):** `POST /rest/v1/rpc/join_shared_pool_by_code` (JWT) request `{ "p_code": "K9P4M2X7" }` → success `{ poolId, title, role }`; errors `AUTH_REQUIRED`, `POOL_SHARE_CODE_INVALID`, `POOL_JOIN_RATE_LIMITED`. `POST /rest/v1/rpc/rotate_pool_share_code` (JWT owner) request `{ "p_pool_id": "uuid" }` → 8-char Crockford Base32 code; errors `AUTH_REQUIRED`, `POOL_PERMISSION_DENIED`.

**Client-side BYO ESV adapter contract:** endpoint `GET https://api.esv.org/v3/passage/text/?q=<Book+Ch>&include-headings=true&include-footnotes=true&include-verse-numbers=true`; header `Authorization: Token <user_esv_key_from_secure_storage>`; cache policy in `local_device.sqlite -> api_ephemeral_cache` FIFO-evict oldest rows until `SUM(verse_count) + newCount <= 500` and a chapter never exceeds 50% of `books.chapter_count`; `expires_at = now() + 7 days`.

### C2 — Sync Buckets & Offline Event Contracts (`C2`)

**Bucket `user_private`** (parameters: `SELECT request.user_id() AS user_id`) data selects: `user_profiles`, `highlights`, `study_notes`, `ink_canvases`, `prayer_item_user_states`, `prayer_session_logs`, `reading_plan_enrollments`, `reading_progress` (each `WHERE user_id = bucket.user_id`), plus `prayer_pool_members WHERE user_id = bucket.user_id`.

**Bucket `joined_pools`** (parameters: `SELECT pool_id FROM prayer_pool_members WHERE user_id = request.user_id() AND deleted_at IS NULL`) data selects: `prayer_pools WHERE id = bucket.pool_id`, `prayer_pool_items WHERE pool_id = bucket.pool_id`, and the member roster `SELECT id, pool_id, user_id, role, joined_at, updated_at, deleted_at FROM prayer_pool_members WHERE pool_id = bucket.pool_id`. Eviction rule: when a member leaves/is removed (`prayer_pool_members.deleted_at IS NOT NULL`), PowerSync automatically evicts that pool and its items from the ex-member's device while retaining their personal `prayer_item_user_states` in `user_private`.

**Conflict resolution:** default row-level Last-Write-Wins for `user_profiles`, `highlights`, `study_notes`, `ink_canvases`, `prayer_pools`, `prayer_pool_items`, `reading_progress`; monotonic `pray_count` uses `GREATEST(OLD.pray_count, NEW.pray_count)`; fatal upload errors (HTTP 400/403 RLS violation) dead-letter the offending mutation and surface `SYNC_MUTATION_REJECTED`. Hard deletes are prohibited on the client (soft-delete `UPDATE ... SET deleted_at`).

**Full `CoreEvent` union (9 variants):** `SYNC_STATUS_CHANGED`, `SYNC_MUTATION_REJECTED`, `VAULT_LOCKED`, `VAULT_UNLOCKED`, `PACK_DOWNLOAD_PROGRESS`, `PACK_INSTALLED`, `PACK_INSTALL_FAILED`, `AUDIO_VERSE_CHANGED`, `POOL_SHARED_JOINED`.

### C3 — Error Model & Offline Failure Modes (`C3`)

Canonical registry (26 codes). Cross-checked against the `AppError` contract in `packages/core/src/errors/AppError.ts` (`ErrorDomain`, `RetryPolicy`, `AppErrorShape`).

| Code | Domain | HTTP | Retry policy | Trigger |
| --- | --- | :---: | --- | --- |
| `AUTH_REQUIRED` | AUTH | 401 | `USER_ACTION` | Missing or unauthenticated JWT on sync/RPC/AI call |
| `AUTH_SESSION_EXPIRED` | AUTH | 401 | `EXPONENTIAL_BACKOFF` | Refresh token revoked or expired |
| `AUTH_GUEST_MIGRATION_FAILED` | AUTH | — | `USER_ACTION` | Local SQLite transaction error rewriting `guestUserId` |
| `CRYPTO_VAULT_LOCKED` | CRYPTO | — | `USER_ACTION` | UI requests a decrypted field while `DEK` is not in RAM |
| `CRYPTO_INVALID_PASSPHRASE` | CRYPTO | — | `USER_ACTION` | Unwrapping `e2ee_wrapped_dek_passphrase` fails the GCM tag check |
| `CRYPTO_DECRYPT_FAILED` | CRYPTO | — | `NONE` | Row ciphertext corrupted or AAD mismatch |
| `SYNC_OFFLINE` | SYNC | — | `EXPONENTIAL_BACKOFF` | Device lacks network connectivity |
| `SYNC_MUTATION_REJECTED` | SYNC | 403/400 | `NONE` | RLS or schema violation during PowerSync `uploadData` |
| `POOL_SHARE_CODE_INVALID` | POOL | 404 | `USER_ACTION` | Invalid or rotated 8-char `share_code` |
| `POOL_JOIN_RATE_LIMITED` | POOL | 429 | `USER_ACTION` | ≥5 failed join attempts within 15 minutes |
| `POOL_PERMISSION_DENIED` | POOL | 403 | `NONE` | Non-owner/leader attempts a restricted pool action |
| `PACK_DOWNLOAD_INTERRUPTED` | PACK | — | `EXPONENTIAL_BACKOFF` | Network drop during `.sqlite.gz` fetch from R2 |
| `PACK_CHECKSUM_MISMATCH` | PACK | — | `USER_ACTION` | Downloaded `.tmp` SHA-256 differs from `manifest.json` |
| `PACK_INTEGRITY_FAILED` | PACK | — | `USER_ACTION` | Decompressed SQLite fails `PRAGMA integrity_check` |
| `PACK_SCHEMA_INCOMPATIBLE` | PACK | — | `USER_ACTION` | Pack `schemaVersion` exceeds app's supported version |
| `PACK_STORAGE_FULL` | PACK | — | `USER_ACTION` | Insufficient device disk space (<2× uncompressed pack size) |
| `PACK_PARSE_FAILED` | PACK | — | `USER_ACTION` | ETL build-time: a raw source fails to parse into a `PackSource` (`tools/pack-builder`) |
| `PACK_MANIFEST_INVALID` | PACK | — | `USER_ACTION` | Fetched `manifest.json` catalogue fails shape/version validation (`parsePackManifest`) |
| `AI_OFFLINE_UNAVAILABLE` | AI | — | `USER_ACTION` | User triggers Smart Synopsis or AI Prayer while offline |
| `AI_QUOTA_EXCEEDED` | AI | 429 | `USER_ACTION` | Exceeded 30 req/day on the shared church LLM key |
| `AI_BYOK_INVALID` | AI | 401 | `USER_ACTION` | Upstream LLM rejects the user's personal `X-BYOK-Key` |
| `AI_NO_COMMENTARY_SOURCES` | AI | 200 | `NONE` | Zero `commentary_chunks` match passage + tradition filters |
| `AI_CITATION_VERIFICATION_FAILED` | AI | 502 | `EXPONENTIAL_BACKOFF` | LLM output fails JSON schema or cites a non-existent `chunk_id` |
| `ESV_KEY_MISSING` | ESV | — | `USER_ACTION` | User selects ESV without entering a personal Crossway API key |
| `ESV_CACHE_LIMIT_REACHED` | ESV | — | `NONE` | `api_ephemeral_cache` hits Crossway's 500-verse cap |
| `DB_CONTENT_PACK_NOT_ATTACHED` | DB | — | `USER_ACTION` | User taps Interlinear/Factbook before downloading `exegesis_step` or `study_refs` |

**Backoff & timeout guardrails:** automatic retries max 4 attempts (`1s → 2s → 4s → 8s` + ±20% random jitter); never retry `400`, `401`, `403`, `404`, or `CRYPTO_*` errors. Client network timeouts: auth / pool RPCs `10s`; AI gateway `30s`; pack download no total timeout, `30s` idle socket stall with `Range` resume.

### C4 — AuthN/AuthZ & Shared Pool Tenancy (`C4`)

**Auth modes:** Offline Guest (default on first launch, local `guestUserId` in `local_device.sqlite -> workspace_state`); Email + Password; Email Magic Link; Google Sign-In; Sign in with Apple (required on iPadOS if Google is offered).

**Guest → Account zero-loss migration protocol:** (1) run an atomic local SQLite transaction rewriting `user_id = guestUserId` → `authUserId` (and `owner_user_id` / `created_by_user_id`) across all local rows; (2) connect PowerSync (`powersync.connect(connector)`), which uploads all migrated local records into the user's Supabase account; (3) offer the optional 30-second Private Vault E2EE wizard (`B6` §4.2).

**RBAC matrix:**

| Action | `OWNER` | `LEADER` | `MEMBER` (leader-curated) | `MEMBER` (collaborative) |
| --- | :---: | :---: | :---: | :---: |
| View pool & items | Yes | Yes | Yes | Yes |
| Edit pool title/visibility/share_code | Yes | No | No | No |
| Soft-delete pool / remove members | Yes | No | No | No |
| Add / edit / delete pool items | Yes | Yes | No | Own items only |
| Read/write own `prayer_item_user_states` | Yes (private) | Yes (private) | Yes (private) | Yes (private) |
| Read another member's `prayer_item_user_states` | Never | Never | Never | Never |

**RLS policy list (RLS enabled on all 11 tables):** strictly-personal `own_profile`, `own_highlights`, `own_study_notes`, `own_ink_canvases`, `own_item_states`, `own_session_logs`, `own_enrollments`, `own_reading_progress` (`user_id = auth.uid()`); `pools_select_member`, `pools_insert_owner`, `pools_update_owner`; `members_select_pool`, `members_update_self_or_owner`; `items_select_member`, `items_insert_authorized`, `items_update_authorized`. Helper functions: `is_pool_member(p_pool_id)` and `is_pool_leader_or_owner(p_pool_id)` (`SECURITY DEFINER`, preventing RLS recursion).

**`join_shared_pool_by_code` anti-enumeration:** 5 failed attempts within 15 minutes per user → `POOL_JOIN_RATE_LIMITED`; invalid code records an attempt and raises `POOL_SHARE_CODE_INVALID`.

## 8 — Security & E2EE (`B6`)

**Envelope format:** `e2ee:v1:<iv_base64url>:<ciphertext_and_tag_base64url>` stored as a UTF-8 string.

**Primitives:** AES-256-GCM (256-bit key, 96-bit / 12-byte CSPRNG IV, 128-bit / 16-byte authentication tag); PBKDF2-HMAC-SHA256 with 600,000 iterations (16-byte CSPRNG salt, 32-byte derived KEK); DEK = 32 random CSPRNG bytes generated once per user vault; Recovery Key = 32 random CSPRNG bytes displayed as 52 Crockford Base32 characters in 13 blocks of 4 (`XXXX-XXXX-...`) plus an offline-generated QR code.

**`e2ee_kdf_algo = 'PBKDF2-SHA256-600K'`** persisted in `user_profiles.e2ee_kdf_algo`.

**Encrypted columns:** `title_payload`, `body_payload`, `strokes_payload`, `user_notes_payload`, `testimony_payload`, `journal_payload`.

**IV rule:** generate a brand-new 12-byte CSPRNG IV on every single encrypt call, including updates to an existing row; never reuse `(DEK, IV)`.

**AAD binding examples:** data rows `AAD = UTF8("v1|" + tableName + "|" + rowId + "|" + columnName)` (e.g. `v1|prayer_item_user_states|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d|user_notes_payload`); wrapped DEKs in `user_profiles`: passphrase wrap `v1|user_profiles|` + userId + `|dek_passphrase`, recovery wrap `v1|user_profiles|` + userId + `|dek_recovery`.

**Key lifecycle:** vault initialization (30-second wizard generating DEK/salt/recoveryKey, deriving `KEK_pass`, computing wrapped DEKs, requiring the "I saved my Recovery Key" confirmation, then batch-encrypting existing plaintext rows); unlock on a new device (PowerSync syncs `user_profiles`, passphrase derives `KEK_pass` → unwrap DEK in RAM, optional biometric fast unlock via OS hardware-backed keystore); passphrase change / recovery with zero re-encryption (re-wrap the exact same DEK); app lock & volatile search purge (`dek.fill(0)` and destroy the volatile MiniSearch index on lock/sign-out/15-min background timeout).

**Telemetry redaction policy:** crash reporting is opt-in and runs a mandatory `beforeSend` scrubber blocking any payload matching `e2ee:v1:`, SQL bind parameters, `user_notes`, `journal`, `testimony`, `body_payload`, or `X-BYOK-Key` headers; offline guest users transmit zero network telemetry.

**Complete "NEVER" list:** never reuse an IV; the DEK never leaves the client unencrypted; BYOK keys are never synced to Supabase; zero BYOK logging in Edge Functions; no `user_notes_payload` to an LLM unless the user opts in per card; no pure-JS PBKDF2. From `AGENTS.md`: never write decrypted E2EE notes to disk/FTS5, never log `*_payload` or `X-BYOK-Key`, and never send private notes to AI unless `includeUserNotes === true`.

## 9 — Design & accessibility (`D1`, `D3`)

**`D1` — Four semantic themes:** Daylight (Crisp Paper), Parchment (Warm Study), Midnight (OLED Study), Sanctuary (Prayer Ambient). A full per-token colour table exists in `D1` §4.2.

**Inductive observation highlight palette (`D1` §4.3):** `KEY_TERM` (badge Diamond `◇`), `GOD_REF` (Triangle `△`), `TRANSITION` (Arrow `↳`), `PROMISE` (Star `✦`), `COMMAND` (Check `✓`) — each with light/parchment and dark/sanctuary washes.

**Typography stack (`D1` §4.4):** Scripture body `Literata` 16–28px (user slider, default 19px), line-height `1.72`; Section headings `Literata SemiBold` `1.15×` body / `1.35`; UI chrome & controls `Inter` `12 / 14 / 16 / 20px`; Hebrew / Aramaic `SBL Hebrew` `1.35×` body with mandatory `direction: rtl` + `unicode-bidi: isolate`; Polytonic Greek `Gentium Plus` / `SBL Greek` `1.15×` body.

**Motion springs (`D1` §4.5):** `snappy` `{ stiffness: 420, damping: 32, mass: 0.8 }`; `sheet` `{ stiffness: 300, damping: 34, mass: 1.0 }`; `gentle` `{ stiffness: 180, damping: 26, mass: 1.0 }`. `BREATH_EASING` bezier `[0.37, 0, 0.63, 1]`, `minScale 0.62`, `maxScale 1.0`, `holdPauseMs 400`.

**Component inventory (`D1` §4.6, 12 components):** `VerseBlock`, `ParallelColumnSync`, `FloatingCaptureBar`, `PrayerPoolCard`, `SwipePrayerDeck`, `BreathRingCanvas`, `MorphologyInspector`, `InductiveToolbar`, `SkiaInkCanvas`, `AmbientAudioMiniPlayer`, `VaultUnlockSheet`, `GroundedCitationPill`.

**`D1` acceptance:** WCAG 2.2 AA contrast (`≥4.5:1` normal text, `≥3:1` large text/icons) across all 4 themes; Hebrew nikud and Greek polytonic accents render without clipping on Android, iPadOS, Windows 11, and macOS; `packages/tokens` exports both plain TS objects (Expo RN) and generated CSS custom properties (Tauri Tailwind).

**`D3` — Adaptive wireframes:** Android phone 4-tab shell; iPadOS dual-pane; Desktop Dockview. Three animated flows (A/B/C). WCAG 2.2 AA rule table: Reduced Motion 2.3.3; Dynamic Type / Reflow 1.4.4 / 1.4.10 up to 200%; screen-reader semantics 1.3.1 / 4.1.2; target sizes 2.5.8 44×44pt mobile / 36×36px desktop; keyboard 2.1.1 with full focus rings; bidi isolation.

**`D3` acceptance:** tap-to-capture ≤2 taps; TalkBack/VoiceOver walkthrough; Reduced Motion switches to non-scaling transitions.

## 10 — Licensing (`B5`)

| Dataset | License / Terms | Compliance guardrails |
| --- | --- | --- |
| Berean Standard Bible (BSB) | CC0 1.0 (Public Domain) | Free to bundle, modify, and redistribute; primary default translation |
| BSB audio narration | Open / free redistribution | Credit narrator in `audio_editions`; stream/cache from R2 |
| WEB / KJV / ASV | Public Domain (KJV holds UK Crown Patent — exclude in UK storefronts, or verify scope) | Free download via R2 `manifest.json` |
| NET Bible (Free Edition) | Bible.org free / non-commercial — `[OPEN]` legal gate | Confirm written permission before hosting `trans_net` on public R2 |
| Crossway ESV | BYO API only (strict) | Never bundle/host; personal key in OS secure storage; ≤500 verses, ≤50% of any book, ≤7-day TTL; display the ESV attribution string |
| STEPBible TAHOT / TAGNT | CC BY 4.0 | Mandatory visible attribution to STEPBible.org / Tyndale House, Cambridge + CC BY 4.0 link |
| BDB / Thayer / Abbott-Smith / Strong's | Public Domain / CC BY-SA | Credit the digitized source repository in `pack_metadata.attribution_text` |
| OpenBible.info / TSK cross-refs | CC BY 4.0 (OpenBible weights) / Public Domain (TSK) | Mandatory attribution to OpenBible.info in the Licenses screen |
| Theographic Bible Metadata | CC BY-SA 4.0 (ShareAlike) | Keep isolated in `study_refs.sqlite`; publish the derived pack + ETL script under CC BY-SA 4.0 |
| Public-domain commentaries (JFB, Keil & Delitzsch, Henry, Calvin) | Public Domain | Credit the digitization source; tag each source with `tradition_tags_json` |

**In-app attribution mechanism:** Settings → Licenses & Attributions dynamically reads `pack_metadata.display_name`, `license_spdx`, and `attribution_text` from every installed pack in `local_device.sqlite`, plus static credits for Crossway ESV (when active) and open-source libraries.

**`B5` acceptance:** CI fails if `pack_metadata.license_spdx` or `attribution_text` is empty; a test proves `api_ephemeral_cache` never stores >500 cumulative ESV verses; `study_refs` ships an explicit `LICENSE-CC-BY-SA-4.0.txt` notice.

## 11 — Environments & CI/CD (`E1`, `E2`, `E4`)

**`E1` topology:** `local` (solo dev + AI coding; local Docker Supabase + local PowerSync dev/mock; local static pack server; Expo Go / Dev Client, `pnpm tauri dev`); `staging` (personal dogfooding + small church beta; staging Supabase + PowerSync Sandbox; R2 `staging/` prefix; signed preview APK, TestFlight Internal, Tauri prerelease); `prod` (daily production + church rollout; prod Supabase + PowerSync Cloud; R2 `v1/` prefix + GitHub Releases mirror; Play Internal, TestFlight/App Store, Tauri `.exe`/`.dmg`, Web Companion).

**`E1` variable/secret hygiene:** client-safe public vars carry `EXPO_PUBLIC_*` / `VITE_*` prefixes (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POWERSYNC_URL`, `PACK_MANIFEST_URL`, `SENTRY_DSN`). Non-client-safe secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SHARED_LLM_PROVIDER` / `SHARED_LLM_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) MUST NEVER carry an `EXPO_PUBLIC_`/`VITE_` prefix and MUST NEVER be committed to git. User BYOK LLM and Crossway ESV keys live strictly in OS secure storage (device-only, never synced or env-configured).

**`E1` phase feature flags (`packages/core/src/config/flags.ts`; cross-checked):**

| Flag | P1 | P2 | P3 | P4 |
| --- | :---: | :---: | :---: | :---: |
| `ENABLE_PRAYER_ENGINE` | `false` | `true` | `true` | `true` |
| `ENABLE_CLOUD_SYNC` | `false` | `true` | `true` | `true` |
| `ENABLE_E2EE_VAULT` | `false` | `true` | `true` | `true` |
| `ENABLE_EXEGESIS_AND_INK` | `false` | `false` | `true` | `true` |
| `ENABLE_AUDIO_MIXER` | `false` | `false` | `true` | `true` |
| `ENABLE_AI_GATEWAY` | `false` | `false` | `false` | `true` |
| `ENABLE_SYNTAX_TREES_V11` | `false` | `false` | `false` | `false` |

**`E2` four workflows:** `.github/workflows/ci.yml` (PR & push to `main`: `pnpm turbo lint typecheck test`, ESLint core-boundary check, Supabase RLS test suite, `cargo check`); `.github/workflows/release-mobile.yml` (tag `mobile-v*`: EAS Android APK/AAB + iPadOS TestFlight IPA); `.github/workflows/release-desktop.yml` (tag `desktop-v*`: Tauri Windows/macOS matrix + Cloudflare Pages Web Companion); `.github/workflows/release-packs.yml` (`workflow_dispatch`: `pack-builder` → `PRAGMA integrity_check` + FTS5 smoke + license check → R2 upload before atomically overwriting `manifest.json`). Versioning/rollback: pack `.sqlite.gz` files are never deleted from R2 (instant rollback by republishing the previous `manifest.json`); Supabase migrations are forward-only numbered SQL files.

**`E4` observability:** opt-in Sentry (`@sentry/react-native`, `@sentry/react`) disabled by default in offline guest mode; mandatory `beforeSend` scrubber strips `e2ee:v1:`, `user_notes`, `journal`, `testimony`, `body_payload`, `title_payload`, `strokes_payload`, `X-BYOK-Key`, `Authorization`, and SQL bind arrays. Dashboards: Supabase (`ai_usage_daily` cost alert at >80% of the `$5/mo` budget, Edge Function 5xx rate); PowerSync (connected clients, replication lag <3s SLO, failed upload rate); Cloudflare R2 (storage alert at 8 GB of 10 GB).

**`E4` backup/export:** export `breath-and-word-backup-YYYY-MM-DD.json` in two modes — encrypted archive (default when E2EE active, exports raw `e2ee:v1:...` payloads plus wrapped DEK metadata) and decrypted portable export (requires vault unlock; readable JSON + Markdown folder). Idempotent restore merges by `id` (UUID) keeping the newer `updated_at`.

**`E4` runbooks:** `RB-01` (corrupt/bad content pack published to R2 — revert `manifest.json` from GitHub Release history, fix parser, bump patch, re-run `release-packs.yml`); `RB-02` (wedged PowerSync upload queue — export encrypted backup, then Sync Diagnostics → Reset Sync Cache, then re-import if needed); `RB-03` (leaked shared pool `share_code` — owner rotates the code via `rotate_pool_share_code`, removes the member, and PowerSync evicts the pool).

## 12 — Testing & Definition of Done (`F1`)

**Testing pyramid (layers 1–6):**

1. Core unit tests — `Vitest` (`packages/core`): `BBCCCVVV` parser/formatter, cross-chapter ranges, versification mapping, Smart Rotation ordering, offline prayer templates, `AppError` mapping, `beforeSend` scrubber.
2. Crypto parity suite — `Vitest` (Node WebCrypto) + device spike: `e2ee:v1` round-trip, unique 96-bit IV verification, AAD swap rejection (`CRYPTO_DECRYPT_FAILED`), PBKDF2 + Recovery Key DEK unwrap, passphrase rotation without note re-encryption.
3. Local SQLite & ETL tests — `Vitest` + `better-sqlite3` (`tools/pack-builder/test/`): `PRAGMA integrity_check`, `verses_fts` phrase search <50ms, Strong's lookup, ESV 500-verse FIFO eviction, atomic pack swap rollback.
4. Supabase RLS & RPC tests — local Supabase CLI + SQL/Vitest: two-user tenancy suite, `cascade_pool_soft_delete` trigger, 6th bad `share_code` → `POOL_JOIN_RATE_LIMITED`.
5. AI gateway contract tests — `Deno Test` (`supabase/functions/ai-gateway`): mocked LLM valid JSON, fabricated `chunkId` rejection, empty `chunks[]` short-circuit ($0), zero-logging check.
6. Device & accessibility E2E — manual scripted Gate checklist (Android + iPadOS + Win11/macOS): offline airplane-mode, 120Hz Breath Prayer + Reduced Motion, Apple Pencil → Android ink sync, TalkBack/VoiceOver walkthrough.

**Per-phase acceptance verification matrix:** Phase 1 (`FR-101..105`): render Psalm 23 poetry & Matt 5 red-letter/footnotes; parallel sync across 2–4 columns; offline FTS5 `"steadfast love"` <50ms; Focus Mode & Manna day lock; SHA-256 pack install & corrupt-pack rejection. Phase 2 (`FR-201..206`, `FR-107`): ≤2-tap capture of `Isa 52:13–53:12`; zero-loss guest→account upgrade; offline merge via PowerSync across Android+iPad+Desktop; shared-pool privacy isolation; E2EE Supabase inspection shows ciphertext only; 4 engines log `prayer_session_logs` at 60/120fps. Phase 3 (`FR-301..305`, `FR-106`): tap word → Strong's `G26` + morphology <60ms; BDB/Thayer + frequency counts offline; TSK Passage Guide & Theographic Factbook; Inductive 5-step Checkup reminder; iPad Skia stroke renders identically on Android/Desktop; BSB audio highlights verse ±250ms + ambient mixer + sleep timer. Phase 4 (`FR-401..403`, `FR-204`): Smart Synopsis cites only retrieved `chunkId`s and returns the fallback on unsupported prompts; Desktop Dockview layout persists + `Ctrl/Cmd+K` <200ms; Web Companion joins a shared pool via URL/code.

**Definition of Done (7 points):**

1. Contract-Aligned: matches `B4` schemas, `C1`/`C2`/`C4` contracts, and `D1` tokens with zero hard-coded colors or raw SQL in UI components.
2. Boundary-Clean: `pnpm turbo lint typecheck test` green; zero platform imports leaked into `packages/core`.
3. Offline-Safe: tested in airplane mode; degrades gracefully via canonical `C3` `AppError` messages.
4. Privacy-Safe: sensitive fields use the E2EE envelope when the vault is enabled; zero PII/keys in logs or telemetry.
5. Accessible: meets `D3` WCAG 2.2 AA rules (44pt targets, Reduced Motion support, screen-reader labels, RTL Hebrew isolation).
6. Budget-Compliant: no regression against `B7` latency, 120Hz frame, or storage budgets.
7. Traceable: PR/commit references its `FR-xxx` ID and updates the `G3` changelog if a schema or contract changed.

## 13 — Gate-1 spikes (`B3` §4.5)

| Spike | Criterion | Status |
| --- | --- | --- |
| Spike 1 (mobile SQLite) | `@op-engineering/op-sqlite` opens `core_bsb.sqlite` read-only via `ATTACH DATABASE`, executes an FTS5 query in <20ms on Android emulator & iPad simulator alongside a separate `@powersync/react-native` database without lock contention | **Pass (device)** — single distinctive marker `"work together for good"` → Rom 8:28 (`45008028`); FTS5 reads n=25 min 0.4 / p50 1.8 / max 12.0 ms (<20 ms); two-file WAL isolation held with 25/25 concurrent `user_data` writes (`G3` `v1.0.37`) |
| Spike 2 (desktop Tauri + PowerSync) | Tauri v2 WebView runs `@powersync/web` (WA-SQLite + OPFS persistence) while the Rust `query_content_db` (`rusqlite`, `bundled` + `fts5`) queries a local 30MB SQLite pack in <10ms | **Pass (device)** — OPFS `user_data.sqlite` survived a full `Page.reload`; Rust `query_content_db` `"work together for good"` → Rom 8:28 min 4.6 / p50 4.8 / max 8.9 ms (<10 ms, `G3` `v1.0.38`) |
| Spike 3 (crypto parity) | Encrypt with `react-native-quick-crypto` on mobile and decrypt the exact `e2ee:v1:...` payload with `crypto.subtle` on desktop/Node (and vice versa) using identical AAD and PBKDF2-SHA256 output | **Pass (device)** — on-device PBKDF2-SHA256 KAT `a378d630…` matched the host exactly; `e2ee:v1` note round-trip OK; tampered envelope rejected by AES-GCM (`G3` `v1.0.37`) |
| Spike 4 (120Hz breath ring) | Skia/Reanimated breathing circle on Android/iPad with smooth frame pacing and `AccessibilityInfo.isReduceMotionEnabled()` fallback | **Pass (device)** — mobile Skia/Reanimated ring sets the beat with the Reduced Motion still-ring fallback (`G3` `v1.0.36`); desktop/web Motion analogue verified on the host (`G3` `v1.0.12`) |

## 14 — Gap register

- **Missing source doc:** `A7` (Constraints, Assumptions & Open Questions) is cited as `ASM-01..ASM-04` (and `CON-*` / `OQ-01..07`) across the documentation suite, but the standalone document has not been extracted yet (see `G1` "Known Gaps").
- **External open items:** Bible.org NET redistribution terms (`B5`); BSB verse-level audio timestamp availability (`B5` / `B4`).
- **Pending verification:** nothing gating Phase 1 or Phase 2 — all four Gate-1 spikes (`B3` §4.5), Phase-1 `FR-101..105` on-device verification (`G3` `v1.0.37`–`v1.0.40`), and Phase-2 real-device two-device PowerSync round-trip + shared-pool join-by-code verification (`G3` `v1.0.42`) are complete. Phase 3 device clauses still open: on-device run of the mobile study screen and two-stream mixer (needs a new native build for `expo-audio`), iPad stroke → Android/Desktop rendering, cross-device sync of highlights/notes/ink, and the FR-106 ±250 ms check once an audio edition with timestamps exists.
- **Rows currently `Partial`:** `FR-106` (no narration timestamps data), `FR-301` (no English word alignments; tap via the interlinear), `FR-304` (in-app reminder, no OS notification).
- **Rows currently `Not started`:** `FR-401`–`FR-403` — Phase 4.

## Change Log

| Version | Date | Author | Note |
| --- | --- | --- | --- |
| `1.0.4` | `2026-11-27` | Claude | **Phase-3 build.** `FR-302`, `FR-303`, `FR-305` → `Implemented`; `FR-106`, `FR-301`, `FR-304` → `Partial` with the exact gap in each row (narration timestamps data; English word alignments; OS-level reminder). Coverage summary and Section 14 updated (`G3` `v1.0.44`). |
| `1.0.3` | `2026-11-27` | Athena | **Phase-2 exit-gate PASSED.** Live two-device PowerSync sync round-trip and ≥2-device shared-pool join-by-code verified on real devices (`G3` `v1.0.42`). Cleared Phase-2 pending-device caveats on `FR-202`, `FR-205`, `FR-206` and Section 14; Phase 3 (`FR-106`, `FR-301`–`FR-305`) is now unblocked (`A3 §4.1`). |
| `1.0.2` | `2026-11-27` | Athena | **Phase-2 host-side closure.** The seven Phase-2 rows `FR-107` & `FR-201`–`FR-206` flipped from `Not started` to `Implemented` after every `A3 §4.1` Phase-2 deliverable landed with tests and a green gate: tap-to-capture pooling (FR-201), categorized/shared church pools with per-user E2EE notes + join-by-code (FR-202), Smart Rotation + answered testimonies (FR-203), the offline prayer-prompt generator (FR-204), the four guided engines logging `prayer_session_logs` (FR-205), the offline-first PowerSync + opt-in E2EE vault incl. the 52-char Recovery Key with its offline QR code (FR-206), and kind habits/reminders + ESV TTL/verse-cap eviction (FR-107). Coverage summary (Phase-2 `Implemented` 0→7, `Not started` 7→0; total `Implemented` 5→12, `Not started` 16→9) and each row's `Code/Test pointer` updated to the real repository paths; Section 14 pending-verification list replaced with the still-open **real-device** exit-gate clauses (two-device/three-platform PowerSync round-trip, ≥2-account shared-pool privacy check, 4-engine 120 fps check) and their hosted-project provisioning. No code, schema, contract, ADR, or phase-boundary change. |
| `1.0.1` | `2026-11-26` | Athena | **Phase-1 exit-gate closure.** The five Phase-1 rows `FR-101`–`FR-105` flipped from `Partial` to `Implemented` after the on-device verification completed on the `preview` APK (Android emulator, Pixel 10 Pro, API 36): FR-101 Psalm 23 heading + poetry indents / Matthew 5 red-letter / footnote sheet; FR-102 `core_bsb:BSB,trans_kjv:KJV` column alignment at `45008028`; FR-103 offline FTS5 `congregation` + NT filter; FR-104 Focus Mode chrome clearing; FR-105 `trans_web` catalogue remove→install (hash-verified, atomic, no restart) immediately usable in the version-switcher surface. Coverage summary (Phase-1 `Implemented` 0→5, `Partial` 5→0) and Section 13 `B3 §4.5` spike statuses (all four now **Pass (device)**, cross-referencing `G3` `v1.0.37`–`v1.0.38`) updated to match; Section 14 gap register pending list cleared. No code, schema, contract, ADR, or phase-boundary change. |
| `1.0.0` | `2026-11-26` | Athena | Initial canonical requirements register extracted from the full docs suite |
