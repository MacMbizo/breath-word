# Advanced Study Feature Candidates (Research Backlog)

**Document ID:** `EXTRAS-FEAT`  
**Version:** `0.2.1`  
**Status:** `Draft — Research / Pre-Approval`  
**Last Updated:** `2026-11-27`  
**Related Docs:** `A2`, `A3`, `B4`, `B5`, `B6`, `D1`, `G1`, source: `extras.md` (root)

## Purpose & Scope

Captures the **new feature concepts** surveyed in `extras.md` — theological
text classification, structural metadata, comparison/collation tooling,
audio-sync UX, and semantic search — distilled into build-ready ideas mapped
against the existing `A2` requirements and `A3` phase boundaries.

**Scope guardrail:** These are *candidates*, not committed scope. Each item
below notes the earliest plausible phase; nothing may be implemented until
added to `A2`/`G5` and scheduled per `A3`.

## Audience

Founder, AI coding partner, and anyone scoping post-MVP study features.

## Body

### 1. Theological Structure Classification Engine

The largest new feature idea in `extras.md`: classifying every verse into
logical categories that describe *what the text is doing* rather than what it
says.

#### 1.1 Category Taxonomy

| Category | Definition | Example phrasing |
| --- | --- | --- |
| **Promise** | Declarative assurance of God's future commitment/blessing/presence | *"I will be with you always..."* |
| **Warning** | Notification of moral cause-and-effect / destructive consequences | *"Do not be deceived; bad company ruins good morals."* |
| **Wisdom** | Sapiential observation of how reality functions (probabilistic, not absolute) | *"A soft answer turns away wrath..."* |
| **Commandment** | Absolute moral/ceremonial/legal imperative | *"You shall love your neighbor as yourself."* |
| **Advice / Exhortation** | Contextual, urgent practical application — typically the *imperative* following an *indicative* | *"Be quick to hear, slow to speak..."* |

Related structural threads also catalogued: **Covenants** (binding frameworks
that parent individual promises), **Precedents & Typologies** (historical
patterns / OT→NT foreshadowing), **Prophecies** (macroscopic future
declarations vs. personal promises), and **Divine Attributes** (the
character-basis anchoring all promises).

#### 1.2 Classification Approaches

- **LLM zero-shot classifier** — prompt template provided in `extras.md`
  returning JSON `{verse_reference, classifications[]}` with
  `confidence_score`, `is_conditional`, `condition_text`, `outcome_text`.
  Must route through the existing `ai-gateway` (`C1`) so private notes are
  never sent unless `includeUserNotes === true` (`B6`).
- **Curated/manual tagging** — public-domain indices (e.g., topical Bibles)
  could seed a `structural_categories` lookup without LLM cost.
- **Hybrid** — deterministic rules for imperatives/conditional "if…then…"
  patterns + LLM for ambiguous sapiential text.

### 2. Database Schema Concepts (to evaluate for `B4`)

`extras.md` proposes three tables. Adaptation notes vs. current architecture:

| Proposed table | Purpose | `B4` adaptation notes |
| --- | --- | --- |
| `verses` (with `bcv_code`) | Core verse text keyed by absolute ID | **Already exists** — our canonical ID is `BBCCCVVV` int + `deleted_at` soft-delete convention applies only to synced tables; static pack tables follow `B4` pack schema instead. |
| `structural_categories` | Category enum lookup | Small static lookup; belongs in a study-content pack (e.g., extend `study_refs` or new `study_structure` pack), not `user_data.sqlite`. |
| `scripture_logic_maps` | The "bridge" table: category ↔ verse, with conditional split (`condition_verse_id`, `condition_text`, `outcome_text`) | Core innovation — enables UI to draw visual links between a Commandment (condition) and its Promise (outcome), possibly across verses. |
| `semantic_connections` | Verse↔verse links typed `Precedent` / `Typology` / `Fulfillment` | Extends the existing `factbook_verse_links` / cross-reference model; candidate fields for `study_refs` pack v2. |

Suggested covering index (from source):
`CREATE INDEX idx_logic_category_verse ON scripture_logic_maps (category_id, source_verse_id) INCLUDE (is_conditional);`

**Privacy note:** This is *static biblical content*, so it belongs in
read-only content packs (`ContentDbAdapter`), never in synced `user_data` —
fully compatible with `B4`'s dual-SQLite split.

