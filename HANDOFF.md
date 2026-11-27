# HANDOFF — Breath & Word

> **Read this first** when resuming work in a fresh session or on a new machine. It is a concise
> orientation, **not** a replacement for the specs. Authoritative specs live in `docs/` — start at
> `docs/G1-index.md`. The living changelog is `docs/G3-changelog.md` (currently `v1.0.44`); the
> requirements register is `docs/G5-requirements-register.md` (currently `1.0.4`).

---

## 1. What this project is

**Breath & Word** — a local-first, privacy-respecting **Bible Study & Scripture Prayer** app.
Monorepo: **pnpm workspaces + Turborepo + strict TypeScript**. One pure-TS core with two UI targets:

- `apps/mobile` — Expo SDK 58 (Android phones + iPadOS), React Native 0.88 + Reanimated + Skia + RNGH 3,
  `react-native-track-player` (narration) + `expo-audio` (ambient bed).
- `apps/desktop` — Tauri v2 + Vite + React 19 (Windows/macOS + web companion), Tailwind + Motion + Dockview.

Build strictly to the **active Phase** (Phase 1 → 2 → 3 → 4). Do **not** implement v1.1 features
(Syntax Trees / Macula, on-device USFM importer, widgets) prematurely. See `docs/product/A3-*.md`.

## 2. Repo layout (canonical tree: `docs/architecture/B3-*.md` §4.1)

```text
breath-word/
├── AGENTS.md                  # non-negotiable engineering contract (see §3)
├── HANDOFF.md                 # this file
├── docs/                      # living spec suite (G1 index, A1..G5) + research docs (§7)
├── supabase/                  # migrations / functions / powersync sync-rules
├── tools/pack-builder/        # Node/TS content-pack ETL (.sqlite + .gz + manifest.json)
│   ├── src/build-pack.ts      #   CLI; dispatches on metadata.packType (TRANSLATION/EXEGESIS/STUDY_REFS)
│   ├── src/pack-common.ts     #   B5 metadata gate, integrity verify, gzip+SHA-256 packaging
│   ├── src/exegesis-pack.ts · src/study-refs-pack.ts
│   ├── src/parse-datasets.ts  #   raw open datasets -> normalized pack source JSON
│   ├── src/datasets/          #   stepbible, openbible, theographic, morphology, reading-plans
│   └── scripts/               #   serve-packs.mjs (:8787), generate-ambient.mjs (WAV loops)
├── packages/
│   ├── tokens/                # design tokens: ONLY source of colors/fonts/spacing/motion
│   └── core/                  # 100% PURE TypeScript (no RN / DOM / Tauri imports)
└── apps/{mobile,desktop}/
```

## 3. Golden rules — `AGENTS.md` (non-negotiable)

1. **Monorepo boundaries:** `packages/core` stays pure TS. UI apps never write raw SQL — queries live
   in `packages/core/src/repositories/`.
2. **Dual-SQLite (`ADR-002`):** static scripture only in read-only packs (`ContentDbAdapter`); synced
   user data in `user_data.sqlite` (PowerSync); local-only state in `local_device.sqlite`. Synced
   tables: UUID v4 `id` PK + soft deletes (`deleted_at`); never hard-`DELETE`.
3. **Prayer pool privacy split:** per-user state only in `prayer_item_user_states`.
4. **Canonical refs:** `BBCCCVVV` ints; Strong's IDs unpadded uppercase (`G26`, `H430`).
5. **E2EE (`ADR-004`):** `e2ee:v1:<iv>:<ct_tag>`, AES-256-GCM, fresh IV, AAD `v1|<table>|<row_id>|<column>`.
   Never persist/log decrypted notes; never send notes to AI unless `includeUserNotes === true`.
6. **UI & a11y:** tokens only (no hex), UI-thread animations with Reduced Motion fallbacks, Hebrew/Aramaic
   wrapped in `dir="rtl"` + `unicode-bidi: isolate` (mobile: RLI/LRI…PDI isolates + `writingDirection`).
7. **Errors & gate:** every thrown error is a canonical C3 `AppError`.
   **Gate: `pnpm turbo lint typecheck test` → must be 12/12** (core 276 tests, pack-builder 87).

## 4. Dev environment

- Windows 11 · PowerShell 5 + Git Bash · Node `v24.19.0` (`node:sqlite` unflagged) · pnpm 9+ · Rust stable (MSVC).
- **Git:** `origin` = <https://github.com/MacMbizo/breath-word.git>, branch `main`. Checkpoint-commit before
  major changes; secret-scan (decode Supabase JWTs) before pushing. `.env.local` files are git-ignored.
- **Scripted patches:** write Python/Node patch scripts to a file first — Bash heredocs mangle backticks and `\b`.
  CRLF files: prefer the Edit tool.
- `tools/pack-builder` CLIs run through **`tsx`**.

## 5. Status snapshot (as of 2026-11-27)

**Phases 1, 2 and 3 are built, committed and pushed to `main`** (latest: `ca10864`).

### Phase 3 delivered (`c340564`, docs `ca10864`)
- **Packs:** `exegesis_step` (STEPBible TAGNT/TAHOT/TBESG/TBESH) and `study_refs` (OpenBible cross-refs +
  Theographic people/places + 2 generated reading plans). B5 gate: non-empty licence/attribution, CC-BY must link
  the licence, Theographic data forces CC-BY-SA-4.0 with ShareAlike named in words. Post-insert checks: canonical
  Strong's, verse-ID bounds, occurrence counts, orphan links, `integrity_check`, `foreign_key_check`.
