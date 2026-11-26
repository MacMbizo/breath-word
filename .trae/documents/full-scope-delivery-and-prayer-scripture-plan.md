# Full-Scope Delivery Plan & Scripture-Prayer Capability

**Plan ID:** `full-scope-delivery-and-prayer-scripture-plan`
**Author:** Athena
**Status:** Approved — executing (§6.1 in progress)
**Created:** 2026-11-26
**Related Docs:** `A3` (Scope, Phasing & Non-Goals), `A2` (PRD), `G5` (Requirements Register), `F1` (Testing & DoD), `B3 §4.5` (Gate-1 spikes), `AGENTS.md`

---

## 1. Summary

The user asked three things:

1. **Confirm the plan.** "I think there is a plan in place already, with the different phases, but I just want to be sure we have the plan set for our full scope."
2. **Explain scripture prayer.** "Tell me what the app does regarding praying scripture — that is, how it helps with bible-based prayer."
3. **Acknowledge the build.** "The build is ready."

This plan (a) confirms and consolidates the **full v1 scope** into one follow-able phased plan anchored to the 21 canonical functional requirements in `G5`, (b) documents in plain language **how Breath & Word helps you pray Scripture**, and (c) states the immediate action for the finished build (`7040a3ee`), which requires exiting Plan Mode because it involves installing an APK.

**Bottom line:** the plan already exists and is sound — it lives across `A3 §4.1` (phase matrix) and `G5` (requirement status). This document consolidates both into a single execution reference and adds no new scope.

---

## 2. Current State Analysis

### 2.1 Where the project actually is

| Phase | Feature IDs | Register status (`G5` §1) | What exists in the repo today |
| --- | --- | --- | --- |
| **Phase 1** — Core Local Reader MVP | `FR-101`–`FR-105` + `tools/pack-builder` | **5 Partial** | Host-side implementation + tests for all five; **device verification still pending** (Gate-1 Spike 1) |
| **Phase 2** — Scripture Prayer & E2EE Sync | `FR-107`, `FR-201`–`FR-206` | **7 Not started** | Full DB **schema** for all 5 prayer tables; a presentation-only Breath Prayer ring component (1 of the 4 `FR-205` engines). No prayer repositories, stores, or session logging |
| **Phase 3** — Exegesis, Inductive, Ink & Audio | `FR-106`, `FR-301`–`FR-305` | **6 Not started** | Nothing |
| **Phase 4** — Grounded AI & Studio Polish | `FR-401`–`FR-403` (+ `FR-204` AI mode) | **3 Not started** | Nothing |
| **v1.1+** — Post-v1 | — | — | Nothing (deferral list only) |

### 2.2 Why Phase-1 rows read `Partial`, not `Implemented`

The **code and tests exist** for all Phase-1 features; what is missing is the **Gate-1 on-device verification** (`A3 §4.1` exit gate: *"48h spike passed; BSB pack built & verified; offline reader + parallel compare + FTS5 + Focus Mode usable daily by founder"*). The Gate-1 Spike 1 measurement has been blocked by a device-side pack install failure, whose root cause (`op-sqlite` `:memory:` `base_path` freeze) is now fixed in `apps/mobile/src/adapters/content-db.ts` and shipped in the ready build.

### 2.3 Gate health

- **Gate:** `pnpm turbo lint typecheck test` → **12/12 green** (core **100** tests, `tools/pack-builder` **37** tests).
- **Feature flags** (`packages/core/src/config/flags.ts`): Phase 1 has `ENABLE_PRAYER_ENGINE=false`, `ENABLE_CLOUD_SYNC=false`, `ENABLE_E2EE_VAULT=false` — i.e. **scripture-prayer features are deliberately gated OFF in Phase 1** by the scope guardrail (`AGENTS.md` rule 7, `A3 §4.1`). This is by design, not a gap.

### 2.4 The ready build

- EAS build **`7040a3ee-5d7c-4d7c-92b4-99d6706ce9ec`** → **`Status: finished`**.
- Archive: `https://expo.dev/artifacts/eas/c4oQXfFmxL-RWgZeyFsZqKJ_IGo9HTCSjiOTJMwhOdw.apk`
- Commit `240d4dda98a3691851aeb8af919695b1443182d0`; fingerprint `fe17578680fb6bba4fa10bdd8b9ced7e0d3aec43` (unchanged from prior build → native deps cached).
- Carries the **`FR-105` `content-db.ts` fix** (direct `ATTACH DATABASE ? AS ?`).

---

## 3. Part A — Full-Scope Delivery Plan (Phases 1–4 + v1.1)

