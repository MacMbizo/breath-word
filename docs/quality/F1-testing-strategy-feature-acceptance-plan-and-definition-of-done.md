# F1: Testing Strategy, Feature Acceptance Plan & Definition of Done

**Document ID:** `F1`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / QA  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A2`, `A3`, `B4`, `B6`, `B7`, `C1`, `C2`, `C3`, `C4`, `D3`, `E2`

## Purpose & Scope

Establishes the automated testing pyramid, concrete acceptance test matrix mapped to `FR-101..FR-403`, and the mandatory **Definition of Done (DoD)** for every solo + AI coding iteration.

## Audience

Founder and AI coding partner. Every new module in `packages/core` and every SQL migration must ship with its paired test suite below.

## Body

### 4.1 High-ROI Testing Pyramid (Solo Dev + AI)

| Layer | Framework / Tool | Target Scope | Runs In CI? |
| --- | --- | --- | :---: |
| **1. Core Unit Tests** | `Vitest` (`packages/core`) | `BBCCCVVV` parser/formatter, cross-chapter ranges, versification mapping, Smart Rotation ordering, offline prayer templates, `AppError` mapping, `beforeSend` telemetry scrubber. | Yes (every PR) |
| **2. Crypto Parity Suite** | `Vitest` (Node WebCrypto) + Device Spike | `e2ee:v1` encrypt/decrypt round-trip, unique 96-bit IV verification, AAD swap rejection (`CRYPTO_DECRYPT_FAILED`), PBKDF2 + Recovery Key DEK unwrap, passphrase rotation without note re-encryption. | Yes (every PR) |
| **3. Local SQLite & ETL Tests** | `Vitest` + `better-sqlite3` | `tools/pack-builder` output: `PRAGMA integrity_check`, `verses_fts` phrase search <50ms, Strong's lookup, ESV 500-verse FIFO eviction, atomic pack swap failure rollback. | Yes (every PR) |
| **4. Supabase RLS & RPC Tests** | Local Supabase CLI + SQL/Vitest | Two-user tenancy suite (`User A` owner, `User B` member, `User C` outsider) asserting all `C4` policies, `cascade_pool_soft_delete` trigger, and 6th bad `share_code` → `POOL_JOIN_RATE_LIMITED`. | Yes (every PR) |
| **5. AI Gateway Contract Tests** | Deno Test (`supabase/functions/ai-gateway`) | Mocked LLM returning valid JSON, fabricated `chunkId` (must reject → `AI_CITATION_VERIFICATION_FAILED`), empty `chunks[]` (must short-circuit $0), zero-logging check. | Yes (every PR) |
| **6. Device & Accessibility E2E** | Manual Scripted Gate Checklist (Android + iPadOS + Win11/macOS) | Offline airplane-mode test, 120Hz Breath Prayer & Reduced Motion check, Apple Pencil → Android ink sync, TalkBack/VoiceOver chapter walkthrough. | Per Phase Exit Gate |

### 4.2 Feature Acceptance Verification Matrix (Traces to `A2`)

| Phase | FR IDs | Mandatory Automated / Gate Verification |
| --- | --- | --- |
| **Phase 1** | `FR-101..105` | Render Psalm 23 (poetry) & Matt 5 (red-letter + footnotes); parallel sync across 2–4 columns; offline FTS5 `"steadfast love"` <50ms; Focus Mode & Manna day lock; SHA-256 pack install & corrupt pack rejection. |
| **Phase 2** | `FR-201..206`, `FR-107` | ≤2-tap capture of cross-chapter range (`Isa 52:13–53:12`); Guest→Account upgrade zero data loss; offline edits merge via PowerSync across Android+iPad+Desktop; Shared Pool privacy isolation (`User A` cannot read `User B` notes); E2EE Supabase inspection shows ciphertext only; 4 prayer engines log `prayer_session_logs` at 60/120fps. |
| **Phase 3** | `FR-301..305`, `FR-106` | Tap English word → Strong's `G26` + morphology <60ms; BDB/Thayer + frequency counts offline; TSK Passage Guide & Theographic Factbook map pin; Inductive 5-step Checkup reminder; iPad Skia stroke renders identically on Android/Desktop; BSB audio highlights verse ±250ms + ambient mixer + sleep timer. |
| **Phase 4** | `FR-401..403`, `FR-204` | Smart Synopsis cites only retrieved `chunkId`s and returns *"Not covered in available sources"* on unsupported prompts; Desktop `dockview` layout persists + `Ctrl/Cmd+K` <200ms; Web Companion joins shared pool via URL/code. |

### 4.3 Definition of Done (DoD) Checklist

A feature or PR is **Done** only when all 7 items pass:

1. **Contract-Aligned:** Matches `B4` schemas, `C1/C2/C4` contracts, and `D1` tokens with zero hard-coded colors or raw SQL in UI components.
2. **Boundary-Clean:** `pnpm turbo lint typecheck test` green; zero platform imports leaked into `packages/core`.
3. **Offline-Safe:** Tested in airplane mode; degrades gracefully via canonical `C3` `AppError` messages.
4. **Privacy-Safe:** Sensitive fields use E2EE envelope when vault enabled; zero PII/keys in logs or telemetry.
5. **Accessible:** Meets `D3` WCAG 2.2 AA rules (44pt targets, Reduced Motion support, screen-reader labels, RTL Hebrew isolation).
6. **Budget-Compliant:** No regression against `B7` latency, 120Hz frame, or storage budgets.
7. **Traceable:** PR/commit references its `FR-xxx` ID and updates `G3` changelog if a schema or contract changed.

## Acceptance / Done Criteria

- All 5 automated CI test layers execute cleanly via `pnpm turbo test` and `supabase test`.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` Real-device testing uses the founder's own Android phone, iPad (with Apple Pencil), and Windows 11/macOS machine at each Phase Exit Gate.

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Complete 6-layer testing strategy, FR-101..403 acceptance matrix, and 7-point Definition of Done.

## Traceability

- Upstream: `A2`, `A3`, `B4`, `B6`, `B7`, `C1`, `C4`, `D3`. Downstream: `E2`, `G4`.
