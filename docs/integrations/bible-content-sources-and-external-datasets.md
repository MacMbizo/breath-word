# Bible Content Sources & External Datasets (Research Catalog)

**Document ID:** `EXTRAS-SRC`  
**Version:** `0.1.0`  
**Status:** `Draft — Research / Pre-Approval`  
**Last Updated:** `2026-11-27`  
**Related Docs:** `A3`, `B4`, `B5`, `G1`, source: `extras.md` (root)

## Purpose & Scope

Catalogs every external Bible API, downloadable dataset, lexicon, commentary,
geodata, topical index, and audio/format resource surveyed in `extras.md`, so
the team can evaluate what to adopt, mirror, or reject against the existing
`B4` content-pack architecture and `B5` licensing matrix.

**Scope guardrail:** This is a research catalog, not an approved spec. Nothing
here may enter `tools/pack-builder` or the app until reviewed against `B5`
licensing terms and `A3` phase boundaries.

## Audience

Founder, AI coding partner (`tools/pack-builder`), and anyone evaluating
additional scripture or study-content sources.

## Body

### 1. Online Bible APIs

#### 1.1 APIs Requiring a Free Key

| Provider | Access / Limits | Translations & Content | Fit for Breath & Word |
| --- | --- | --- | --- |
| **API.Bible** (`api.bible`) | Free Starter key: ~5,000 calls/month, non-commercial; up to 3 copyrighted translations chosen at registration | NIV, NLT, NASB/NASB20, NKJV, CSB, AMP, MSG, GNT, CEV + public-domain texts | Candidate for a **BYO-API runtime path** (like the existing ESV ephemeral-cache pattern) rather than bundled packs. Per-translation commercial licensing required for any paid app. |
| **Crossway ESV API** (`api.esv.org` / `api.v3.esv.org`) | Free key: 5,000 queries/day, 1,000/hr, 60/min; max 500 verses or half a book per query | ESV text | **Already covered by `B5 §4.1`** — strict no-bundle rule, ephemeral cache ≤7 days, 500-verse cap. |
| **YouVersion Platform** (`platform.youversion.com`) | Free developer key + SDK | Publisher-approved Bible versions, user features | Potential alternative/distribution channel; evaluate SDK terms before any v1.1+ consideration. |
| **Biblia.com API** (`bibliaapi.com`) | New public registrations **closed**; existing keys only | Datasets, lemmas, morphological data, parallel alignments | Monitor only; not usable for new builds unless a key is obtained. |

#### 1.2 Keyless / Open APIs

| Provider | Access / Limits | Translations & Content | Fit for Breath & Word |
| --- | --- | --- | --- |
| **Free Use Bible API** | No key, no usage limits; bulk JSON/SQLite downloads | BSB, WEB, KJV, ASV, Reina-Valera 1909, Luther Bibel + public-domain audio endpoints | Strong candidate as an **alternate ETL upstream** for `trans_*` packs; verify data quality vs. current USFM sources. |
| **bible-api.com** | No key; 15 req / 30 s per IP | Default WEB; append params for translation notes & cross-references | Useful for quick lookups/prototyping; rate limit makes it unsuitable as a production runtime dependency. |
| **WLDeh Bible API** (`github.com/wldeh/bible-api`) | No auth; JSON via jsDelivr CDN | Verses, chapters, versions | Inspection source for how public JSON APIs serve content; not a primary ETL. |

#### 1.3 Specialized Study-Suite APIs

| Provider | Access | Content | Fit |
| --- | --- | --- | --- |
| **Digital Bible Platform (FCBH / Faith Comes By Hearing)** | Free key for non-commercial ministry apps | Synchronized audio, audio commentaries, Jesus Film video segments in thousands of languages | Overlaps existing `exegesis_step` / audio plans; strong v1.1+ candidate for multi-language audio packs. |
| **Biblia.com / Faithlife** | Restricted keys | Dictionaries, lemma search, morphology, parallel alignment | Same as above — registration closed. |

