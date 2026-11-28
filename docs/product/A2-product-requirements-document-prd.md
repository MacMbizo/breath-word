# A2: Product Requirements Document (PRD)

**Document ID:** `A2`  
**Version:** `1.2.0`  
**Status:** `Approved`  
**Owner:** Founder  
**Last Updated:** `2026-11-28`  
**Related Docs:** `A1`, `A3`, `B4`, `B6`, `C1`, `D3`, `F1`

## Purpose & Scope

Defines the complete, testable functional requirements for **Breath & Word v1** using canonical Requirement IDs (`FR-1xx` through `FR-5xx`) grouped by domain.

## Audience

Developer, AI coding partner, and QA test authoring (`F1`). Every UI screen, repository method, and test case must reference its `FR-xxx` ID.

## Body

### 4.1 Pillar 1 — Core Reading Engine, Audio & Habits (`FR-1xx`)

| ID | Feature | Phase | Detailed Requirement | Testable Acceptance Criteria |
| --- | --- | --- | --- | --- |
| `FR-101` | **Structured Verse Renderer** | P1 | Render `verses.content_json` preserving section headings, paragraph breaks, poetic indents, red-letter text, and clickable inline footnote markers (`footnotes` table). | Opening Psalm 23 and Matthew 5 displays poetic indents, headings, red-letter spans, and opens a footnote sheet on tap. |
| `FR-102` | **Multi-Translation & Parallel Reader** | P1 | Android: 2-tap header switcher + slide-up compare drawer. iPadOS/Desktop: 2 to 4 side-by-side columns with verse-synchronized scrolling (`canonical_verse_id`). | Scrolling column 1 to Romans 8:28 aligns columns 2–4 to `45008028` within 1 frame. |
| `FR-103` | **Offline FTS5 Search** | P1 | Full-text search across installed translation packs via `verses_fts` supporting phrase queries (`"living water"`), testament/book filters, and Strong's ID queries (`G26`, Phase 3). | Searching `"steadfast love"` offline returns ranked results in <50ms with highlighted match snippets. |
| `FR-104` | **Focus Mode & Manna Pacing** | P1 | Focus Mode hides all chrome except typography and subtle exit gesture. Manna Mode unlocks only today's `reading_plan_days` passages until marked complete (optional override toggle). | Enabling Focus Mode clears all toolbars; completing Day N unlocks Day N+1 and updates `reading_progress`. |
| `FR-105` | **Content Pack Manager** | P1 | Download, verify (SHA-256), attach, update, and remove modular packs (`core_bsb`, `trans_*`, `exegesis_step`, `study_refs`, `commentary_pd`) with progress bars and offline storage totals. | Downloading `trans_web` verifies hash, attaches atomically without restart, and immediately appears in version switcher. |
| `FR-106` | **Synchronized Audio & Ambient Mixer** | P3 | Stream or offline-cache chapter MP3s (`audio_chapters`), highlight active verse via `audio_verse_timestamps`, speed `0.8x–2.0x`, OS lock-screen controls, independent ambient track (rain/piano/pad) + sleep timer. | Playing Rom 8 highlights each verse within ±250ms of `start_ms`; sleep timer fades out both tracks smoothly to 0 volume. |
| `FR-107` | **Kind Habits & Reminders** | P2 | Non-punitive streak counter, local scheduled daily reminder notifications, and optional BYO ESV API key lookup (with `api_ephemeral_cache` 500-verse cap). | Missing a day shows gentle resume copy (never punitive red loss screens); ESV cache evicts entries past TTL/verse cap. |

### 4.2 Pillar 2 — Zero-Friction Scripture Praying & Sync (`FR-2xx`)

