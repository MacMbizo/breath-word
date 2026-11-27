# S1: Project Vision & Full Scope

**Document ID:** `S1`
**Version:** `1.0.0`
**Status:** `Living`
**Last Updated:** `2026-11-27`
**Related Docs:** `A1`, `A2`, `A3`, `G5`, `G1`, `AGENTS.md`

> This is a **status/handover** document (the `S*` family). It is a plain-language
> companion to the canonical specification suite (`A*`–`G*`), not a replacement for it.
> Where this document and the `docs/` suite disagree, **the suite wins**.

---

## 1. What Breath & Word is

**Breath & Word** is a **local-first, privacy-respecting Bible Study & Scripture Prayer**
app for **Android, iPad, and Desktop**. It runs entirely on the device by default, syncs
user data only when you ask it to, and never stores your private reflections in readable
form on a server.

- **Local-first:** reading, search, capture, and prayer all work with no network. The app is
  fully usable in airplane mode.
- **Privacy-respecting:** personal notes, testimonies, and journals are encrypted end-to-end
  (`e2ee:v1:…`) — the server only ever sees ciphertext.
- **Scripture-centred:** the reader is not an endpoint. A verse you read is a verse you can
  capture, carry, and pray.

The product is delivered as a **single pnpm/Turbo monorepo** with one shared logic package
(`packages/core`, 100% pure TypeScript) and two UI apps (`apps/mobile` = Expo React Native;
`apps/desktop` = Tauri v2 + React). See `B3` and `ADR-001`.

---

## 2. The core idea: capture → organize → pray → remember

Most Bible apps stop at *reading*. Breath & Word turns the reader into a prayer tool across
four movements:

1. **Capture** — select one or more verses and add them to a Prayer Pool in under two taps.
2. **Organize** — sort captured verses into categories (anxiety, guidance, thanksgiving,
   family, finance, healing, custom); keep a pool private or share it with a church group.