This restates the authoritative phase matrix from `A3 §4.1`, anchored to the `G5` requirement IDs and their current status. **No requirement is added, moved, or re-scoped.** The single sequencing rule from `A3` acceptance applies: **no Phase N+1 task starts until the Phase N exit gate passes all acceptance checks.**

### Phase 1 — Core Local Reader MVP (IN PROGRESS — exit gate near)

| FR | Title | Status | Remaining work to reach the exit gate |
| --- | --- | --- | --- |
| `FR-101` | Structured Verse Renderer | Partial | Verify on-device: Psalm 23 poetry/heading indents, Matthew 5 red-letter, footnote sheet on tap |
| `FR-102` | Multi-Translation & Parallel Reader | Partial | Verify on-device: 2–4 columns align to `45008028` within 1 frame |
| `FR-103` | Offline FTS5 Search | Partial | Verify on-device: `"steadfast love"` ranked <50 ms with highlighted snippets; testament/book filter |
| `FR-104` | Focus Mode & Manna Pacing | Partial | Focus chrome present; Manna Pacing UI data source (`study_refs` pack) is Phase 3, so full pacing is legitimately deferred — confirm the Focus-Mode half on-device |
| `FR-105` | Content Pack Manager | Partial | Verify on-device: install sample pack → hash verify → atomic attach without restart → appears in switcher |
| — | `tools/pack-builder` ETL (`core_bsb`, `trans_web`, `trans_kjv`) | Partial | All three packs build & verify; `trans_web` production source still to be built through the real ETL |

**Phase-1 exit gate (`A3`):** 48h spike passed (Gate-1 Spikes 1–4) · BSB pack built & verified · offline reader + parallel compare + FTS5 + Focus Mode usable daily by the founder.

### Phase 2 — Scripture Prayer & E2EE Sync

| FR | Title | Status | Work |
| --- | --- | --- | --- |
| `FR-201` | Tap-to-Capture Verse Pooling | Not started | Floating action bar → insert `prayer_pool_items` in <2 taps |
| `FR-202` | Categorized & Shared Church Pools | Not started | 7 categories, `share_code`, join-by-code, privacy split enforced |
| `FR-203` | Smart Rotation & Answered Testimonies | Not started | 5-Minute Session deck ordered `last_prayed_at ASC NULLS FIRST`; `pray_count`/`answered_at`/`testimony_payload` |
| `FR-204` | Prayer Prompt Generator (offline half) | Not started | Deterministic zero-AI templates by genre + category |
| `FR-205` | Four Guided Prayer Engines | Not started (ring UI only) | Lectio Divina · 3 R's · ACTS · Breath Prayer; each logs `prayer_session_logs` |
| `FR-206` | Offline-First Sync & Opt-In Cloud E2EE | Not started | PowerSync sync + 30-second Private Vault wizard (`e2ee:v1:…`, Recovery Key) |
| `FR-107` | Kind Habits & Reminders | Not started | Non-punitive streak, local reminders, BYO ESV key + `api_ephemeral_cache` |

**Phase-2 exit gate (`A3`):** offline edits sync via PowerSync across Android + iPad + Desktop · E2EE vault + Recovery Key pass the crypto test suite · Shared Church Pool tested with ≥2 accounts.

### Phase 3 — Exegesis, Inductive, Ink & Audio

| FR | Title | Status |
| --- | --- | --- |
| `FR-301` | Clickable Strong's, Interlinear & Morphology | Not started |
| `FR-302` | Lexicon & Word Frequency Suite (BDB/Thayer/Abbott-Smith) | Not started |
| `FR-303` | Automated Passage Guide & Factbook | Not started |
| `FR-304` | Inductive 5-Step Study + Skia Ink | Not started |
| `FR-305` | Cross-Platform Stylus Ink Canvas | Not started |
| `FR-106` | Synchronized Audio & Ambient Mixer | Not started |
| — | ETL for `exegesis_step` & `study_refs` packs | Not started |

**Phase-3 exit gate (`A3`):** tap-to-Strong's, BDB/Thayer lexicon, TSK Passage Guide, Theographic Factbook, Inductive 5-step + Skia Ink, and synchronized BSB audio + ambient mixer ship cleanly.

### Phase 4 — Grounded AI & Studio Polish

| FR | Title | Status |
| --- | --- | --- |
| `FR-401` | Grounded AI "Smart Synopsis" (RAG + strict citation JSON) | Not started |
| `FR-204` | Prayer Prompt Generator (**AI mode**) | Not started |
| `FR-402` | Desktop Multi-Pane Docking (`dockview`) & shortcuts | Not started |
| `FR-403` | Church Web Companion (`https://app.breathandword.app/join/<CODE>`) | Not started |
| — | `commentary_pd` pack ETL | Not started |