| ID | Feature | Phase | Detailed Requirement | Testable Acceptance Criteria |
| --- | --- | --- | --- | --- |
| `FR-201` | **Tap-to-Capture Verse Pooling** | P2 | Selecting 1+ verses (including cross-chapter ranges) reveals an animated floating action bar with one-tap **"Add to Prayer Pool"**, pool picker, and optional quick note. | Tapping Capture on Isa 52:13–53:12 inserts a `prayer_pool_items` row (`23052013–23053012`) in <2 taps with full context expansion. |
| `FR-202` | **Categorized & Shared Church Pools** | P2 | Create private pools (`ANXIETY`, `GUIDANCE`, `THANKSGIVING`, `FAMILY`, `FINANCE`, `HEALING`, `CUSTOM`). Toggle `visibility = 'SHARED'` to generate an 8-char `share_code`. Subscribers join via code; personal notes/counts remain isolated in `prayer_item_user_states`. | User B joins User A's shared pool via code, sees verses + leader prompt, adds E2EE private note; User A cannot read User B's note. |
| `FR-203` | **Smart Rotation & Answered Testimonies** | P2 | Launch a **"5-Minute Prayer Session"** selecting 3–5 active items ordered by `last_prayed_at ASC NULLS FIRST`. Increment `pray_count` & update `last_prayed_at` on completion. Support **Answered** state (`answered_at` + encrypted `testimony_payload`) and **Archive**. | Completing a deck increments `pray_count` by 1 and rotates those cards to the back of the next session queue. |
| `FR-204` | **Prayer Prompt Generator (Dual-Mode)** | P2/P5 | **Offline Deterministic Templates (P2):** Zero-AI structured prayer cards keyed by literary genre & category. **AI-Assisted Mode (P5):** Explicit opt-in button transforming passage into reverent second-person prayer (never sends private notes unless toggled). | Offline mode generates valid structured prayer prompts with airplane mode on; AI mode requires explicit user click. |
| `FR-205` | **Four Guided Prayer Engines** | P2 | Full-screen animated dark/ambient flows: (1) **Lectio Divina** (4 timed stages + chime); (2) **3 R's** (Rejoice/Repent/Request cards); (3) **ACTS** (4-stage anchored flow); (4) **120Hz Breath Prayer** (animated breathing ring, customizable inhale 2–4s / exhale 4–6s, curated Scripture pairs). | Every engine logs a `prayer_session_logs` entry on finish; Breath Prayer maintains 60/120fps without dropped frames on mid-range Android & iPad. |
| `FR-206` | **Offline-First Sync & Opt-In Cloud E2EE** | P2 | Seamless offline guest mode with one-click upgrade to Supabase + PowerSync sync. Opt-in 30-second Private Vault wizard (Passphrase + printable 256-bit Recovery Key) encrypting notes, testimonies, and journals via `e2ee:v1:...` (`ADR-004`). | Edits made offline on Android & iPad merge cleanly on reconnect; DB inspection in Supabase shows only `e2ee:v1:...` ciphertext for encrypted fields. |

### 4.3 Pillar 3 — Deep Exegetical & Inductive Research (`FR-3xx`)

| ID | Feature | Phase | Detailed Requirement | Testable Acceptance Criteria |
| --- | --- | --- | --- | --- |
| `FR-301` | **Clickable Strong's, Interlinear & Morphology** | P3 | Tapping any aligned English word (`verse_word_alignments`) opens bottom sheet (mobile) or popover (iPad/Desktop) showing Hebrew/Greek lemma, transliteration, Strong's ID, gloss, and pre-expanded `morphology_human`. | Tapping "love" in 1 Cor 13:4 displays `G26` (*agapē*), full lexical definition, and `Noun - Nominative Feminine Singular`. |
| `FR-302` | **Lexicon & Word Frequency Suite** | P3 | Full BDB / Thayer / Abbott-Smith structured entry view + instant occurrence counts (`ot_occurrences`, `nt_occurrences`, book distribution chart queried from `interlinear_tokens`). | Opening `G26` displays structured lexicon sections and taps through to all NT verse occurrences offline. |
| `FR-303` | **Automated Passage Guide & Factbook** | P3 | Passage Guide compiles weighted TSK `cross_references`, literary genre (`books.literary_genre`), and `commentary_chunks`. Factbook opens entity dossiers (`factbook_entities`) with occurrences, timeline era, and interactive map pin (`latitude`, `longitude`). | Opening Passage Guide on Rom 8 lists top-voted TSK refs; tapping "Ephesus" opens entity dossier with Acts/Epistles occurrences. |
| `FR-304` | **Inductive Bible Study Suite** | P3 | (1) **Observation:** Color + symbolic highlights (`symbol_tag`: `KEY_TERM`, `GOD_REF`, `TRANSITION`, `PROMISE`, `COMMAND`) + 5Ws & H structured note template. (2) **Interpretation:** Split-screen Personal Paraphrase editor. (3) **Application:** 5-step card (Verse → Truth → Need → Intent → Checkup local notification via `checkup_remind_at`). | Creating an Application card schedules a local OS reminder for `checkup_remind_at` and syncs across devices. |
| `FR-305` | **Cross-Platform Stylus Ink Canvas** | P3 | Attach a vector Skia/Canvas sketchpad (`ink_canvases`) to any study note or verse drawer supporting Apple Pencil pressure (iPadOS), S-Pen/touch (Android), and mouse/pen (Desktop). | Stroke drawn on iPad syncs via PowerSync and renders identically at the same relative proportions on Android and Windows 11. |

