# Breath & Word — Bible Study & Scripture Prayer Application: v1 Architecture & Engineering Blueprint

This document is the build-ready v1 technical specification and architectural blueprint for a cross-platform **Bible Study & Scripture Prayer** application, designed primarily for **Android phones** and **iPad (iPadOS)** with full **Desktop (Windows 11 / macOS)** support and optional read/prayer web access for small church groups.

It preserves every product feature from the original vision—habit-building daily reading, audio narration, Logos-grade exegetical tooling, Inductive Bible Study, and the zero-friction Scripture Praying engine—while resolving the concrete engineering decisions required to build it: **client stack, open-data sourcing, separated local-first storage, sync tombstones, privacy/E2EE for prayer notes, and enforceable AI grounding**.

---

## 1. Executive Product Vision & Architectural Decisions

Digital Bible applications typically split into two worlds:
1. **Consumer devotional apps** (YouVersion, Manna, Dwell): great daily habits, clean mobile UX, and audio, but shallow study tools.
2. **Academic desktop suites** (Logos, Accordance, Olive Tree, STEP Bible): deep original-language and commentary research, but heavy interfaces and steep learning curves.

This platform unites both paradigms around a third, defining pillar: an **automated, zero-friction Scripture Praying Engine** that turns daily reading into structured, personal prayer.

### 1.1 Target Devices & Concrete Client Stack

To deliver **zero feature compromises** on **Android phones** and **iPadOS** (including low-latency Apple Pencil ink, reliable background audio with lock-screen controls, native SQLite FTS5, and zero browser storage-eviction risk), while also supporting **Windows 11 / macOS** desktop workstations:

| Layer | Chosen Technology | Why It Fits Without Compromises |
| --- | --- | --- |
| **Mobile & Tablet (Android + iPadOS + iOS)** | **Expo / React Native (TypeScript)** | Native UI & performance on Android phones and iPadOS; native background audio (`react-native-track-player`), native `PencilKit` / `react-native-skia` stylus ink on iPad, and iPadOS multi-pane split views. |
| **Desktop (Windows 11 / macOS)** | **Tauri + React (TypeScript)** | Lightweight native desktop shell sharing the exact same TypeScript domain, sync, and UI components, with multi-window / dockable workspace panels (`dockview`) and global keyboard shortcuts. |
| **Shared Core (`packages/core`)** | **TypeScript Domain + SQLite Engine** | Shared Bible parser, canonical `BBCCCVVV` reference engine, prayer frameworks, sync client, and client-side E2EE crypto. |
| **Local Database** | **SQLite (`op-sqlite` / `tauri-plugin-sql`) + FTS5** | Instant offline rendering and full-text search across 31,102+ verses and 500k+ cross-references. |
| **Cloud Sync & Auth** | **Supabase (PostgreSQL) + PowerSync** | Free-tier friendly for personal + church group use; handles offline-first delta sync automatically without custom CRDT math. |
| **AI Gateway** | **Supabase Edge Function / BYOK LLM** | Grounded RAG over vetted commentary chunks + optional BYOK (Gemini / Claude / OpenAI) for personal-scale pennies/month cost. |

> **Distribution Note for Personal & Church Use:** Android builds distribute directly via signed APK/Play Store internal track; iPadOS builds distribute via TestFlight / Xcode personal signing; Desktop builds distribute as standard `.exe` / `.dmg` installers. A lightweight React web companion can also be deployed from the same codebase for church members who prefer instant browser access to shared Prayer Pools.

### 1.2 Target Device Classes & Adaptive UX

* **Android Phones (Primary Mobile):** Single-column, thumb-optimized reader with floating quick-action bar, bottom-sheet drawers for Strong’s/morphology, persistent mini audio player, and swipeable Prayer Deck cards.
* **iPad / iPadOS (Primary Tablet):** Dual-pane split-screen (Bible text left; Study Notes, Cross-References, Passage Guide, or Prayer Pool Manager right), touch drag-and-drop from Bible text into Prayer Pools, and **native Apple Pencil / stylus support** for handwritten margin notes and inductive markings.
* **Desktop Workstations (Windows 11 / macOS):** Multi-tab, multi-window research workspace with dockable panels (Left: Library/Plans/Prayer Pools; Center: Tabbed Parallel Reader; Right: Exegetical Guide/Interlinear/Factbook; Bottom: Prayer Journal & Grounded AI Assistant) and global shortcuts (`Ctrl/Cmd+K` passage jump, `Ctrl/Cmd+P` Prayer Pool, `Ctrl/Cmd+E` Exegetical Guide).