### 3. Structural Metadata & Text Comparison Features

| Feature | Source tooling | Phase fit |
| --- | --- | --- |
| **Versification mapping** (Protestant vs. LXX/Orthodox numbering) | The Word v11n datasets | **Phase 3** — `versification_maps` already exists in `B4`; this is a data-source upgrade, not new scope. |
| **Syntax clause diagrams** (original-language trees) | Clear-Bible Macula Greek/Hebrew | **v1.1+** — already deferred in `A3 §4.1`. |
| **Textual variant highlighting** (Byzantine vs. Alexandrian) | Clear-Bible `textual-variants` | **v1.1+** — needs new pack type + diff UI. |
| **Translation collation / diff view** (e.g., NASB vs. NLT word-level) | `interedition/collatex` engine | **v1.1+** — aligns with existing parallel-compare feature (`FR-103`); upgrades it from side-by-side to aligned-diff. |

### 4. Audio, Accessibility & Reader UX

| Feature | Source tooling | Phase fit |
| --- | --- | --- |
| **Karaoke-style word highlighting** synced to audio | `readbeyond/aeneas` force-alignment → `audio_verse_timestamps` | **Phase 3** — directly serves existing BSB audio plan; `B5` already flags the timestamp gap as `[OPEN]`. Aeneas is the named fallback. |
| **Synchronized multi-language audio** | FCBH Digital Bible Platform, Jesus Film API | **v1.1+** — new audio editions per `audio_editions` model; licensing review required. |
| **Typography metadata from BYO APIs** (footnotes, section headings, words-of-Jesus-in-red) | ESV/API.Bible `include-*` flags | Tied to any future BYO-API path; rendered output must map into `@breath-and-word/tokens` (`D1`), never raw provider HTML. |
| **Verse reference parsing** | `bcv-parser` (`openbibleinfo`) | **Phase 1–2 candidate** — pure-JS lib, MIT license; makes search input forgiving ("1 Jn 3:1", "First John 3.1"). Low cost, high UX value. |

### 5. Discovery & Navigation Features

| Feature | Source data | Phase fit |
| --- | --- | --- |
| **Topical search beyond FTS5** (semantic/concept matching) | OpenBible.info Topical Index (~10k topics / ~300k verses), Nave's Topical | **Phase 3+** — new `study_topics` pack; complements rather than replaces FTS5. |
| **Geographic/historical map layer** | OpenBible geocoding, Pleiades Gazetteer, chronological datasets | **v1.1+** — feeds `factbook_entities`; significant new UI surface (maps) — needs `D3` design work. |
| **Daily lectionary** (beyond existing reading plans) | Lectionary cores, word-count plan generators | **v1.1+ or later** — reading plans already exist (`FR-104` Manna Pacing over `reading_plan_days`; Phase 3 ships two generated plans in the `study_refs` pack). Only lectionary-calendar plans would need new `FR-*` requirements. |
| **Semantic/embedding search** ("find verses about X" by concept) | Pre-tokenized JSON + local embeddings | **Requires `B6` review** — must be fully on-device or E2EE-safe; flag before any design. |

### 6. Unfolding Story — Chronological Story Mode

A unified reading view that interleaves parallel and contemporaneous
Scripture passages (e.g., Historical Books + Prophets + Psalms) into a
single, continuous narrative stream with contextual era and character
markers — "so we read the Bible as it actually happened."

Most Bibles organize by literary genre, which separates historical events
from the prophets and psalms written during them. Unfolding Story
automatically weaves parallel books together in chronological order —
pairing David's Psalms with his life in Samuel, and placing prophets like
Isaiah and Jeremiah directly inside the timelines of Kings and Chronicles.
No flipping back and forth — one seamless, connected story.

#### 6.1 Data & Architecture Notes

- Requires a **chronological event index** (passage → era/reign/person
  anchor). Candidate sources: OpenBible chronological datasets, `extras.md`
  references. This is static content → belongs in a read-only study pack
  (`ContentDbAdapter`), not synced tables (`B4`).
- Rendering is a new reader mode, not a new canonical reference scheme —
  `BBCCCVVV` IDs still address every verse; the pack only supplies
  interleaving order and era markers.
