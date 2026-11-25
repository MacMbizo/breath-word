# E1: Environments & Configuration Matrix

**Document ID:** `E1`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / DevOps  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A3`, `B2`, `B3`, `B6`, `E2`, `G4`

## Purpose & Scope

Defines the three runtime environments (`local`, `staging`, `prod`), environment variable & secret isolation rules, and phase-gated feature flags for **Breath & Word v1**.

## Audience

Founder, AI coding partner, and CI/CD workflows (`E2`).

## Body

### 4.1 Environment Topology

| Environment | Purpose | Supabase / PowerSync | Content Pack CDN | Distribution Channel |
| --- | --- | --- | --- | --- |
| **`local`** | Solo dev + AI daily coding & RLS tests | Local Docker (`supabase start`) + Local PowerSync dev / mock | Local static HTTP server (`tools/pack-builder/out`) | Expo Go / Dev Client, `pnpm tauri dev` |
| **`staging`** | Personal dogfooding & small church beta | Staging Supabase project + PowerSync Sandbox | Cloudflare R2 `staging/` prefix | Android signed preview APK, iPadOS TestFlight Internal, Tauri prerelease |
| **`prod`** | Daily production use & church group rollout | Prod Supabase project + PowerSync Cloud | Cloudflare R2 `v1/` prefix + GitHub Releases mirror | Android APK / Play Internal, iPadOS TestFlight/App Store, Tauri `.exe`/`.dmg`, Web Companion |

### 4.2 Environment Variable & Secret Hygiene Matrix

> **Hard Rule (`B6`):** Any secret marked `Client-Safe: NO` **MUST NEVER** carry an `EXPO_PUBLIC_` or `VITE_` prefix and **MUST NEVER** be committed to git.

| Variable Name | Scope | Client-Safe? | Description |
| --- | --- | :---: | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` | Mobile / Desktop / Web | **Yes** | Public Supabase project URL (protected by RLS `C4`). |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | Mobile / Desktop / Web | **Yes** | Public anon JWT key (zero privilege without user JWT + RLS). |
| `EXPO_PUBLIC_POWERSYNC_URL` / `VITE_POWERSYNC_URL` | Mobile / Desktop / Web | **Yes** | PowerSync Cloud endpoint. |
| `EXPO_PUBLIC_PACK_MANIFEST_URL` / `VITE_PACK_MANIFEST_URL` | Mobile / Desktop / Web | **Yes** | Cloudflare R2 `manifest.json` HTTPS URL. |
| `EXPO_PUBLIC_SENTRY_DSN` / `VITE_SENTRY_DSN` | Mobile / Desktop / Web | **Yes** | Optional opt-in privacy-scrubbed crash DSN (`E4`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions / CI Only | **NO** | Full DB admin bypass—used only in server maintenance/migrations. |
| `SHARED_LLM_PROVIDER` / `SHARED_LLM_API_KEY` | Edge Function (`ai-gateway`) | **NO** | Server-side Gemini Flash key for shared 30 req/day church quota. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | GitHub Actions (`release-packs`) | **NO** | Scoped Cloudflare R2 upload credentials. |
| *User BYOK LLM Key & Crossway ESV Key* | Client OS Secure Storage Only | **Device-Only** | Stored strictly in `expo-secure-store` / OS Keychain; never synced or env-configured. |

### 4.3 Phase Feature Flags (`packages/core/src/config/flags.ts`)

| Flag | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Purpose |
| --- | :---: | :---: | :---: | :---: | --- |
| `ENABLE_PRAYER_ENGINE` | `false` | `true` | `true` | `true` | Tap-to-Capture, Pools, Rotation, 4 Prayer Engines (`FR-201..205`). |
| `ENABLE_CLOUD_SYNC` | `false` | `true` | `true` | `true` | PowerSync + Supabase Auth + Shared Pools (`FR-202`, `FR-206`). |
| `ENABLE_E2EE_VAULT` | `false` | `true` | `true` | `true` | Opt-in Zero-Knowledge Vault Wizard (`B6`). |
| `ENABLE_EXEGESIS_AND_INK` | `false` | `false` | `true` | `true` | Interlinear, Lexicons, Passage Guide, Factbook, Inductive + Skia Ink (`FR-301..305`). |
| `ENABLE_AUDIO_MIXER` | `false` | `false` | `true` | `true` | Synchronized narration + ambient soundscapes (`FR-106`). |
| `ENABLE_AI_GATEWAY` | `false` | `false` | `false` | `true` | Grounded Smart Synopsis + AI Prayer Prompts (`FR-401`, `FR-204`). |
| `ENABLE_SYNTAX_TREES_V11` | `false` | `false` | `false` | `false` | Deferred to v1.1 (`A3`). |

## Acceptance / Done Criteria

- `.env.example` files exist for `apps/mobile`, `apps/desktop`, and `supabase/` with zero real credentials.
- CI fails if any non-`Client-Safe` secret pattern appears in client bundles.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` `.env.local` is strictly gitignored across the monorepo.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Initial Environment Topology, Secret Matrix, and Phase 1–4 Feature Flags.

## Traceability

- Upstream: `A3`, `B2`, `B6`. Downstream: `E2`, `G4`.