### 1.3 Separated Local-First Storage Architecture

Static biblical texts and user-generated data have completely different lifecycles and **must live in separate SQLite databases**:

1. **`bible_content.sqlite` (Read-Only Content Packs, Never Synced):** Contains translations, FTS5 search index, STEPBible interlinear tokens, lexicons, TSK cross-references, and Factbook entities. Downloaded as compressed packs and attached via `ATTACH DATABASE`.
2. **`user_data.sqlite` (Synced via PowerSync + Supabase):** Contains highlights, inductive markings, study notes, Apple Pencil ink vectors, Prayer Pools, Prayer Pool items, prayer session logs, and reading plan progress. All user tables use `updated_at` timestamps and soft-delete tombstones (`deleted_at`) so offline deletes never resurrect.

---

## 2. Open-Data Content & Audio Strategy

Designed for personal use and small church groups without publisher licensing bottlenecks in v1:

* **Bundled / Downloadable Open Translations:**
  * **Berean Standard Bible (BSB)** — Public domain (CC0), modern readable English, with aligned interlinear data and free verse-aligned MP3 audio.
  * **World English Bible (WEB)**, **King James Version (KJV)**, **American Standard Version (ASV)**, and **NET Bible** (free personal/non-commercial edition with full translator notes).
* **Personal API & Bring-Your-Own (BYO) Modules:**
  * **Crossway ESV API** integration (user enters their free personal API key for ESV lookups/caching).
  * **BYO Importer** for standard open formats (**USFM**, **OSIS**, or custom SQLite packs) so users can load additional personal texts or commentaries.
* **Open Exegetical & Factbook Datasets:**
  * **Tyndale House STEPBible Data (TAHOT / TAGNT):** Word-by-word Hebrew, Aramaic, and Greek text with Strong’s numbers, transliterations, glosses, and full morphological parsing codes.
  * **Lexicons:** Public-domain **Brown-Driver-Briggs (BDB)** (Hebrew), **Thayer’s** (Greek), and **Abbott-Smith** (Greek), plus **Strong’s Concise Dictionary**.
  * **Cross-References:** **OpenBible.info / Treasury of Scripture Knowledge (TSK)** (~340,000–500,000+ weighted cross-references).
  * **Factbook Entities:** **Theographic Bible Metadata** (open-source graph of biblical people, places, events, timelines, and lat/lng geocoding).
  * **Grounding Commentaries:** Public-domain corpora (NET translator notes, Jamieson-Fausset-Brown, Keil & Delitzsch, Matthew Henry, Calvin) indexed for Passage Guide and AI RAG citations.

---

## 3. Universal Core Reading Engine & Habit Mechanics

### 3.1 Multi-Translation & Parallel Reader Framework

* **Structured Verse Rendering (No Flat-Text Loss):** Verses are stored as structured span JSON (`content_json`) alongside `plain_text`, preserving section headings, paragraph breaks, poetic indentation (Psalms/Prophets), red-letter words of Christ, and inline footnote markers.
* **Parallel Column Rendering:**
  * *Mobile (Android):* Two-tap header version switcher + slide-up quick-compare drawer across installed translations.
  * *Tablet (iPad) & Desktop:* Up to **4 parallel columns** with synchronized verse-by-verse scrolling and alignment.
* **Instant Offline Search:** Powered by SQLite **FTS5** (`verses_fts`), supporting phrase queries, book/testament filters, and Strong’s ID search.

### 3.2 Audio Narration & Ambient Sound Engine

* **Synchronized Narration & Verse Highlighting:** Real-time verse highlighting synced to timestamped audio playback (starting with BSB audio and optional Bible Brain / local TTS fallback).
* **Playback & Voice Controls:** Variable speed (`0.8x` to `2.0x`), narrator/dramatized track selection (when available), and native OS lock-screen / Bluetooth media controls.
* **Dual-Track Ambient Sound Mixer:** Optional background acoustic layers (calm piano, rain, gentle ambient pads) mixed independently via native audio channels with separate volume sliders and a configurable **sleep timer**.

### 3.3 Unobtrusive Habit Mechanics & Focus Modes