- UI needs era/character marker styling from `@breath-and-word/tokens`
  (`D1`) and Reduced Motion fallbacks (`D3`).
- **Phase fit:** likely **Phase 3+**; substantial curation effort before
  any build work.

### 7. Scripture Signals — Thematic Highlights & Study Lenses

A toggleable visual overlay system that categorizes and distinctly styles
Scripture by literary and theological function — **Promise, Warning,
Commandment, Wisdom, Advice, Covenant** — directly on the page, with
subtle, distinct styling that doesn't break reading flow.

- **Pre-curated layer:** classifications from the §1 taxonomy / LLM
  classifier surfaced as non-destructive highlights.
- **User layer:** users can tag passages themselves to build a
  personalized study Bible; user tags are per-user state → synced via
  `user_data.sqlite` with `id` UUID + `deleted_at` (`B4`), fully separate
  from the static classification pack.
- **Category pills are a first-class feature:** tapping a pill such as
  *"Show all Promises in Romans"* or *"Review all Covenants"* turns the
  highlights into a searchable, filterable index — this is what makes the
  feature substantially more valuable than passive coloring. Pill counts,
  empty states, and scroll-to-verse behavior need `D3` design.
- Overlay rendering must respect Reduced Motion and never rely on color
  alone for meaning (`B7` accessibility).
- **Phase fit:** classification data rides on the same pack as §1;
  overlay UI is a reader-mode addition. Likely **Phase 3+**, sequenced
  after the §1 schema spike.

### 8. Truth Chain — Structural & Relational Passage Mapping

An interactive clause- and verse-level relationship visualizer that maps
logical, rhetorical, and theological dependencies inside Scripture —
**Command → Promise, Condition → Consequence, Prophecy → Fulfillment,
Problem → Solution** — so the "if–then" structure of a passage is visible
at a glance. Tap any mapped passage to trace how verses link together:
a Command unlocking its Promise, or the Condition behind a blessing.

- This is the **UI consumer** of the `scripture_logic_maps` bridge table
  proposed in §2 (`condition_verse_id`, `condition_text`, `outcome_text`)
  and of `semantic_connections` typed links (Precedent / Typology /
  Fulfillment). Building Truth Chain effectively *is* the §2 schema spike
  made visible.
- Mobile constraint: verse-level graphs must render as an inline
  expandable panel or sheet, not a full node-canvas, unless a dedicated
  map surface is designed (`D3`).
- **Phase fit:** gated on §1 classification + §2 schema validation;
  likely **Phase 4 / v1.1+** territory, pending the evaluation-order
  spike below.

### 9. Suggested Evaluation Order

1. **`bcv-parser`** — trivial integration, immediate UX win for reference input.
2. **Aeneas alignment pipeline** — unblocks Phase 3 karaoke audio; already an open `B5` item.
3. **`scripture_logic_maps` schema spike** — prototype classification on a few books to validate UI value before committing pack schema changes.
4. **LLM classification prompt** — run against the `ai-gateway` cost/quota model (`B7`) before scoping batch classification of all 31k verses.
5. Everything else stays parked until `A3` scheduling.

## Open Questions

- Does verse-level LLM classification of the full canon fit the `B7` cost guardrails, or is it a one-time pack-builder batch job?
- Where do user-facing category tabs (#Promise, #Warning) live in the `D3` navigation model?
- Does the conditional promise↔commandment bridging duplicate or extend the existing cross-reference (`study_refs`) model?
- Licensing for Macula/textual-variants data must be confirmed before any v1.1 pack work.

## Change Log

- `0.1.0` | `2026-11-27` | Devin | Initial feature-candidate catalog distilled from `extras.md`, mapped to `A2`/`A3` phases.
- `0.2.0` | `2026-11-27` | Devin | Added Unfolding Story (chronological narrative mode), Scripture Signals (thematic highlight overlays + filterable category index), and Truth Chain (structural passage mapping) as candidates §6–§8; renumbered evaluation order to §9.

## Traceability

- Source: `extras.md` (root, unstructured research notes).
- Related: `EXTRAS-SRC` (`docs/integrations/bible-content-sources-and-external-datasets.md`) for the data-source side of the same material.
- Downstream: `A2` (new FRs), `A3` (phase scheduling), `B4` (pack schemas), `B5` (licensing), `G5` (requirements register), `G1` (index registration pending).
