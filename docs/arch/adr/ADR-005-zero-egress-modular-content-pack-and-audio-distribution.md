# ADR-005: Zero-Egress Modular Content Pack & Audio Distribution

- **Status:** Accepted
- **Date:** `2026-11-24`

## Context

Bundling multiple translations, STEPBible interlinear data, lexicons, Factbook, and gigabytes of audio inside the app binary violates app store limits and incurs unsustainable egress fees on Supabase Storage if shared with church groups.

## Decision

Split static biblical content into **modular, versioned, gzip-compressed `.sqlite.gz` packs** built offline via a TypeScript/Node ETL CLI (`tools/pack-builder`):

- `pack_core_bsb` (~8–12 MB gz): Bundled or instant first-launch pack (BSB text, FTS5, footnotes, BSB word alignments, audio timestamps).
- `pack_trans_<code>` (~4–8 MB gz each): WEB, KJV, ASV, NET (on-demand download).
- `pack_exegesis_step` (~30–45 MB gz): STEPBible TAHOT/TAGNT + BDB/Thayer/Abbott-Smith/Strong's + Versification maps.
- `pack_study_refs` (~20–30 MB gz): TSK cross-references + Theographic Factbook + Reading Plans.
- `pack_commentary_pd` (Phase 4): Public-domain commentaries for Passage Guide and RAG.

Host packs, `manifest.json` (with SHA-256 checksums), and chapter-level MP3 audio files on **Cloudflare R2** (free tier: 10 GB storage, **$0 egress**) with GitHub Releases as a zero-cost mirror for open SQLite packs.

Stream audio on-demand by chapter with a local LRU disk cache + optional per-book offline download toggle.

## Consequences

- (+) ~$0/month infrastructure cost for personal and church group scale.
- (+) Small initial app download (~25–40 MB) with instant offline readiness for BSB.
- (+) Independent updates to lexicons, TSK, or translations without app-store releases.