* **Distraction-Free Focus Mode:** Hides all toolbars, badges, and secondary panels—leaving only clean typography and generous margins.
* **Enforced Daily Pacing (Manna Model):** Optional reading plan mode that presents only today’s assigned passage, gently locking subsequent chapters until completed to prevent binge-reading burnout.
* **Kind Habit Mechanics:** Optional non-punitive daily streaks, gentle local notifications, and Android/iPadOS home-screen widgets showing today’s verse and reading progress.

---

## 4. Deep Exegetical & Power-User Research Module

### 4.1 Original Language & Linguistic Analysis Suite

* **Clickable Strong’s Concordance & Interlinear View:** Tapping any word opens its underlying Strong’s number (`G26`, `H430`), transliteration, Greek/Hebrew lemma, English gloss, and concise definition.
* **Morphological Tagging & Grammatical Parsing:** Full grammatical breakdown (part of speech, tense, voice, mood, case, gender, number) shown in bottom sheets (mobile) or hover popovers (iPad/desktop).
* **Lexicon & Word Study Suite:** Full semantic ranges, root derivations, and **instant biblical frequency statistics** (e.g., *"Agapē occurs 116 times in the NT; 75 in Paul"*), powered by the normalized `interlinear_tokens` table.
* **Syntactical Diagrams:** Visual clause-structure and conjunction trees rendered natively via Skia/SVG for studying complex epistolary arguments (e.g., Romans, Ephesians).

### 4.2 Automated Contextual Dossier Engines

* **Automated Passage Guide:** One-click report for any passage compiling weighted TSK cross-references, public-domain commentary excerpts, literary genre classification, and historical setting summaries.
* **Factbook Entity Dossier:** Clicking any named person, place, event, or theological topic opens a dossier (backed by Theographic Bible Metadata) with biblical occurrences, dictionary articles, interactive maps, and timeline placement.
* **Grounded AI Exegetical Assistant ("Smart Synopsis"):**
  * Synthesizes commentary literature and explains difficult syntax.
  * **Enforceable Grounding:** Queries only retrieved commentary chunks via RAG, attaches **inline source citations** to every claim, outputs an explicit *"Not covered in available sources"* fallback when evidence is absent, and lets the user filter by **theological tradition** (e.g., Historical-Grammatical, Reformed, Wesleyan, Broadly Evangelical).

### 4.3 Interactive Inductive Bible Study Tooling

```
[ Inductive Workflow ]
       │
       ├─► 1. OBSERVATION    ──► Symbolic highlights, 5 Ws & H sidebar, structural lists
       │
       ├─► 2. INTERPRETATION ──► Genre/context callouts, split-screen personal paraphrase
       │
       └─► 3. APPLICATION    ──► Verse -> Truth -> Need -> Intent -> Checkup reminder
```

1. **Observation Tools:** Custom symbolic highlight palettes (key terms, God/Christ references, transition connectors like *therefore/because/if-then*, lists) + guided **5 Ws & H** checklist notes.
2. **Interpretation Tools:** Automatic literary genre & historical context callouts + a **Personal Paraphrase Workspace** (split-screen editor where users rewrite the passage in their own words before viewing commentaries).
3. **Application Tools:** Guided 5-step card (**Verse → Truth → Need → Intent → Checkup**), with Checkup scheduling a local notification or calendar reminder.

---

## 5. Zero-Friction Scripture Prayer & Verse Pooling Engine

The defining core of the application: turning reading seamlessly into sustained, structured prayer.

### 5.1 "Tap-to-Capture" Verse Pooling Subsystem

* **One-Tap Quick Capture:** Selecting any verse or multi-verse/cross-chapter range reveals a persistent floating action bar with **"Add to Prayer Pool"**.
* **Categorized Prayer Pools:** Predefined and custom categories: *Anxiety & Peace, Guidance & Wisdom, Thanksgiving, Family & Marriage, Financial Trust, Health & Healing,* or custom lists.
* **Optional Shared Church / Small Group Pools:** A pool can be toggled as **Shared** (`share_code`), allowing small group or church members to subscribe to a shared Sunday Sermon or Weekly Prayer Pool while keeping their personal reflections private.
* **Metadata & Context Retention:** Every captured item retains its canonical range (`start_verse_id`–`end_verse_id`), translation, date captured, and personal notes, with one-tap expansion to read the surrounding chapter.

### 5.2 Prayer Pool Lifecycle, Rotation & Answered Prayers

