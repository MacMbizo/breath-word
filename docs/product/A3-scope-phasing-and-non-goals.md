# A3: Scope, Phasing & Non-Goals

**Document ID:** `A3`  
**Version:** `1.1.0`  
**Status:** `Approved`  
**Owner:** Founder  
**Last Updated:** `2026-11-28`  
**Related Docs:** `A1`, `A2`, `A7`, `B8`, `E2`

## Purpose & Scope

Defines hard delivery boundaries across **Phases 1–4** and **v1.1+**, plus explicit **Non-Goals** to prevent solo-developer scope creep.

## Audience

Founder and AI coding partner. Consult before adding any library, table, or UI feature not listed in the active phase.

## Body

### 4.1 Phased Delivery Matrix

| Phase | Milestone Name | Included Features (`A2`) | Target Platforms | Exit Gate (Definition of Shippable) |
| --- | --- | --- | --- | --- |
| **Phase 1** | **Core Local Reader MVP** | `FR-101`, `FR-102`, `FR-103`, `FR-104`, `FR-105` + `tools/pack-builder` (`core_bsb`, `trans_web`, `trans_kjv`) | Android, iPadOS, Desktop (basic) | 48h spike passed; BSB pack built & verified; offline reader + parallel compare + FTS5 + Focus Mode usable daily by founder. |
| **Phase 2** | **Scripture Prayer & E2EE Sync** | `FR-201`, `FR-202`, `FR-203`, `FR-204` (offline templates), `FR-205` (all 4 prayer engines), `FR-206`, `FR-107` | Android, iPadOS, Desktop | Offline edits sync via PowerSync across Android + iPad + Desktop; E2EE vault + Recovery Key passes crypto test suite; Shared Church Pool tested with ≥2 accounts. |
| **Phase 3** | **Exegesis, Inductive, Ink & Audio** | `FR-301`, `FR-302`, `FR-303`, `FR-304`, `FR-305`, `FR-106` + ETL for `exegesis_step` & `study_refs` packs | Android, iPadOS, Desktop | Tap-to-Strong's, BDB/Thayer lexicon, TSK Passage Guide, Theographic Factbook, Inductive 5-step + Skia Ink, and synchronized BSB audio + ambient mixer ship cleanly. |
| **Phase 4** | **Scripture Signals & Promise Prayer** | `FR-501`–`FR-507` + ETL for the `study_signals` pack from attributed public-domain compilations | Android, iPadOS, Desktop | Signals overlay, pills and named collections, circumstance index, "Pray this promise", daily promise and personal signals work offline on Android + iPad + Desktop; every curated mark names its source; personal signals sync E2EE. |
| **Phase 5** | **Grounded AI & Studio Polish** | `FR-401`, `FR-204` (AI mode), `FR-402`, `FR-403` + `commentary_pd` pack | Android, iPadOS, Desktop, Web | RAG Smart Synopsis passes hallucination/citation test suite; Desktop `dockview` + shortcuts + Web Companion live for small church group. |
| **v1.1+** | **Post-v1 Roadmap** | Syntactical Clause Diagrams (Clear-Bible Macula treebanks), Collaborative Church Prayer Requests/Comments, USFM/OSIS BYO local pack importer, iOS/Android Home Screen Widgets, UI i18n. | All | Scheduled only after Phase 5 stability & real church usage feedback. |

### 4.2 Explicit Non-Goals (Out of Scope for v1)

1. **No Public Social Network / Algorithmic Feed:** No global public profiles, likes, follower counts, or community comment feeds. Sharing is strictly invite-only via `share_code`.
2. **No Proprietary Publisher Licensing Negotiations in v1:** No bundled NIV, NLT, CSB, or NASB. (ESV is strictly user-supplied personal API key with ephemeral caching per Crossway rules.)
3. **No Freehand Drawing Directly Over Reflowing Bible Paragraphs:** Ink is strictly attached to portable `ink_canvases` per verse/note (`ADR-003`).
4. **No Server-Side Plaintext Storage of E2EE Notes:** Zero server-side search, indexing, or AI scanning over encrypted user reflections (`ADR-004`).
5. **No Full Offline Content Pack Downloads in Web Companion:** Browser companion serves lightweight read/prayer flows; full offline multi-pack exegesis requires the native Android, iPadOS, or Tauri Desktop apps.
6. **No Custom CRDT Sync Engine:** All sync relies strictly on PowerSync + Supabase PostgreSQL (`ADR-002`).

## Acceptance / Done Criteria

- No Phase 2–5 tasks are started until the preceding Phase Exit Gate passes all acceptance checks.

## Open Questions

- None.

## Assumptions

- `ASM-02` (`A7`): Church group beta begins after Phase 2 (Prayer Pools + Sync) or Phase 5 (Web Companion).

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Locked Phase 1–4 boundaries, v1.1 deferrals (Syntax Trees, BYO importer, Widgets), and Non-Goals.
- `1.1.0` | `2026-11-28` | Claude | Owner decision: new Phase 4 **Scripture Signals & Promise Prayer** (`FR-501`–`FR-507`); former Phase 4 (Grounded AI & Studio Polish) becomes Phase 5. Phase 4 starts after the Phase 3 exit gate.

## Traceability

- Upstream: `A1`, `A2`, `A7`. Downstream: `B3`, `E2`, `F1`.
