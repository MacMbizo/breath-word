# G4: Master Glossary & Solo Developer + AI Handover Guide

**Document ID:** `G4`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder  
**Last Updated:** `2026-11-24`  
**Related Docs:** `G1`, `G3`, `B3`, `B4`, `B6`, `B8`, `E1`, `F1`

## Purpose & Scope

Provides the canonical **Project Glossary** (eliminating terminology drift across docs and code), Day-1 local development setup commands, and a ready-to-paste **`AGENTS.md` / `CLAUDE.md`** AI Coding Contract so your coding AI builds Breath & Word strictly to specification.

## Audience

Founder (human operator) and every AI coding agent working in the `breath-and-word` repository.

## Body

### 4.1 Canonical Project Glossary

| Term | Authoritative Definition |
| --- | --- |
| **`BBCCCVVV`** | 32-bit Protestant canonical verse integer: `(book * 1_000_000) + (chapter * 1_000) + verse` (e.g., Rom 8:28 = `45008028`, `B4 §4.1`). |
| **Content Pack** | Immutable, versioned, gzip-compressed read-only SQLite database (`core_bsb`, `exegesis_step`, `study_refs`, `commentary_pd`) verified by SHA-256 and attached via `ATTACH DATABASE` (`ADR-005`). |
| **`DEK` / `KEK`** | Data Encryption Key (random 256-bit key encrypting user notes) wrapped by Key Encryption Key (derived from Vault Passphrase via PBKDF2-SHA256 600k iterations, `B6 §4.2`). |
| **`e2ee:v1`** | Canonical AES-256-GCM ciphertext envelope format: `e2ee:v1:<iv_b64url>:<ct_tag_b64url>` bound with row/column AAD (`B6`). |
| **Manna Pacing** | Optional non-punitive reading plan mode displaying only today's assigned passage until completed (`FR-104`). |
| **Prayer Pool** | Categorized private or `share_code`-shared collection of captured Scripture ranges (`prayer_pools` + `prayer_pool_items`). |
| **Per-User Item State** | Isolated private row (`prayer_item_user_states`) storing a user's personal `pray_count`, `last_prayed_at`, encrypted notes, and answered testimony—even inside a Shared Church Pool (`B4 §4.3`). |
| **Smart Rotation** | Queue query (`ORDER BY last_prayed_at ASC NULLS FIRST`) surfacing 3–5 least-recently-prayed verses for a 5-Minute Prayer Session (`FR-203`). |
| **Tombstone** | Soft-delete ISO-8601 UTC timestamp (`deleted_at`) preventing offline deletes from resurrecting during PowerSync reconciliation; purged server-side after 90 days (`B2 §4.3`). |
| **ShareAlike Isolation** | Keeping CC BY-SA 4.0 datasets (Theographic) isolated in `study_refs.sqlite` + CC BY-SA ETL script so ShareAlike does not affect application code (`B5 §4.1`). |
| **Grounded Citation** | Verified `chunkId` linking every claim in AI Smart Synopsis back to a retrieved `commentary_chunks` row (`C1 §4.1`). |

### 4.2 Day-1 Local Setup Commands

```bash
# 1. Prerequisites: Node 22 LTS, pnpm 9+, Docker (Supabase CLI), Rust stable (Tauri v2)
pnpm install

# 2. Start local Supabase (PostgreSQL + Auth + Edge Functions) and apply B4/B2/C4 migrations
supabase start
supabase db reset

# 3. Build initial BSB offline content pack (core_bsb-1.0.0.sqlite.gz + manifest.json)
pnpm --filter pack-builder build -- --pack core_bsb

# 4. Run full core test suite (Unit + Crypto Parity + SQLite FTS5 + RLS)
pnpm turbo lint typecheck test

# 5. Launch clients
pnpm --filter mobile start          # Expo Dev Client (Android & iPadOS)
pnpm --filter desktop tauri dev     # Tauri v2 Desktop (Win11 / macOS)
```

### 4.3 Ready-to-Paste AI Coding Contract (`AGENTS.md` / `CLAUDE.md`)

