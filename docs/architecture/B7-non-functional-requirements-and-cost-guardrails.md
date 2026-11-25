# B7: Non-Functional Requirements (NFRs) & Cost Guardrails

**Document ID:** `B7`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-24`  
**Related Docs:** `B1`, `B3`, `B4`, `B6`, `B8`, `D1`, `F1`

## Purpose & Scope

Defines measurable budgets for performance, animation frame pacing, storage, memory, offline reliability, security latency, and monthly infrastructure cost for **Breath & Word v1**.

## Audience

Developer, AI coding partner, and performance test scripts (`F1`). Any PR regressing a P0 budget below is blocked from release.

## Body

### 4.1 Performance & Rich Animation Budgets

| Metric | Target (p95) | Hard Ceiling | Measurement Condition |
| --- | :---: | :---: | --- |
| **Cold Start to Readable Chapter** (Android / iPadOS) | `< 1,200 ms` | `1,800 ms` | Mid-range Android (Snapdragon 6/7-series) with `core_bsb` attached |
| **Cold Start to Readable Chapter** (Tauri Desktop) | `< 700 ms` | `1,200 ms` | Windows 11 / macOS SSD |
| **Chapter Navigation / Render** (e.g., Psalm 119 — 176 verses) | `< 32 ms` | `60 ms` | Virtualized `FlashList` / `@tanstack/react-virtual` |
| **Offline FTS5 Search (`verses_fts`, 31,102 verses)** | `< 25 ms` | `50 ms` | Phrase query (`"steadfast love"`) on mobile `op-sqlite` & desktop `rusqlite` |
| **Interlinear / Strong's Tap Popover** | `< 30 ms` | `60 ms` | Indexed lookup on `verse_word_alignments` + `interlinear_tokens` + `lexicon_entries` |
| **Parallel Column Scroll Sync (2–4 Columns)** | `60 / 120 fps` | `0 dropped frames/sec` | Native/UI-thread synchronized verse offsets |
| **Breath Prayer Ring & Swipe Deck Animation** | `120 Hz` (`8.3 ms` frame) | `60 Hz` (`16.6 ms`) on 60Hz screens | Reanimated UI worklet + Skia; zero JS-thread bridge chatter during animation |
| **Stylus Ink Latency (iPad Apple Pencil / Skia)** | `< 16 ms` | `24 ms` | Direct Skia canvas stroke commit |
| **E2EE Vault Unlock (`PBKDF2-SHA256`, 600k iter)** | `< 350 ms` | `600 ms` | Native C++/Rust crypto (`react-native-quick-crypto` / WebCrypto) |
| **E2EE Single Row Encrypt / Decrypt (`AES-256-GCM`)** | `< 2 ms` | `5 ms` | Typical 2 KB study note |
| **Volatile In-Memory Note Search (2,000 notes)** | `< 15 ms` | `35 ms` | `MiniSearch` over unlocked decrypted entries |
| **Audio Verse Highlight Sync Drift** | `± 150 ms` | `± 250 ms` | Compared against `audio_verse_timestamps.start_ms` |

### 4.2 Storage, Bandwidth & Memory Budgets

| Resource | Budget | Enforcement Mechanism |
| --- | --- | --- |
| **Initial Binary Size** (Android APK / iPadOS IPA / Desktop Installer) | `≤ 45 MB` (Mobile), `≤ 25 MB` (Tauri) | Keep large exegesis/study packs out of binary (`ADR-005`); bundle only `core_bsb` (~9 MB gz) + ambient loops (~3 MB). |
| **Default Audio Cache Cap** | `250 MB` (User configurable: `100 MB`–`4 GB`) | LRU eviction in `audio_cache_entries` (`is_pinned = 0` evicted first). |
| **Peak Client RAM (Active Multi-Pane Study + Unlocked Vault)** | `≤ 250 MB` (Mobile/iPad), `≤ 350 MB` (Tauri) | Stream packs via disk-backed SQLite/rusqlite; never load full Bible JSON into JS heap. |
| **Local Write Durability** | `0%` data loss on crash/kill | SQLite `WAL` journal mode (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`). |

### 4.3 Availability, Sync & Cost Guardrails

| Category | Requirement |
| --- | --- |
| **Offline Availability** | **100%** for reading, FTS5 search, highlights, notes, Prayer Pools, offline prayer templates, Breath Prayer, installed exegesis packs, and pinned audio. |
| **Sync Convergence SLO** | Online edits across devices converge via PowerSync within `< 3 seconds` p95 (network permitting). |
| **Monthly Operating Cost Ceiling (Personal + Small Church, ≤250 users)** | **`$0 – $5 / month`** target: Supabase Free ($0), PowerSync Free ($0), Cloudflare R2 Free 10 GB / $0 egress ($0), BYOK LLM ($0) or Gemini Flash shared quota (<$5/mo capped via 30 req/day/user hard limit). |

## Acceptance / Done Criteria

- Automated benchmark script in `packages/core` asserts FTS5 p95 <50ms, PBKDF2 <600ms, and AES-GCM <5ms in CI/device checks.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` Target baseline hardware is Android 11+ (≥4 GB RAM), iPadOS 16+ (Apple Pencil 1/2/Pro), Windows 11, and macOS 13+.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Established measurable latency, 120Hz frame, storage, RAM, WAL durability, and $0–$5/mo cost budgets.

## Traceability

- Upstream: `A7` (`CON-01`, `CON-02`), `B1`, `B3`, `B8`. Downstream: `D1`, `E4`, `F1`.
