# Phase 3 Execution Plan — Exegesis, Inductive Study, Stylus Ink & Audio

**Plan ID:** `phase-3-exegesis-inductive-ink-audio-plan`
**Author:** Athena
**Status:** Active — in execution
**Created:** 2026-11-27
**Predecessor:** `phase-2-scripture-prayer-and-e2ee-plan` (Phase 2 — exit gate PASSED, `G3 v1.0.42`)
**Related Docs:** `A3 §4.1`, `A2 §4.1/§4.3`, `B4 §4.2–4.6`, `B5`, `B6`, `B7`, `C2`, `C3`, `D1`, `D3`, `F1`, `G5`, `ADR-003`, `AGENTS.md`

---

## 1. Objective

Deliver Phase 3 (**Exegesis, Inductive, Ink & Audio**) so that all six Phase-3 requirements (`FR-301`, `FR-302`, `FR-303`, `FR-304`, `FR-305`, `FR-106`) plus `tools/pack-builder` ETL support for `exegesis_step` and `study_refs` packs are `Implemented` and ready for the `A3 §4.1` Phase-3 exit gate:

> "Tap-to-Strong's, BDB/Thayer lexicon, TSK Passage Guide, Theographic Factbook, Inductive 5-step + Skia Ink, and synchronized BSB audio + ambient mixer ship cleanly."

Strictly out of scope in Phase 3 (`AGENTS.md` rule 7): Phase 4 (`FR-401` AI Smart Synopsis, `FR-204` AI mode, `FR-402` Desktop Dockview, `FR-403` Web Companion) and v1.1+ (Macula syntax trees, BYO USFM importer, Widgets, i18n).

---

## 2. Hard Constraints (`AGENTS.md`)

- `packages/core` stays 100% pure TypeScript — zero RN/Expo/Tauri/DOM imports (rule 1).
- Zero raw SQL in UI apps; all queries live in `packages/core/src/repositories/` (rule 1).
- Dual-SQLite separation: `exegesis_step` & `study_refs` live in read-only packs (`ContentDbAdapter`); `highlights`, `study_notes`, `ink_canvases` live in `user_data.sqlite` (UUID v4 PK, soft-delete `deleted_at` only); `audio_cache_entries` & local checkup reminders live in `local_device.sqlite` (rule 2).
- Canonical references (`BBCCCVVV`) & Strong's IDs always unpadded uppercase (`G26`, `H430`) (rule 4).
- E2EE (`B6`, `ADR-004`): `study_notes.{title_payload, body_payload}` and `ink_canvases.strokes_payload` use `e2ee:v1` when vault is enabled and are included in `VaultRepository`'s batch-encrypt list (rule 5).
- UI tokens strictly from `@breath-and-word/tokens` (incl. `INDUCTIVE_HIGHLIGHTS`); Hebrew/Aramaic tokens wrapped in `dir="rtl"` + `unicode-bidi: isolate`; Reduced Motion fallbacks (rule 6).
- Every thrown error is a canonical `AppError` (`C3`), including `DB_CONTENT_PACK_NOT_ATTACHED` when `exegesis_step` or `study_refs` is absent; gate `pnpm turbo lint typecheck test` stays green after every unit (rule 7).

---

## 3. Sequenced Workstreams

### WS1 — Exegesis & Lexicon Core (`FR-301`, `FR-302`, `FR-103` Strong's search)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P3-01` | `EXEGESIS_PACK_DDL` in `packages/core/src/content/pack-schema.ts`; Strong's normalization helper `packages/core/src/domain/strongs.ts`; Phase-3 domain types in `packages/core/src/domain/types.ts`. | FR-301/302 | `test/strongs.test.ts` + schema tests |
| `P3-02` | `packages/core/src/repositories/exegesis-repository.ts` — word alignment lookup, interlinear tokens, BDB/Thayer lexicon sections, OT/NT/book word frequency, Strong's search, versification mapping, `DB_CONTENT_PACK_NOT_ATTACHED` handling. | FR-301/302/103 | `test/exegesis-repository.test.ts` |