> Save this block verbatim as **`AGENTS.md`** (or **`CLAUDE.md`**) at the root of your repository so your AI coding partner never drifts from the architecture we just designed.

```markdown
# AGENTS.md — Breath & Word Engineering Contract

You are building **Breath & Word**, a local-first, privacy-respecting Bible Study & Scripture Prayer app.
All authoritative specs live in `docs/` (start with `docs/G1-index.md`).

## Non-Negotiable Architecture Rules
1. **Strict Monorepo Boundaries (`B3`, `ADR-001`):**
   - `packages/core` MUST remain 100% pure TypeScript. NEVER import `react-native`, `expo-*`, `@tauri-apps/*`, `window`, or `document` inside `packages/core`.
   - UI apps (`apps/mobile` Expo RN + Reanimated + Skia; `apps/desktop` Tauri v2 + React + Tailwind + Motion + Dockview) MUST NOT write raw SQL. All queries live in `packages/core/src/repositories/`.
2. **Dual-SQLite Separation (`B4`, `ADR-002`):**
   - Static biblical texts live ONLY in read-only modular packs (`ContentDbAdapter`). Never sync static content.
   - Synced user data lives in `user_data.sqlite` (`UserDbAdapter` via PowerSync).
   - EVERY synced table MUST use `id` (UUID v4) as its primary key and soft deletes (`deleted_at`). NEVER issue hard `DELETE` SQL on synced tables from clients.
   - Local-only state (installed packs, audio LRU cache, ESV ephemeral cache, workspace layout) lives in `local_device.sqlite`.
3. **Shared Prayer Pool Privacy Split (`B4`, `C4`):**
   - NEVER store personal notes, `pray_count`, `last_prayed_at`, or testimonies on `prayer_pool_items`. All per-user state belongs strictly in `prayer_item_user_states`.
4. **Canonical References & Strong's (`B4`):**
   - All verse IDs use Protestant 32-bit `BBCCCVVV` integers (`(book*1e6)+(ch*1e3)+v`).
   - Strong's IDs are always unpadded uppercase (`G26`, `H430`).
5. **Zero-Knowledge E2EE (`B6`, `ADR-004`):**
   - Encrypted columns MUST use `e2ee:v1:<iv_b64url>:<ct_tag_b64url>` (AES-256-GCM, fresh 12-byte CSPRNG IV every write, AAD = `v1|<table>|<row_id>|<column>`).
   - NEVER write decrypted E2EE notes to disk/FTS5, NEVER log `*_payload` or `X-BYOK-Key`, and NEVER send private notes to AI unless `includeUserNotes === true`.
6. **Rich Animated UI & Accessibility (`D1`, `D3`, `B7`):**
   - Import ALL colors, fonts, spacing, and springs strictly from `@breath-and-word/tokens` (no hard-coded hex values).
   - Run 120Hz animations (Breath Prayer ring, Swipe Deck) on UI thread / Reanimated worklets and ALWAYS implement Reduced Motion fallbacks.
   - Wrap all Hebrew/Aramaic inline tokens in `dir="rtl"` + `unicode-bidi: isolate`.
7. **Scope Guardrail (`A3`):**
   - Build strictly for the active Phase (Phase 1 -> 2 -> 3 -> 4). Do NOT implement v1.1 features (Syntax Trees / Macula, USFM on-device importer, Widgets) prematurely.
   - Every error thrown must be a canonical `AppError` from `C3`. Every PR must pass `pnpm turbo lint typecheck test`.
```

## Acceptance / Done Criteria

- `AGENTS.md` is committed at repo root and referenced at the start of every AI coding session.
- Day-1 commands spin up a working local Supabase + `core_bsb` pack + green test suite on a fresh machine.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` Developer uses an AI coding assistant capable of reading `AGENTS.md` and cross-referencing `docs/` files directly.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Finalized Master Glossary, Day-1 setup commands, and ready-to-paste `AGENTS.md` AI coding contract.

## Traceability

- Upstream: Entire suite (`A1–F1`). Downstream: Day-1 Repository Scaffold & Phase 1–4 Implementation.