3. **Pray** — launch a guided session: a 5-minute rotation deck, or one of four full-screen
   animated engines (Lectio Divina, Three R's, ACTS, 120 Hz Breath Prayer).
4. **Remember** — mark prayers answered, capture a private testimony, and build a record of
   God's faithfulness — encrypted, on your device.

The **shared-pool privacy split** is the heart of the design (`AGENTS.md` rule 3, `C4`):
a shared pool holds only the *verses*; your personal notes, pray-counts, and testimonies live
separately in `prayer_item_user_states`, encrypted per-user. **A pool leader can never read
your private reflections.**

---

## 3. Full v1 scope — 21 functional requirements across 4 phases

The scope is fixed in `A3 §4.1` (phase matrix) and tracked in `G5` (requirements register).
The single sequencing rule: **no Phase N+1 work starts until the Phase N exit gate passes.**

### Phase 1 — Core Local Reader MVP

| FR | Title |
| --- | --- |
| `FR-101` | Structured Verse Renderer (poetry/heading indents, red-letter, footnote sheet) |
| `FR-102` | Multi-Translation & Parallel Reader |
| `FR-103` | Offline FTS5 Search (ranked, highlighted snippets, testament filter) |
| `FR-104` | Focus Mode & Manna Pacing |
| `FR-105` | Content Pack Manager (catalogue, install/remove, hash-verified, atomic) |
| — | `tools/pack-builder` ETL for `core_bsb`, `trans_kjv`, `trans_web` |

**Exit gate (PASSED):** 48h Gate-1 spike passed · BSB pack built & verified · offline reader
+ parallel compare + FTS5 + Focus Mode usable daily.

### Phase 2 — Scripture Prayer & E2EE Sync

| FR | Title |
| --- | --- |
| `FR-201` | Tap-to-Capture Verse Pooling (≤2 taps) |
| `FR-202` | Categorized & Shared Church Pools (7 categories, `share_code`, join-by-code) |
| `FR-203` | Smart Rotation & Answered Testimonies (5-minute session, `pray_count`) |
| `FR-204` | Prayer Prompt Generator — **offline half only** in Phase 2 |
| `FR-205` | Four Guided Prayer Engines (Lectio Divina, 3 R's, ACTS, Breath) |
| `FR-206` | Offline-First Sync & Opt-In Cloud E2EE (PowerSync + 30-second Vault wizard) |
| `FR-107` | Kind Habits & Reminders (non-punitive streak, local reminders, BYO ESV cache) |

**Exit gate:** offline edits sync via PowerSync across Android + iPad + Desktop · E2EE vault
+ Recovery Key pass the crypto suite · Shared Church Pool tested with ≥2 accounts.

### Phase 3 — Exegesis, Inductive, Ink & Audio

`FR-301` Clickable Strong's/Interlinear/Morphology · `FR-302` Lexicon & Word-Frequency Suite ·
`FR-303` Automated Passage Guide & Factbook · `FR-304` Inductive 5-Step Study + Skia Ink ·
`FR-305` Cross-Platform Stylus Ink Canvas · `FR-106` Synchronized Audio & Ambient Mixer ·
ETL for `exegesis_step` & `study_refs` packs.

### Phase 4 — Grounded AI & Studio Polish

`FR-401` Grounded AI "Smart Synopsis" (RAG + strict citation JSON) · `FR-204` Prayer Prompt
Generator (**AI mode**) · `FR-402` Desktop Multi-Pane Docking (`dockview`) + shortcuts ·
`FR-403` Church Web Companion (`https://app.breathandword.app/join/<CODE>`) · `commentary_pd`
pack ETL.

### v1.1+ — explicitly deferred

Syntactical Clause Diagrams (Clear-Bible Macula), collaborative church prayer comments,
USFM/OSIS BYO local pack importer, home-screen widgets, UI i18n. (`ENABLE_SYNTAX_TREES_V11`
stays `false` in every phase.)

---

## 4. v1 non-goals (locked — `A3 §4.2`)

- No public social network or algorithmic feed.
- No proprietary publisher licensing in v1 (public-domain translations + BYO ESV key only).
- No freehand drawing over reflowing Bible paragraphs.
- No server-side plaintext storage of E2EE notes.
- No full offline multi-pack downloads in the Web Companion.
- No custom CRDT engine — PowerSync + Supabase only.

---

## 5. How Breath & Word helps you pray Scripture (plain language)

1. **Tap-to-Capture** (`FR-201`) — select verses (incl. cross-chapter ranges) → one-tap
   *"Add to Prayer Pool"* with a pool picker and optional quick note.
2. **Categorized & Shared Pools** (`FR-202`) — organize into categories; keep private, or
   flip to `SHARED` and mint an 8-character code others join. Personal reflections stay
   private and encrypted even inside a shared pool.
3. **Smart Rotation & Testimonies** (`FR-203`) — a 5-minute deck ordered
   `last_prayed_at ASC NULLS FIRST` so nothing is neglected; completing it increments
   `pray_count`; mark Answered (`answered_at` + encrypted `testimony_payload`) or Archive.
4. **Prompt Generator** (`FR-204`) — **offline:** deterministic, zero-AI structured prayer
   cards keyed to genre + category (works in airplane mode). **AI (Phase 4):** opt-in;
   never sends private notes unless `includeUserNotes === true`.
5. **Four Guided Engines** (`FR-205`) — Lectio Divina · 3 R's · ACTS · 120 Hz Breath Prayer
   (UI-thread worklet with a reduced-motion fallback). Each logs a `prayer_session_logs` row.
6. **Focus Mode & Manna Pacing** (`FR-104`) — strip the reader to Scripture alone; unlock
   Day N+1 only when Day N is complete.
7. **Kind Habits & Reminders** (`FR-107`) — non-punitive streak (gentle resume copy, never a
   red "loss" screen), local daily reminders, optional BYO ESV key with a 500-verse
   ephemeral cache.
8. **Offline-First Sync & Opt-In E2EE Vault** (`FR-206`) — start as an offline guest,
   one-click upgrade to Supabase + PowerSync. A 30-second Vault wizard (passphrase +
   printable 256-bit Recovery Key) encrypts notes/testimonies/journals; edits merge cleanly
   on reconnect; the server sees only ciphertext.

---

## 6. Where we are today (one-paragraph summary)

**Phase 1 is complete and device-verified** (all five FRs + the pack-builder ETL, including a
real public-domain WEB build). **Phase 2 is built end-to-end on the host and gate-green**
(the seven Phase-2 FRs are `Implemented` in `G5` `1.0.2`, recorded in `G3` `v1.0.41`). The
only Phase-2 items not yet closed are the **real-device clauses** of the exit gate — the
two-device/three-platform PowerSync round-trip and the ≥2-account shared-pool check — plus
finishing hosted provisioning. See
[`S2-build-history-and-progress.md`](S2-build-history-and-progress.md) for the full record.