### 2. Original-Language & Lexicon Resources

| Resource | Format / Access | Content | Fit |
| --- | --- | --- | --- |
| **The SWORD Project (CrossWire)** | Open-source engine + module framework (not REST) | Strong's Numbers, Robinson morphology, Codex Sinaiticus, Septuagint, NestleAland GNT, hundreds of free modules | Potential **v1.1+ BYO local module importer** backend; heavy native dependency — evaluate against pure-TS `packages/core` purity rule. |
| **OpenGNT API / `eliranwong/OpenGNT`** | Free open database + repo framework | Greek NT: word parsing, clause structures, literal-translation maps, lexicon | Candidate to extend `exegesis_step` pack beyond STEPBible TSVs; verify coverage vs. TAGNT. |
| **`openscriptures/morphhb`** | Open dataset | Morphologically analyzed Westminster Leningrad Codex (Hebrew OT) + Strong's defs | Candidate to enrich Hebrew parsing in `exegesis_step`; check overlap with STEPBible TAHOT before duplicating. |

### 3. Commentaries & Cross-References (Beyond Current `study_refs`)

- **Treasury of Scripture Knowledge (TSK)** via Free Use Bible API — ~500k cross-references; **already planned** in `B5 §4.1` (`study_refs` pack).
- **Matthew Henry's Concise Commentary** — verse-by-verse public-domain devotional; candidate for `commentary_pd` pack (Phase 4), alongside JFB, Keil & Delitzsch, Calvin already listed in `B5`.
- **bible-api.com cross-reference / translation-note params** — keyless REST extras; same rate-limit caveat as §1.2.

### 4. Downloadable Database Repositories (Offline-First ETL Sources)

| Repository | Content | Notes |
| --- | --- | --- |
| **`scrollmapper/bible_databases`** | Clean SQL/CSV/JSON for dozens of translations | Cross-check schema against `B4` verse tables; verify licensing per translation. |
| **`beandog/bible-sqlite`** | Pre-built SQLite for major public-domain translations | Fast prototyping source; validate `BBCCCVVV` verse-ID coverage. |
| **`fofgof/Bible-Database`** | XML/SQL, multilingual | Useful for future i18n packs (v1.1+). |
| **`vscandura/python-bible`** | Python reference parser, verse counts, integer IDs | Backend-side reference parsing reference implementation. |
| **`nebulas/bible-reference`** | Go parsing/normalization lib | Alternative to `bcv-parser` for non-JS tooling. |

### 5. Structural Metadata & Verse Alignment

| Resource | Purpose | Fit |
| --- | --- | --- |
| **The Word v11n (versification mapping)** | Maps differing chapter/verse numbering across traditions (Protestant vs. Septuagint/Orthodox Psalms) | **Already partially covered** by `versification_maps` in `B4`; evaluate The Word v11n files as an authoritative upstream dataset. |
| **Clear-Bible Macula Greek & Hebrew** | Syntactic trees, morphological + discourse annotation (SBLGNT, Nestle 1904, WLC) | **Already deferred to v1.1+** per `A3 §4.1` (Syntax Trees). Confirms scheduling; data is CC-licensed — verify exact SPDX for `B5` update. |
| **Clear-Bible `textual-variants`** | Manuscript variance maps (Byzantine vs. Alexandrian) | Enables future "textual variants" study feature; v1.1+ candidate, needs new pack type. |

### 6. Spatial, Chronological & Historical Data

- **OpenBible.info Geocoding Dataset** — lat/lng + ancient/modern names for every biblical location (GeoJSON/JSONL/KML). Directly feeds `factbook_entities` place data already planned via Theographic (`B5`); evaluate as complementary or replacement.
- **Pleiades Gazetteer** (NYU ISAW) — weekly CSV/JSON/RDF of ancient cities, roads, empires. Strong backbone for historical-map features; v1.1+.
- **OpenBible.info chronological datasets** — events ↔ dates ↔ intervals for timeline UI; v1.1+.
- **Jesus Film Project API** — free developer keys, chapter/verse-aligned film clips in hundreds of languages. Complements FCBH audio/video; evaluate licensing for app-store distribution.