### WS2 — Passage Guide & Factbook Core (`FR-303`)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P3-03` | `packages/core/src/repositories/study-refs-repository.ts` — weighted TSK cross-references (`votes DESC`), Passage Guide aggregator (TSK + genre + entities + optional commentary), Factbook entity dossiers (aliases, era, lat/lng, verse links). | FR-303 | `test/study-refs-repository.test.ts` |

### WS3 — Inductive Study & Portable Stylus Ink Core (`FR-304`, `FR-305`)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P3-04` | `packages/core/src/repositories/inductive-study-repository.ts` — symbolic highlights (`SymbolTag`), study notes (`GENERAL`, `INDUCTIVE_5WH`, `PARAPHRASE`, `APPLICATION` 5-step + `checkup_remind_at` local reminder schedule), E2EE via `FieldCipher`, soft-delete only; extend `VaultRepository` `PRIVATE_FIELD_COLUMNS` with `study_notes` & `ink_canvases`. | FR-304 | `test/inductive-study-repository.test.ts` |
| `P3-05` | `packages/core/src/repositories/ink-canvas-repository.ts` + `packages/core/src/ink/strokes.ts` — portable normalized `0..1000` stroke validation/clamping (`ADR-003`), E2EE `strokes_payload`, soft-delete only. | FR-305 | `test/ink-canvas-repository.test.ts` |

### WS4 — Synchronized Audio, Ambient Mixer & Runtime Wiring (`FR-106`)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P3-06` | `packages/core/src/repositories/audio-repository.ts` — `audio_editions`, `audio_chapters`, `audio_verse_timestamps` lookup, O(log n) `resolveActiveVerse`, and `audio_cache_entries` LRU eviction respecting `is_pinned` and cap (`100 MB`–`4 GB`, default `250 MB`). | FR-106 | `test/audio-repository.test.ts` |
| `P3-07` | `packages/core/src/stores/audio-store.ts` & `packages/core/src/stores/study-store.ts` — headless Zustand stores (`AUDIO_VERSE_CHANGED` event emission, speed `0.8..2.0`, ambient mixer, smooth sleep timer fade-out; exegesis/factbook/inductive/ink state). | FR-106/301–305 | `test/audio-store.test.ts`, `test/study-store.test.ts` |
| `P3-08` | Wire Phase-3 repositories & stores into `packages/core/src/runtime/core-runtime.ts` and barrel exports. | all | `test/core-runtime.test.ts` |

### WS5 — Content Pack ETL (`exegesis_step` & `study_refs`)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P3-09` | Extend `tools/pack-builder` with `buildExegesisPack` (`EXEGESIS_PACK_DDL`, Strong's normalization, CC-BY-4.0 attribution check) and `buildStudyRefsPack` (`STUDY_REFS_PACK_DDL`, CC-BY-SA-4.0 notice & attribution check) + sample fixtures. | FR-301–303 | `tools/pack-builder/test/phase3-packs.test.ts` |

### WS6 — Mobile & Desktop UI Surfaces (tokens-only, RTL Hebrew, WCAG 2.2 AA)

| Unit | Deliverable | FR | Verification |
| --- | --- | --- | --- |
| `P3-10` | `MorphologyInspector` & `LexiconSheet/View` (mobile + desktop), clickable words in Reader, RTL Hebrew/Aramaic `dir="rtl"` + `unicode-bidi: isolate`. | FR-301/302 | lint + typecheck + test |
| `P3-11` | `PassageGuide` & `Factbook` surfaces (mobile + desktop) — weighted TSK refs, genre badge, entity dossier + coordinates. | FR-303 | lint + typecheck + test |
| `P3-12` | `InductiveToolbar` & Study Notes / Paraphrase / 5-Step Application UI (mobile + desktop) using `INDUCTIVE_HIGHLIGHTS`. | FR-304 | lint + typecheck + test |
| `P3-13` | `InkCanvas` portable vector sketchpad (mobile Skia/touch + desktop SVG/canvas pointer events) bound to `ink_canvases`. | FR-305 | lint + typecheck + test |
| `P3-14` | `AmbientAudioMiniPlayer` + two-stream mixer & smooth sleep timer fade-out (mobile + desktop) + active-verse highlight in Reader. | FR-106 | lint + typecheck + test |

### WS7 — Regression, Docs & Exit Gate

