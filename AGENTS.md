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
   - Build strictly for the active Phase (Phase 1 -> 2 -> 3 -> 4 -> 5). Do NOT implement v1.1 features (Syntax Trees / Macula, USFM on-device importer, Widgets) prematurely.
   - Every error thrown must be a canonical `AppError` from `C3`. Every PR must pass `pnpm turbo lint typecheck test`.
