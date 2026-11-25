# A1: Problem Statement & Vision

**Document ID:** `A1`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A2`, `A3`, `A7`, `B1`, `G1`

## Purpose & Scope

Establishes the product mission, target personas, problem definition, and core value pillars for **Breath & Word v1**. Excludes granular functional specs (`A2`) and technical stack details (`B1`, `B8`).

## Audience

Founder, AI coding partner, and church beta testers. Use this document to resolve product trade-offs whenever UX simplicity competes with feature density.

## Body

### 4.1 Problem Statement

Modern digital Bible tools are fractured across two incompatible paradigms:

1. **Consumer devotional apps** (YouVersion, Dwell, Manna) excel at mobile habit loops and audio narration, but lack rigorous exegetical tooling (original-language parsing, morphological frequency, inductive workflows) and often introduce social/algorithmic clutter.
2. **Academic research suites** (Logos, Accordance, Olive Tree) deliver deep linguistic and commentary tools, but impose heavy desktop-first interfaces, high licensing costs, and steep learning curves—and provide no structured workflow to turn Bible reading into sustained personal prayer.

**Core Pain Point:** A believer who wants to *read Scripture deeply*, *study it accurately* (offline, on Android, iPad, or Desktop), and *pray it personally* (individually or with a small church group) must juggle 3–4 separate apps, copy-pasting verses into insecure notes apps where prayers are quickly forgotten.

### 4.2 Vision Statement

**Breath & Word** unites serene daily Scripture reading, Logos-grade open-data exegetical study, and a **zero-friction Scripture Praying Engine** into a single local-first, privacy-respecting application—designed to feel like a calm physical study Bible on Android phones, an Apple Pencil study desk on iPadOS, and a multi-pane research studio on Desktop.

### 4.3 Three Product Pillars

1. **Unobtrusive Daily Reading & Audio:** Clean, structured typography (poetry, headings, red-letter, footnotes), offline multi-translation comparison, non-punitive Manna daily pacing, and dual-track synchronized audio + ambient soundscapes.
2. **Open-Data Exegetical & Inductive Depth:** Instant offline Strong's/interlinear lookup, morphology, lexicons, TSK cross-references, Theographic Factbook dossiers, Inductive Study tooling (Observation/Interpretation/Application + portable stylus ink), and citation-enforced RAG commentary synthesis.
3. **Zero-Friction Scripture Praying Engine:** One-tap verse capture into categorized or shared church Prayer Pools, smart rotation so no prayer stagnates, answered-prayer testimony tracking, four built-in guided prayer frameworks (*Lectio Divina*, *3 R's*, *ACTS*, *120Hz Breath Prayer*), and optional zero-knowledge client-side E2EE for private confession/prayer journals.

### 4.4 Primary Personas

| Persona | Primary Devices | Core Jobs-to-Be-Done | Privacy & Offline Needs |
| --- | --- | --- | --- |
| **Daily Devotional Reader** | Android Phone | Read today's paced passage, listen with ambient rain, tap-to-capture a comforting verse, run a 5-min Breath Prayer or Deck session. | Offline commute reading; private E2EE confession notes. |
| **Deep Student / Small-Group Leader** | iPadOS (Apple Pencil) + Desktop (Win11/macOS) | Compare 2–4 translations, inspect Greek/Hebrew lemmas & cross-refs, complete Inductive 5Ws+H & ink sketches, curate a Shared Church Pool for Sunday. | Instant offline search; multi-pane research workspace. |
| **Church / Small-Group Member** | Android Phone / Web Companion | Join a leader's Shared Prayer Pool via 8-char code, pray through the week's Scriptures on rotation, record personal reflections & answered testimonies privately. | Zero friction onboarding; private notes invisible to church admin. |

## Acceptance / Done Criteria

- Every feature in `A2` maps directly to at least one of the three pillars in §4.3.

## Open Questions

- None (all strategic questions resolved in `A7`).

## Assumptions

- `ASM-01` (`A7`): App must deliver full reading/study value even in offline-only guest mode without requiring account creation.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Extracted and normalized from `SPECIFICATION.md`.

## Traceability

- Upstream: `SPECIFICATION.md`. Downstream: `A2`, `A3`, `D1`, `D3`.
