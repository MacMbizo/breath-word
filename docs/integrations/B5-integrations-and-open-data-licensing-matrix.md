# B5: Integrations & Open-Data Licensing Matrix

**Document ID:** `B5`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A3`, `A7`, `B1`, `B4`, `B6`, `B8` (`ADR-005`), `C1`, `C3`

## Purpose & Scope

Catalogs every external open dataset, third-party API, audio source, and cloud integration used by **Breath & Word v1**, along with exact license obligations, caching limits, attribution rules, and ETL ingestion notes.

## Audience

Founder, AI coding partner (`tools/pack-builder`), and anyone reviewing app-store legal/license compliance.

## Body

### 4.1 Open-Data Corpus & Licensing Compliance Matrix

| Dataset | Target Pack (`B4`) | License / Terms | Distribution & Compliance Guardrails | ETL Ingestion Notes |
| --- | --- | --- | --- | --- |
| **Berean Standard Bible (BSB)** | `core_bsb` | **CC0 1.0 (Public Domain)** | Free to bundle, modify, redistribute commercially or non-commercially without royalties. | Primary default translation; includes aligned interlinear table & official open MP3 audio. |
| **BSB Audio Narration** | R2 Audio CDN | **Open / Free Redistribution** (verify specific narrator credit e.g. Bob Souer) | Stream/cache chapter MP3s from Cloudflare R2 (`ADR-005`). Credit narrator in `audio_editions`. | `[OPEN]` Verify whether BSB provides verse-level JSON/VTT timestamps; if chapter-only, run offline forced alignment (Aeneas/WhisperX) inside `tools/pack-builder` to populate `audio_verse_timestamps`. |
| **WEB, KJV, ASV** | `trans_web`, `trans_kjv`, `trans_asv` | **Public Domain** *(Note: KJV holds UK Crown Patent—exclude KJV pack in UK storefronts if publishing publicly, or verify personal/church scope)* | Free download via R2 `manifest.json`. | Parse from clean USFM/OSIS sources preserving poetry & headings. |
| **NET Bible (Free Edition)** | `trans_net` *(conditional)* | **Bible.org Free/Non-Commercial Terms** | **`[OPEN]` Legal Gate:** Confirm Bible.org written permission before hosting `trans_net.sqlite` on public R2; if restricted, load via Bible.org Labs API or personal BYO pack only. | Includes rich translator notes mapped to `footnotes` (`category = 'TRANSLATION'`). |
| **Crossway ESV API** | Runtime BYO API (`api_ephemeral_cache`) | **Crossway API Terms (Strict)** | **Never bundle or host ESV packs.** User supplies personal API key stored only in OS Secure Storage. Strictly enforce Crossway caching limits: **max 500 consecutive verses**, **max 50% of any book**, **ephemeral TTL (≤7 days)** via FIFO eviction (`ESV_CACHE_LIMIT_REACHED`, `C3`). Display *"Scripture quotations are from the ESV® Bible..."* attribution. | Direct client HTTPS fetch to `api.esv.org/v3/passage/text/`. |
| **Tyndale House STEPBible (TAHOT / TAGNT)** | `exegesis_step` | **CC BY 4.0** | Mandatory visible attribution to *STEPBible.org / Tyndale House, Cambridge* + link to CC BY 4.0 license. | Parse TSVs, strip Strong's leading zeros (`G0026` → `G26`), apply `versification_maps` for Hebrew MT → Protestant `BBCCCVVV`. |
| **BDB, Thayer, Abbott-Smith, Strong's** | `exegesis_step` | **Public Domain / CC BY-SA** (verify specific digitized edition) | Credit digitized source repository (e.g., OpenScriptures / STEPBible) in `pack_metadata.attribution_text`. | Normalize into `lexicon_entries.full_entry_json`. |
| **OpenBible.info / TSK Cross-Refs** | `study_refs` | **CC BY 4.0** (OpenBible weights) / **Public Domain** (TSK) | Mandatory attribution to *OpenBible.info* in app Licenses screen. | Convert OSIS refs to `from_verse_id` / `to_start_verse_id`–`to_end_verse_id` with `votes` weight. |
| **Theographic Bible Metadata** | `study_refs` | **CC BY-SA 4.0 (ShareAlike)** | **ShareAlike Isolation Rule:** Keep Theographic data isolated in `study_refs.sqlite` and publish the derived `study_refs` pack + ETL script under CC BY-SA 4.0. This cleanly satisfies ShareAlike without affecting application source code. | Normalize people, places (lat/lng), events, eras into `factbook_entities` + `factbook_verse_links`. |
| **Public-Domain Commentaries** (JFB, Keil & Delitzsch, Henry, Calvin) | `commentary_pd` (Phase 4) | **Public Domain** (CCEL / SWORD PD texts) | Credit digitization source. Tag each source with `tradition_tags_json` (`HISTORICAL_GRAMMATICAL`, `REFORMED`, `WESLEYAN`, `BROADLY_EVANGELICAL`). | Chunk by pericope/verse range (max ~500 words/chunk) with deterministic `chunk_id`. |

### 4.2 Cloud & Runtime Third-Party Integrations

| Provider | Role | Pricing Tier (v1 Target) | Fallback / Lock-In Mitigation |
| --- | --- | --- | --- |
| **Supabase** | PostgreSQL, Auth, Edge Functions | Free ($0) or Pro ($25/mo if scaling) | Standard Postgres DDL + standard Deno Edge Functions; portable to self-hosted Supabase. |
| **PowerSync Cloud** | Offline-first SQLite delta sync | Free Sandbox / Starter | Encapsulated strictly behind `UserDbAdapter` (`B3 §4.3`). |
| **Cloudflare R2** | Content packs (`*.sqlite.gz`), `manifest.json`, chapter MP3s | Free Tier (10 GB storage, **$0 egress**) | Standard S3-compatible static URLs; mirrored on GitHub Releases for open packs. |
| **LLM Providers** (Gemini / Anthropic / OpenAI) | Grounded Smart Synopsis & AI Prayer Prompts | BYOK ($0 to app) or Gemini Flash shared quota (~pennies/mo) | Provider-agnostic adapter inside `ai-gateway` Edge Function (`C1 §4.1`). |

### 4.3 Mandatory In-App Attribution Mechanism

- The Settings → **Licenses & Attributions** screen dynamically reads `pack_metadata.display_name`, `license_spdx`, and `attribution_text` from every currently installed pack in `local_device.sqlite`, plus static credits for Crossway ESV (when active) and open-source libraries.

## Acceptance / Done Criteria

- Every pack built by `tools/pack-builder` fails CI if `pack_metadata.license_spdx` or `attribution_text` is empty.
- Automated test proves `api_ephemeral_cache` never stores >500 cumulative ESV verses.
- `study_refs` pack build script carries an explicit `LICENSE-CC-BY-SA-4.0.txt` notice.

## Open Questions

- `[OPEN]` Confirm Bible.org redistribution terms for `trans_net` before Phase 1 R2 publish.
- `[OPEN]` Verify BSB verse-level audio cue sheet availability vs. offline Aeneas/WhisperX alignment before Phase 3.

## Assumptions

- `[ASSUMPTION]` Ambient audio tracks (rain, soft piano, warm pad) are sourced from CC0 / royalty-free libraries (e.g., Freesound CC0) and bundled locally (<4 MB Opus/AAC loops) for zero latency offline.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Complete open-data licensing matrix, ESV compliance guardrails, ShareAlike isolation strategy, and cloud integration catalog.

## Traceability

- Upstream: `A3`, `A7`, `B4`, `B8` (`ADR-005`). Downstream: `C1`, `E2`, `F1`.