| Unit | Deliverable |
| --- | --- |
| `P3-15` | Keep `pnpm turbo lint typecheck test` green after every unit. |
| `P3-16` | Update `G5`, `G3`, `S2`, and this §5 ledger as work completes. |

---

## 4. Phase-3 Exit-Gate Checklist (`A3 §4.1`, `F1`)

- [ ] Tap-to-Strong's displays `G26` (*agapē*), definition, and morphology (<60 ms); RTL Hebrew renders with `dir="rtl"` + `unicode-bidi: isolate` (`FR-301`).
- [ ] BDB/Thayer lexicon sections + OT/NT frequency counts & verse occurrences work offline (`FR-302`).
- [ ] Passage Guide lists top-voted TSK refs on Rom 8; Factbook opens Ephesus dossier with occurrences & map coordinates (`FR-303`).
- [ ] Inductive highlights (`◇ △ ↳ ✦ ✓`), 5Ws&H, Paraphrase, and 5-step Application card schedule `checkup_remind_at` and sync (`FR-304`).
- [ ] Vector ink stroke drawn on one device syncs via `ink_canvases` and renders at identical normalized proportions cross-platform (`FR-305`).
- [ ] Synchronized audio highlights verses within ±250 ms, supports independent ambient mixer (`rain`/`piano`/`pad`), and smoothly fades out on sleep timer (`FR-106`).
- [ ] `exegesis_step` and `study_refs` ETL packs pass `PRAGMA integrity_check` and license/attribution checks (`B5`).
- [ ] `pnpm turbo lint typecheck test` green.

---

## 5. Progress Ledger

| Unit | State | Where |
| --- | --- | --- |
| `P3-01` | ✅ Host (tests) | `packages/core/src/content/pack-schema.ts`, `src/domain/strongs.ts`, `src/domain/types.ts` — covered by `test/exegesis-repository.test.ts` (no standalone `strongs.test.ts`) |
| `P3-02` | ✅ Host (tests) | `packages/core/src/repositories/exegesis-repository.ts` · `test/exegesis-repository.test.ts` |
| `P3-03` | ✅ Host (tests) | `packages/core/src/repositories/study-refs-repository.ts` · `test/study-refs-repository.test.ts` |
| `P3-04` | ✅ Host (tests) | `packages/core/src/repositories/inductive-study-repository.ts` · `test/inductive-study-repository.test.ts` |
| `P3-05` | ✅ Host (tests) | `packages/core/src/repositories/ink-canvas-repository.ts`, `src/ink/strokes.ts` · `test/ink-canvas-repository.test.ts` |
| `P3-06` | ✅ Host (tests) | `packages/core/src/repositories/audio-repository.ts` · `test/audio-repository.test.ts` |
| `P3-07` | 🟡 Partial | `src/stores/audio-store.ts`, `src/stores/study-store.ts` built; `test/study-store.test.ts` exists, **`test/audio-store.test.ts` still missing** |
| `P3-08` | ✅ Host (tests) | `packages/core/src/runtime/core-runtime.ts` · `test/core-runtime.test.ts` |
| `P3-09` | 🟡 Partial | **Exegesis done (2026-11-27):** `tools/pack-builder/src/exegesis-pack.ts` (`buildExegesisPackDatabase` / `buildExegesisPackArtifacts`, Strong's normalization, derived occurrence counts, post-insert integrity checks, `--sample-exegesis` fixture), shared B5 licence/attribution + integrity gates in `src/pack-common.ts` (now also applied to TRANSLATION packs) · `test/phase3-packs.test.ts` (17 tests). **Pending:** `buildStudyRefsPack` (CC-BY-SA-4.0 ShareAlike notice) and the raw STEPBible TAHOT/TAGNT TSV parser. |
| `P3-10` | ⬜ Pending | — |
| `P3-11` | ⬜ Pending | — |
| `P3-12` | ⬜ Pending | — |
| `P3-13` | ⬜ Pending | — |
| `P3-14` | ⬜ Pending | — |
| `P3-15` | 🔄 Ongoing | Gate `12/12` green after P3-09 (exegesis) |
| `P3-16` | 🔄 Ongoing | This ledger + `G3 v1.0.43` |