To prevent Prayer Pools from becoming an overwhelming backlog:
* **Smart Session Rotation:** Tracks `last_prayed_at` and `pray_count` per item. Users can launch a **"5-Minute Prayer Session"** that automatically surfaces the 3–5 least-recently-prayed verses in a pool.
* **Answered Prayer / Testimony State:** Alongside `is_archived`, users can mark any item as **Answered** (`answered_at`) and attach a **Testimony Note**, building a personal record of faithfulness.
* **Custom Prayer Deck Player:** Full-screen, low-distraction swipeable card deck with large typography and ambient dark mode.

### 5.3 Prayer Generation & Classic/Contemporary Frameworks

* **Dual-Mode Prayer Prompt Generator:**
  * **AI-Assisted Mode:** Converts the captured passage into a reverent, second-person direct-address prayer preserving doctrinal intent.
  * **Offline / Non-AI Template Mode:** Deterministic, zero-API structured prayer templates for users who prefer keeping AI completely out of their devotional life.
* **Four Built-In Guided Prayer Engines:**
  1. **Lectio Divina Monastic Engine:**
     * *Lectio* (slowly read 2–3×) → *Meditatio* (isolate a resonating phrase) → *Oratio* (typed/spoken prayer response) → *Contemplatio* (1–3 minute silent timer with gentle chime).
  2. **The 3 R’s Method:** Interactive tri-card flow (**Rejoice** in God’s character/promises → **Repent** of misaligned attitudes → **Request** grace to obey).
  3. **ACTS Model:** Structured 4-phase flow (**Adoration → Confession → Thanksgiving → Supplication**) anchored in the selected passage.
  4. **Interactive Breath Prayer Engine:** Visual 120Hz animated breathing ring pairing short two-part Scriptural phrases with timed **Inhale (2–4s)** and **Exhale (4–6s)** cues (e.g., Psalm 46:10, 2 Cor 12:9, Rom 8:38–39, 1 John 4:18, Phil 4:7).

### 5.4 Client-Side Privacy & E2EE for Personal Prayers

Because **Repent**, **Confession**, and **Oratio** entries contain deeply personal reflections—and church members may share a Supabase backend—privacy is built in by default:
* **Client-Side AES-GCM Encryption:** Personal fields (`body_encrypted`, `user_notes_encrypted`, `journal_encrypted`, `testimony_encrypted`) can be encrypted on-device using a user-held passphrase/key before syncing, so even the database administrator cannot read private prayer notes.
* **Explicit AI Opt-In:** Personal prayer notes are **never** sent to an LLM unless the user explicitly invokes an AI action on a specific card.

---

## 6. Technical Architecture, Database Schemas & AI Blueprint

### 6.1 Canonical Reference & Versification Convention

All verse references use a 32-bit canonical integer **`BBCCCVVV`**:
* `BB` = Book number (`01`–`66`), `CCC` = Chapter (`001`–`150`), `VVV` = Verse (`001`–`176`).
* Example: **Romans 8:28** = `45008028`; **Isaiah 52:13–53:12** = `start_verse_id: 23052013`, `end_verse_id: 23053012`.
* This cleanly supports **cross-chapter ranges**, fast integer range queries, and deterministic sorting.

### 6.2 Static Content Database Schema (`bible_content.sqlite`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE translations (
    translation_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    license_type TEXT NOT NULL,
    versification TEXT NOT NULL DEFAULT 'protestant',
    has_audio INTEGER NOT NULL DEFAULT 0,
    version TEXT NOT NULL
);

CREATE TABLE verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_code TEXT NOT NULL,
    canonical_verse_id INTEGER NOT NULL, -- BBCCCVVV e.g. 45008028
    book_number INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    plain_text TEXT NOT NULL,
    content_json TEXT NOT NULL, -- Structured spans: headings, poetry, red-letter, footnotes
    CONSTRAINT unq_verse UNIQUE (translation_code, canonical_verse_id),
    FOREIGN KEY (translation_code) REFERENCES translations(translation_code) ON DELETE CASCADE
);
CREATE INDEX idx_verses_canonical ON verses(canonical_verse_id);
CREATE INDEX idx_verses_bcv ON verses(translation_code, book_number, chapter, verse);

CREATE VIRTUAL TABLE verses_fts USING fts5(
    translation_code UNINDEXED,
    canonical_verse_id UNINDEXED,
    plain_text,
    content='verses',
    content_rowid='id'
);