### 4.4 Pillar 4 — Grounded AI Assistant & Desktop Studio (`FR-4xx`)

| ID | Feature | Phase | Detailed Requirement | Testable Acceptance Criteria |
| --- | --- | --- | --- | --- |
| `FR-401` | **Grounded AI "Smart Synopsis"** | P5 | Retrieves matching `commentary_chunks` filtered by user-selected theological tradition(s), invokes Edge Function / BYOK LLM with strict citation JSON schema, displays clickable inline citations `[chunk_id]`, and enforces *"Not covered in available sources"* fallback. | Asking an unsupported question returns the explicit fallback string; every factual claim renders a verified citation popover. |
| `FR-402` | **Desktop Multi-Pane Docking & Shortcuts** | P5 | Tauri desktop workspace using `dockview` (Library/Pools, Parallel Reader, Exegetical/Factbook, Prayer Journal/AI) + global shortcuts (`Ctrl/Cmd+K` jump, `Ctrl/Cmd+P` Prayer Pool, `Ctrl/Cmd+E` Exegetical Guide). | Workspace panel layout persists in `workspace_state` across restarts; `Ctrl/Cmd+K` jumps to `"rom 8:28"` in <200ms. |
| `FR-403` | **Church Web Companion** | P5 | Lightweight browser build of `apps/desktop` enabling church members to sign in, join Shared Prayer Pools via URL/code, pray through decks, and record private E2EE notes without installing a native app. | Opening `https://app.breathandword.app/join/<CODE>` on mobile Chrome lets a user join and run a Prayer Deck session. |

### 4.5 Pillar 5 — Scripture Signals & Promise Prayer (`FR-5xx`)

The reason Breath & Word exists: help believers **see** the promises, commands and warnings already in Scripture, **keep** the ones that speak to their circumstances, **pray** them, and **recall** them in daily life. Classifications come only from established, attributed compilations — the app highlights what is already known, it never invents or AI-generates new categories. Static data lives in a read-only `study_signals` pack (`B4`); personal tags live in synced user data.