### 7. Thematic / Topical Indices

- **OpenBible.info Topical Bible Mashup** — ~10,000 topics ↔ ~300,000 verses, crowd-sourced. Enables instant topical search ("verses about anxiety") beyond FTS5 keyword match; candidate pack for Phase 3+ study features.
- **Nave's Topical Bible** (in `scrollmapper` network) — classic thematic index, SQL/JSON. Overlaps with OpenBible topical data; pick one primary source to avoid duplication.

### 8. Liturgical & Reading-Plan Engines

- **Lectionary cores** (e.g., Ben Schwarz Lectionary) — Revised Common Lectionary, BCP calendar data for date-driven daily readings.
- **Word-count reading-plan generators** (e.g., Piersy) — distribute reading by word count rather than chapters. Candidate for a "reading plan" feature; not in current `A2` scope — requires `A2`/`A3` amendment before build.

### 9. Interchange Formats & Parsing Tools

| Format / Tool | Role | Fit |
| --- | --- | --- |
| **USFM** | Global translator/publisher standard (markdown-like tags) | Already assumed as ETL input in `B5 §4.1`; `ubsicap/usfm-grammar` (tree-sitter) validates/converts USFM → JSON/AST for `tools/pack-builder`. |
| **OSIS** | Multi-tier XML standard interleaving text, Strong's, morphology, parallel versions | Alternative ingestion format; relevant to **v1.1+ BYO importer** (deferred in `A3`). |
| **`openbibleinfo/Bible-Passage-Reference-Parser` (bcv-parser)** | JS/TS reference parsing: "1 Jn 3:1", "First John 3.1" → structured ranges | **High-priority adoption candidate** — pure JS, MIT-licensed, directly usable in `apps/*` and `packages/core` (pure TS) for search/reference input. |
| **`vscandura/python-bible`** | Python-side parsing, verse counts, integer ID arrays | For `tools/pack-builder` (Python) pipelines. |
| **`interedition/collatex`** | Word-level alignment/collation engine for comparing textual witnesses | Enables translation-diff highlighting; v1.1+ feature, needs structured verse pairs. |

### 10. Audio, Accessibility & Formatting Metadata

- **Aeneas force-alignment (`readbeyond/aeneas`)** — auto-generates word/verse-level audio↔text timestamps for karaoke-style highlighting. **Already anticipated** in `B5` for BSB audio timestamp gap (`[OPEN]` item); this confirms the tool choice.
- **ESV / API.Bible typography flags** — `include-footnotes`, `include-headings`, `include-words-of-jesus-in-red`, `output-format=html`. Relevant if a BYO-API runtime path is added; must map HTML classes into design tokens (`D1`) — never render raw third-party CSS.
- **Semantic search / embeddings** — pre-tokenized JSON + vector embeddings (OpenAI/HF) for concept-based search ("holy spirit" → "Comforter"). **Tension with `B6` zero-knowledge/privacy posture** — any embedding pipeline must stay on-device or respect E2EE boundaries; flag for architecture review before adoption.

## Open Questions

- Which sources, if any, become **approved `B5` matrix rows** vs. remain research-only?
- Does Free Use Bible API data provenance satisfy `pack-builder` attribution requirements as cleanly as current USFM sources?
- Should `bcv-parser` be adopted into `packages/core` now (pure TS, zero deps beyond its own bundle) or deferred until a reference-input feature is scheduled?
- Licensing/SPDX for Macula datasets and OpenBible topical data needs verification before any pack build.

## Change Log

- `0.1.0` | `2026-11-27` | Devin | Initial catalog distilled from `extras.md`.

## Traceability

- Source: `extras.md` (root, unstructured research notes).
- Downstream consumers: `B5` (licensing matrix updates), `B4` (pack schemas), `A2`/`A3` (feature scope decisions), `G1` (index registration pending).
