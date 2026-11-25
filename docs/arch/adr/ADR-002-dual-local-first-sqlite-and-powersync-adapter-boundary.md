# ADR-002: Dual Local-First SQLite & PowerSync Adapter Boundary

- **Status:** Accepted
- **Date:** `2026-11-24`

## Context

Static biblical datasets (translations, FTS5, interlinear, TSK, Factbook = 50–150MB+) must never sync through Supabase/PowerSync, while user data (highlights, notes, prayer pools) must sync offline-first across mobile, desktop, and web. PowerSync's official SDKs target React Native (`@powersync/react-native` + `op-sqlite`) and Web (`@powersync/web` + WA-SQLite/OPFS)—not `tauri-plugin-sql`.

## Decision

Maintain two strictly isolated database subsystems behind abstract TypeScript interfaces in `packages/core`:

1. **`UserDbAdapter` (Synced User State — `user_data.sqlite`):**
   - *Mobile (`apps/mobile`):* `@powersync/react-native` backed by `@op-engineering/op-sqlite`.
   - *Desktop & Web (`apps/desktop`):* `@powersync/web` backed by WA-SQLite + OPFS inside Tauri WebView / Browser.
   - *Mandatory PowerSync Constraint:* Every synced table **must** use `id TEXT PRIMARY KEY` (UUID v4) and soft-delete tombstones (`deleted_at`).
2. **`ContentDbAdapter` (Read-Only Content Packs — `*.sqlite`):**
   - *Mobile (`apps/mobile`):* Dedicated read-only `op-sqlite` connection pool attaching downloaded packs (`ATTACH DATABASE`).
   - *Desktop (`apps/desktop` Tauri):* Native Tauri Rust commands powered by `rusqlite` (compiled with `bundled` + `fts5`) reading downloaded packs directly from OS AppData (zero WebView memory bloat).
   - *Web Companion:* Lightweight read-only API/cached JSON chapters for shared pools (no full offline FTS5 packs required in browser v1).

## Consequences

- (+) Officially supported PowerSync SDKs on every target platform—zero custom sync engine code.
- (+) Instant native FTS5 search (<15ms) on Android, iPadOS, Windows, and macOS.
- (−) Requires a 48-hour Gate-1 spike to validate `rusqlite` IPC throughput in Tauri and `ATTACH DATABASE` limits in `op-sqlite`.