- **Real partial build** (Gen–Deu + Mat–Jhn only): 144k tokens, 19.5k lexicon, 345k cross-refs, 4.3k entities.
  Outputs in git-ignored `tools/pack-builder/out/`.
- **Audio:** sleep-timer equal-power fade (`packages/core/src/audio/sleep-fade.ts`), mobile second stream via
  `expo-audio`, generated seamless 20 s ambient WAV loops (rain/piano/pad).
- **Study UI:** desktop `StudyPanel` / mobile `/study` route — word study (morphology, lexicon, occurrences),
  Passage Guide + Factbook, inductive tools (symbol washes, 5Ws & H, paraphrase, checkups), ink sketch (ADR-003
  0..1000 normalized, SVG on desktop / Skia on mobile). Reader: verse-number tap, washes/badges, narrated-verse
  marker, mini-player.
- **Fix:** desktop `text-ui*` Tailwind classes were undefined — now mapped to token font sizes.
- **Desktop live check passed** (via WebView2 CDP on port 9333). Real packs are installed in the desktop app data.

### Open (see G5 §14 and `.trae/documents/phase-3-exegesis-inductive-ink-audio-plan.md`)
- **FR-106 Partial:** no narration edition with verse timestamps → ±250 ms highlight untestable (Aeneas is the named tool).
- **FR-301 Partial:** no `verse_word_alignments` → English-word tap not possible; entry is via verse number.
- **FR-304 Partial:** checkups are in-app only, no OS notification.
- **Device:** mobile needs a new native build (`expo-audio`); mobile study screens never run on a device;
  iPad ink parity on Android/desktop; cross-device sync of highlights/notes/ink.
- **Data:** full STEPBible build from all TAGNT/TAHOT files; Factbook map is a grid + dot (no coastline source yet).

### Next up
1. Mobile native build + device run of the Phase 3 screens and two-stream mixer.
2. English-word alignments in translation packs (unblocks FR-301 tap-on-English).
3. Full STEPBible exegesis pack build.
4. Decide which research candidates (§7) enter `A2`/`G5` and when.

## 6. How to run

```powershell
pnpm install
pnpm turbo lint typecheck test                                  # THE GATE -> 12/12

pnpm --filter @breath-and-word/desktop tauri dev                 # desktop
pnpm --filter @breath-and-word/mobile run:android                # mobile dev build (Expo Go won't work)

# Packs
pnpm --filter @breath-and-word/pack-builder pack:sample          # synthetic translation fixture
pnpm --filter @breath-and-word/pack-builder pack:sample-exegesis
pnpm --filter @breath-and-word/pack-builder pack:sample-study-refs
pnpm --filter @breath-and-word/pack-builder parse:datasets exegesis --tagnt <f>… --tahot <f>… --tbesg <f> --tbesh <f> --out src.json
pnpm --filter @breath-and-word/pack-builder parse:datasets study-refs --openbible <cross_references.txt> --theographic <dir> --out src.json
#   then build: pack-builder --source src.json --out <dir>
pnpm --filter @breath-and-word/pack-builder serve:packs          # serve out/ on :8787 for in-app install
```

## 7. Research docs (2026-11-27, Draft — not approved scope)

Both are distilled from the root `extras.md` and registered in `G1` (1.1.0). Nothing in them may be built until
added to `A2`/`G5` and scheduled in `A3`.

- **`EXTRAS-FEAT`** — `docs/product/advanced-study-feature-candidates.md` (0.2.0): theological classification
  taxonomy (Promise/Warning/Wisdom/Commandment/Advice), `scripture_logic_maps` + `semantic_connections` schema
  concepts, Scripture Signals overlays with filterable category pills, Truth Chain relationship mapping, Unfolding
  Story chronological mode. Suggested order: **bcv-parser → Aeneas alignment → logic-maps schema spike → LLM
  classification cost check**.
- **`EXTRAS-SRC`** — `docs/integrations/bible-content-sources-and-external-datasets.md` (0.1.0): catalog of APIs
  (API.Bible, ESV, Free Use Bible API…), lexicon sources (OpenGNT, morphhb, SWORD), geodata (OpenBible geocoding,
  Pleiades), topical indices, formats/tools (USFM, OSIS, bcv-parser, collatex, Aeneas).

**Things to reconcile in those docs against what is already built:**
- EXTRAS-FEAT §5 lists reading plans as "v1.1+, not in `A2`", but **FR-104 reading plans exist** and Phase 3
  ships two generated plans in `study_refs`.
- EXTRAS-SRC §3 says TSK feeds `study_refs`; the built pack uses **OpenBible.info** cross-references instead.
- EXTRAS-SRC §9 calls `tools/pack-builder` a Python pipeline — it is **Node/TS**.
- Direct links to open Phase 3 gaps: **Aeneas** → FR-106 timestamps; **OpenBible geocoding / Pleiades** → the
  Factbook map's missing geography; **bcv-parser** (MIT, pure JS) is a cheap win for reader/search reference input.
- Semantic/embedding search and LLM classification both need `B6`/`B7` review before design.

## 8. Untracked files at the repo root

`extras.md` (source of the research docs) and `forwardprompt.md` are untracked by choice — the owner decides
whether to commit, move or delete them.