CREATE TABLE interlinear_tokens (
    token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_verse_id INTEGER NOT NULL,
    word_position INTEGER NOT NULL,
    original_word TEXT NOT NULL,
    transliteration TEXT,
    english_gloss TEXT,
    strongs_id TEXT, -- e.g. G26, H430
    lemma TEXT,
    morphology_code TEXT,
    CONSTRAINT unq_token UNIQUE (canonical_verse_id, word_position)
);
CREATE INDEX idx_tokens_strongs ON interlinear_tokens(strongs_id);
CREATE INDEX idx_tokens_lemma ON interlinear_tokens(lemma);
CREATE INDEX idx_tokens_verse ON interlinear_tokens(canonical_verse_id);

CREATE TABLE lexicon_entries (
    strongs_id TEXT PRIMARY KEY,
    language TEXT NOT NULL, -- 'hebrew' | 'aramaic' | 'greek'
    lemma TEXT NOT NULL,
    transliteration TEXT,
    short_definition TEXT NOT NULL,
    full_entry_json TEXT NOT NULL, -- BDB / Thayer / Abbott-Smith structured entry
    occurrence_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cross_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_verse_id INTEGER NOT NULL,
    to_start_verse_id INTEGER NOT NULL,
    to_end_verse_id INTEGER NOT NULL,
    votes INTEGER NOT NULL DEFAULT 0, -- TSK / OpenBible relevance weight
    source TEXT NOT NULL DEFAULT 'TSK'
);
CREATE INDEX idx_xref_from ON cross_references(from_verse_id);

CREATE TABLE factbook_entities (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'person' | 'place' | 'event' | 'topic'
    name TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata_json TEXT NOT NULL -- lat/lng, timeline era, related verse_ids
);
CREATE INDEX idx_factbook_type_name ON factbook_entities(entity_type, name);
```

### 6.3 Synced User Database Schema (`user_data.sqlite` ↔ Supabase PostgreSQL)

All user tables use UUID primary keys, `updated_at` ISO-8601 timestamps, and `deleted_at` soft-delete tombstones for PowerSync reconciliation:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE highlights (
    highlight_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    translation_code TEXT NOT NULL,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    start_offset INTEGER,
    end_offset INTEGER,
    color_hex TEXT NOT NULL,
    symbol_tag TEXT, -- Inductive Observation symbol e.g. 'KEY_TERM', 'GOD_REF', 'TRANSITION'
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX idx_highlights_range ON highlights(start_verse_id, end_verse_id);

CREATE TABLE study_notes (
    note_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'GENERAL', -- 'GENERAL' | 'INDUCTIVE_5WH' | 'PARAPHRASE' | 'APPLICATION'
    title TEXT,
    body_encrypted TEXT NOT NULL, -- Plaintext or client-side AES-GCM ciphertext
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    ink_strokes_json TEXT, -- iPad PencilKit / Skia vector strokes
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX idx_notes_range ON study_notes(start_verse_id, end_verse_id);

CREATE TABLE prayer_pools (
    pool_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL, -- 'ANXIETY' | 'GUIDANCE' | 'THANKSGIVING' | 'FAMILY' | 'FINANCE' | 'HEALING' | 'CUSTOM'
    color_hex TEXT NOT NULL DEFAULT '#3B82F6',
    is_shared INTEGER NOT NULL DEFAULT 0, -- Church / Small Group shared pool
    share_code TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE prayer_pool_items (
    item_id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_verse_id INTEGER NOT NULL,
    end_verse_id INTEGER NOT NULL,
    translation_code TEXT NOT NULL,
    captured_text TEXT NOT NULL,
    user_notes_encrypted TEXT,
    generated_prayer_prompt TEXT,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    pray_count INTEGER NOT NULL DEFAULT 0,
    last_prayed_at TEXT,
    answered_at TEXT,
    testimony_encrypted TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (pool_id) REFERENCES prayer_pools(pool_id) ON DELETE CASCADE
);
CREATE INDEX idx_pool_items_queue ON prayer_pool_items(pool_id, is_archived, last_prayed_at);

CREATE TABLE prayer_session_logs (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pool_id TEXT,
    framework TEXT NOT NULL, -- 'LECTIO_DIVINA' | 'THREE_RS' | 'ACTS' | 'BREATH' | 'DECK'
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    journal_encrypted TEXT,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE reading_progress (
    progress_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
```

### 6.4 TypeScript Domain Interfaces (`packages/core`)