**Phase-4 exit gate (`A3`):** RAG Smart Synopsis passes the hallucination/citation test suite · Desktop `dockview` + shortcuts + Web Companion live for a small church group.

### v1.1+ — Post-v1 Roadmap (explicitly deferred)

Syntactical Clause Diagrams (Clear-Bible Macula), Collaborative Church Prayer Comments, USFM/OSIS BYO local pack importer, Home Screen Widgets, UI i18n. **Scheduled only after Phase 4 stability & real church usage feedback** (`A3 §4.1`). `ENABLE_SYNTAX_TREES_V11` stays `false` in every phase.

### v1 Non-Goals (locked — `A3 §4.2`)

No public social network/algorithmic feed · no proprietary publisher licensing in v1 · no freehand drawing over reflowing Bible paragraphs · no server-side plaintext storage of E2EE notes · no full offline multi-pack downloads in the Web Companion · no custom CRDT engine (PowerSync + Supabase only).

---

## 4. Part B — How Breath & Word Helps You Pray Scripture

This is the plain-language answer to "what does the app do regarding praying scripture." It reflects **what is built today** versus **what the plan delivers**, so expectations stay accurate.

### 4.1 The core idea

Most Bible apps stop at *reading*. Breath & Word treats a verse you read as a verse you can **capture, carry, and pray** — turning the reader into a prayer tool without leaving Scripture. Four movements: **capture → organize → pray → remember.**

### 4.2 The scripture-prayer capabilities (Phases 2–4)

1. **Tap-to-Capture Verse Pooling (`FR-201`).** Select one or more verses (including cross-chapter ranges like Isaiah 52:13–53:12) → an animated action bar offers a one-tap **"Add to Prayer Pool"** with a pool picker and optional quick note. The verse lands in a `prayer_pool_items` row in under two taps.

2. **Categorized & Shared Church Pools (`FR-202`).** Organize captured verses into categories — `ANXIETY`, `GUIDANCE`, `THANKSGIVING`, `FAMILY`, `FINANCE`, `HEALING`, `CUSTOM`. A pool stays **private** by default; flip it to `SHARED` to mint an 8-character `share_code` others join. **Privacy split (non-negotiable, `AGENTS.md` rule 3):** the shared pool holds only the verses; your **personal notes, pray-counts, and testimonies live in `prayer_item_user_states`** and stay end-to-end encrypted — a pool leader can never read your private reflections.

3. **Smart Rotation & Answered Testimonies (`FR-203`).** Launch a **"5-Minute Prayer Session"** — the app picks 3–5 active items ordered by `last_prayed_at ASC NULLS FIRST`, so nothing is prayed twice while something is neglected. Completing the deck increments `pray_count` and rotates those verses to the back of the next queue. You can mark a prayer **Answered** (`answered_at` + encrypted `testimony_payload`) or **Archive** it — building a private record of God's faithfulness.

4. **Prayer Prompt Generator — dual mode (`FR-204`).** **Offline (Phase 2):** deterministic, zero-AI structured prayer cards keyed to a passage's literary genre and category — works with the phone in airplane mode. **AI mode (Phase 4):** an explicit opt-in button transforms a passage into a reverent second-person prayer. It **never** sends your private notes unless you toggle `includeUserNotes === true` (`AGENTS.md` rule 5).

5. **Four Guided Prayer Engines (`FR-205`).** Full-screen, ambient, animated flows:
   - **Lectio Divina** — 4 timed stages with a gentle chime.
   - **3 R's** — Rejoice / Repent / Request cards.
   - **ACTS** — Adoration, Confession, Thanksgiving, Supplication.
   - **120Hz Breath Prayer** — an animated breathing ring (inhale 2–4 s, exhale 4–6 s) paired with curated Scripture, running on the UI thread with a reduced-motion fallback (`AGENTS.md` rule 6).
   Every engine writes a `prayer_session_logs` entry when you finish.

6. **Focus Mode & Manna Pacing (`FR-104`).** Focus Mode strips the reader to Scripture alone; Manna Pacing unlocks Day N+1 only when Day N is complete, updating `reading_progress` — a calm, non-pressuring rhythm.

7. **Kind Habits & Reminders (`FR-107`).** A **non-punitive** streak counter (missing a day shows gentle resume copy, never a red "loss" screen), local daily reminder notifications, and an optional bring-your-own ESV API key with a 500-verse ephemeral cache.