| ID | Feature | Phase | Detailed Requirement | Testable Acceptance Criteria |
| --- | --- | --- | --- | --- |
| `FR-501` | **Scripture Signals Overlay** | P4 | Toggleable on-page marks for verses classified **PROMISE**, **COMMAND**, **WARNING** or **WISDOM**, read from a read-only `study_signals` pack built ONLY from established, attributed compilations (e.g. Clarke's *Precious Bible Promises*, Spurgeon's *Faith's Checkbook*, Maimonides' 613 commandments, Nave's / Torrey's topical indexes) — never AI-generated classifications. Each category is distinguished by shape AND colour (never colour alone), uses tokens only, and every mark opens a card naming its source compilation. | With Signals on, Romans 8 shows a mark on every verse the installed `study_signals` pack lists for Romans 8; tapping a mark opens a card naming the source compilation; marks stay distinguishable in greyscale and with Reduced Motion on. |
| `FR-502` | **Signal Pills & Named Collections** | P4 | Category pills with live counts per chapter / book ("Promises in Romans · N") and named collections (Beatitudes, Ten Commandments, Lord's Prayer, "I AM" sayings, fruit of the Spirit, "one another" commands) that open as a browsable, filterable list; tapping an entry scrolls the reader to the verse. | Tapping the "Promises" pill in Romans lists exactly the pack's Romans promises with a matching count; opening "The Beatitudes" lists Matt 5:3–12 and tapping 5:8 scrolls the reader to `40005008`. |
| `FR-503` | **Promises for My Circumstance** | P4 | A circumstance index ("Promises for when I'm… afraid, grieving, anxious, waiting, tempted, in need of guidance…") built from the source compilations' own headings, mapped onto `FR-202` pool categories, with one-tap capture of any promise into a prayer pool (`FR-201`). | Choosing "Afraid" offline lists the pack's promises under that heading; capturing one inserts a `prayer_pool_items` row in an `ANXIETY` (or chosen) pool in ≤ 2 taps. |
| `FR-504` | **"Pray This Promise"** | P4 | From any signal card, start a prayer seeded with that verse: offline deterministic templates (`FR-204`) per category (promise → thanksgiving + claiming, command → surrender + help to obey, warning → confession + protection) or any `FR-205` engine. Where the source pairs a promise with its condition (e.g. 1 John 1:9 "If we confess…"), the card shows condition and promise together. | With airplane mode on, "Pray this promise" on Isa 41:10 opens a structured prayer built from that verse and logs a `prayer_session_logs` entry on finish. |
| `FR-505` | **Daily Promise & Recall** | P4 | A daily promise (Spurgeon's *Faith's Checkbook*, 366 entries, keyed by day of year) on the home surface, plus gentle resurfacing of the user's own saved promises through `FR-203` smart rotation and an optional local reminder (`FR-107` tone: never punitive). | On 1 March the home surface shows that day's entry offline; a promise captured last week reappears in the next 5-Minute Prayer Session ordered by `last_prayed_at`. |
| `FR-506` | **Personal Signals** | P4 | Users tag any verse with their own Promise / Command / Warning / Wisdom (or custom) signal and note; stored per user in `user_data.sqlite` (UUID `id`, soft delete `deleted_at`, notes E2EE per `ADR-004`), kept visually and structurally separate from the curated pack layer, which users can hide. | A personal Promise tag added on Android appears on iPad after sync; hiding the curated layer leaves only personal tags; Supabase shows only `e2ee:v1:` ciphertext for the note. |
| `FR-507` | **Truth Chain (Linked Passages)** | P4 | Typed links between passages taken from the source data (Condition → Promise, Command → Promise, Prophecy → Fulfillment), shown as an inline expandable panel / sheet on mobile and a side card on iPad/Desktop; every link names its source. | Opening the chain on 1 John 1:9 shows its condition and promise and at least one linked passage with its source named; tapping a link navigates there and back. |
| `FR-508` | **Unfolding Story (Chronological Reading Mode)** | P4 | A reader mode that interleaves passages in chronological order — e.g. Psalms 142 and 57 inside 1 Samuel 22 at the cave of Adullam, prophets inside Kings/Chronicles — with an era timeline and place pins from `factbook_entities`. Order, eras and dates come only from a sourced chronology (e.g. Theographic events, already in `study_refs`), are shown with their source and marked approximate. Every verse keeps its `BBCCCVVV` ID; the mode supplies only order and markers. | Opening the David era shows 1 Samuel 22:1–2 followed by Psalm 142 with a "written here" marker and the Adullam place pin; every date names its source and reads "approx."; leaving the mode returns to the same verse in canonical order. |

## Acceptance / Done Criteria

- Every `FR-xxx` item has a corresponding test case in `F1` and a release phase assignment in `A3`.

## Open Questions

- None.

## Assumptions

- `ASM-03` (`A7`): UI copy is English-only in v1; RTL Hebrew and polytonic Greek text rendering is required in `FR-301`/`FR-302`.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Initial canonical PRD derived from `SPECIFICATION.md` and aligned to `B4`/`B8`.
- `1.1.0` | `2026-11-28` | Claude | Owner decision: added Pillar 5 — Scripture Signals & Promise Prayer (`FR-501`–`FR-507`), promoted from `EXTRAS-FEAT` §1, §2, §7, §8, as the app's core differentiator; curated attributed sources only, no AI classification. Grounded AI & Studio features (`FR-401`–`FR-403`, `FR-204` AI mode) move to Phase 5.
- `1.2.0` | `2026-11-28` | Claude | Owner decision: added `FR-508` Unfolding Story (from `EXTRAS-FEAT` §6) to Pillar 5 / Phase 4; chronology must be sourced and marked approximate.

## Traceability

- Upstream: `A1`, `SPECIFICATION.md`. Downstream: `A3`, `B1`, `B3`, `C1`, `D3`, `F1`.