```typescript
export type PrayerCategory =
  | 'ANXIETY'
  | 'GUIDANCE'
  | 'THANKSGIVING'
  | 'FAMILY'
  | 'FINANCE'
  | 'HEALING'
  | 'CUSTOM';

export type PrayerFramework =
  | 'LECTIO_DIVINA'
  | 'THREE_RS'
  | 'ACTS'
  | 'BREATH'
  | 'DECK';

export interface VerseSpan {
  type: 'text' | 'heading' | 'poetry' | 'red_letter' | 'footnote';
  text: string;
  indentLevel?: number;
  footnoteId?: string;
}

export interface Verse {
  translationCode: string;
  canonicalVerseId: number; // BBCCCVVV e.g. 45008028
  bookNumber: number;       // 1 - 66
  chapter: number;
  verse: number;
  plainText: string;
  spans: VerseSpan[];
}

export interface InterlinearToken {
  canonicalVerseId: number;
  wordPosition: number;
  originalWord: string;
  transliteration?: string;
  englishGloss?: string;
  strongsId?: string;       // e.g. 'G26' | 'H430'
  lemma?: string;
  morphologyCode?: string;
}

export interface PrayerPool {
  poolId: string;
  userId: string;
  title: string;
  category: PrayerCategory;
  colorHex: string;
  isShared: boolean;
  shareCode?: string;
  itemsCount: number;
  updatedAt: string;
  deletedAt?: string;
}

export interface PrayerPoolItem {
  itemId: string;
  poolId: string;
  userId: string;
  startVerseId: number;
  endVerseId: number;
  passageReference: string; // Formatted e.g. "Isaiah 52:13-53:12"
  translationCode: string;
  capturedText: string;
  userNotes?: string;       // Decrypted in-memory on client
  generatedPrayerPrompt?: string;
  isEncrypted: boolean;
  prayCount: number;
  lastPrayedAt?: string;
  answeredAt?: string;
  testimony?: string;       // Decrypted in-memory on client
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface BreathPrayerSession {
  title: string;
  passageRef: string;
  inhalePhrase: string;
  exhalePhrase: string;
  inhaleSeconds: number;    // 2-4s
  exhaleSeconds: number;    // 4-6s
}
```

### 6.5 AI Agent Grounding & Privacy Guardrails

1. **Strict RAG Grounding (Smart Synopsis):** Commentary and exegesis prompts receive *only* the passage text + retrieved public-domain commentary chunks. Every claim must cite a chunk ID; if the retrieved chunks do not address a question, the model must respond: *"Not covered in the available commentary sources."*
2. **Prayer Prompt Integrity:** When transforming a verse into a prayer prompt, the system preserves the passage’s theological intent in humble, second-person address to God, and never sends private `user_notes` unless explicitly requested by the user.

---

## 7. Phased Implementation Roadmap

1. **Phase 1: Core Local Engine, Open Texts & Reader (MVP)**
   * Set up monorepo (`packages/core`, `apps/mobile` Expo for Android + iPadOS, `apps/desktop` Tauri).
   * Build `bible_content.sqlite` ingestion pipeline for **BSB, WEB, KJV, NET** + **FTS5** search.
   * Implement responsive single-column (Android) and parallel-column (iPadOS/Desktop) reader with Focus Mode and Manna daily pacing.
2. **Phase 2: Zero-Friction Scripture Praying Module & Sync**
   * Implement `user_data.sqlite` + **PowerSync / Supabase** sync with client-side AES-GCM encryption.
   * Build Tap-to-Capture floating bar, Prayer Pools, Smart Session Rotation, Answered Prayer testimonies, and Shared Church Pools.
   * Build **Lectio Divina**, **3 R’s**, **ACTS**, **Custom Prayer Deck**, and **120Hz Breath Prayer** UI.
3. **Phase 3: Exegetical Suite, Audio & Inductive Tooling**
   * Import **STEPBible (TAHOT/TAGNT)**, **BDB/Thayer/Abbott-Smith**, **TSK cross-references**, and **Theographic Factbook** data.
   * Build Strong’s/morphology popovers, Passage Guide, Factbook dossiers, Inductive Marking + iPad Apple Pencil ink, and Audio + Ambient Sound mixer.
4. **Phase 4: Grounded AI Assistant & Desktop Polish**
   * Deploy RAG-grounded Smart Synopsis & AI Prayer Prompt generator with theological tradition filters.
   * Polish multi-window desktop docking, keyboard shortcuts, and optional web companion for church members.