8. **Offline-First Sync & Opt-In E2EE Vault (`FR-206`).** Start as an offline guest, then one-click upgrade to Supabase + PowerSync. A 30-second Private Vault wizard (passphrase + printable 256-bit Recovery Key) encrypts notes, testimonies, and journals with the `e2ee:v1:…` envelope (`ADR-004`). Edits made offline on Android and iPad merge cleanly on reconnect; the server only ever sees ciphertext.

### 4.3 What exists in the app **today** vs. what's planned

| Capability | Today | Planned |
| --- | --- | --- |
| Breath Prayer ring (120Hz) | **UI exists** (mobile + desktop, presentation only, tokens-driven) | Wired to session logging & Scripture pairs in Phase 2 |
| Prayer tables (pools, members, items, user-states, session logs) | **Schema complete** (`user-data-schema.ts`), privacy split enforced | Repositories + stores + UI in Phase 2 |
| Capture / Pools / Rotation / Prompts / Engines / Sync / Habits | **Not started** | Phase 2 |
| Prayer-engine + sync flags | `ENABLE_PRAYER_ENGINE=false`, `ENABLE_CLOUD_SYNC=false` (Phase 1) | Enabled at Phase 2 |

**In short:** the app's *foundation* for Bible-based prayer — the data model and one animated engine — is already in place, and the *experience* (capture → pools → guided prayer → memories) is the whole of Phase 2, deliberately held back until Phase 1's reader is proven on-device per the scope guardrail.

---

## 5. Assumptions & Decisions

1. **The plan is the existing plan.** No new phases or requirements are introduced; this document consolidates `A3 §4.1` + `G5` into one reference. (Decision: confirm rather than rewrite.)
2. **Phase 1 exit gate is the only blocker to Phase 2.** Phase 2 work does not start until Gate-1 Spikes pass on-device (`A3` acceptance).
3. **`FR-104` full Manna Pacing is legitimately Phase-3-blocked** (its `study_refs` data source is a Phase-3 pack), not a Phase-1 gap.
4. **Scripture-prayer features remain flag-off in Phase 1** — no premature implementation (`AGENTS.md` rule 7).
5. **Bible translation sources:** `core_bsb`/`trans_kjv` from public-domain eBible.org USFM; ESV strictly BYO-key (no bundled proprietary text).

---

## 6. Verification & Immediate Next Actions

### 6.1 Immediate (requires exiting Plan Mode) — prove Phase 1 on-device

1. Download the ready APK → `adb install -r -g` on the emulator.
2. Deep-link `breathandword://diagnostics` → **Install sample pack** → confirm `[install] attached "core_bsb" v1.0.0 (… B)`.
3. **Run Spike 1** → record `min/p50/max` timing + write-failure count (via `uiautomator dump`).
4. Confirm **Library** no longer shows *"The downloaded pack could not be verified."*
5. Verify `FR-101` (Psalm 23 / Matthew 5), `FR-102` (2-column compare), `FR-103` (search incl. testament filter).
6. On Spike 1 pass → update `docs/G3-changelog.md` Gate-1 Spike 1 = **Pass (device)**.

### 6.2 Phase-1 exit-gate checklist (to close Phase 1)

- [ ] Gate-1 Spike 1 (pack install + FTS5 timing) — **device**
- [ ] Gate-1 Spike 2 (Tauri + PowerSync) — device
- [ ] Gate-1 Spike 3 (crypto parity) — device
- [ ] Gate-1 Spike 4 (frame pacing) — device
- [ ] `trans_web` built through the real ETL (public-domain WEB source)
- [ ] Offline reader + parallel compare + FTS5 + Focus Mode confirmed usable daily

### 6.3 Housekeeping (carried, open)

- Commit the large uncommitted working tree (checkpoint).
- `npx eas-cli env:create` for `EXPO_PUBLIC_*`; a `development` build with `expo-dev-client`; install `expo-system-ui`; ensure `main`'s GitHub CI runs once.

### 6.4 Definition of Done (every change — `F1`)

Every PR must pass `pnpm turbo lint typecheck test` (currently **12/12**); every error thrown must be a canonical `AppError` (`C3`); no raw SQL in UI (`AGENTS.md` rule 1); tokens only (`rule 6`).

---

## 7. Out of Scope for This Plan

- Any Phase 2–4 implementation (gated until the Phase-1 exit gate passes).
- v1.1 features (Syntax Trees/Macula, USFM importer, Widgets, i18n).
- Changes to `A3`, `A2`, `G5`, or any ADR — this plan references them; it does not amend them.
