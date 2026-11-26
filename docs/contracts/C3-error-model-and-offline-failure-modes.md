# C3: Error Model & Offline Failure Modes

**Document ID:** `C3`  
**Version:** `1.0.2`  
**Status:** `Approved`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-26`  
**Related Docs:** `B1`, `B2`, `B4`, `B6`, `C1`, `C2`, `C4`, `E4`

## Purpose & Scope

Defines the canonical error code taxonomy, `AppError` TypeScript interface, HTTP/Edge Function error wire envelope, automatic retry/backoff policies, and user-facing recovery UX across offline and online failure modes.

## Audience

Developer and AI coding partner authoring repositories, Edge Functions, PowerSync upload connectors, and UI error boundaries.

## Body

### 4.1 Canonical `AppError` Contract (`packages/core/src/errors/AppError.ts`)

```typescript
export type ErrorDomain =
  | 'AUTH'
  | 'CRYPTO'
  | 'SYNC'
  | 'POOL'
  | 'PACK'
  | 'AI'
  | 'ESV'
  | 'DB';

export type RetryPolicy = 'NONE' | 'EXPONENTIAL_BACKOFF' | 'USER_ACTION';

export interface AppErrorShape {
  code: string;              // e.g. 'CRYPTO_VAULT_LOCKED', 'PACK_CHECKSUM_MISMATCH'
  domain: ErrorDomain;
  httpStatus?: number;       // Populated for remote/RPC/Edge errors
  retryPolicy: RetryPolicy;
  userMessage: string;       // Safe, calm, actionable copy (never leaks raw SQL/stack traces)
  internalDetail?: string;   // Redacted diagnostic note (stripped before telemetry if sensitive)
  cause?: unknown;
}

export class AppError extends Error implements AppErrorShape {
  readonly code: string;
  readonly domain: ErrorDomain;
  readonly httpStatus?: number;
  readonly retryPolicy: RetryPolicy;
  readonly userMessage: string;
  readonly internalDetail?: string;

  constructor(shape: AppErrorShape) {
    super(shape.userMessage, { cause: shape.cause });
    this.name = 'AppError';
    this.code = shape.code;
    this.domain = shape.domain;
    this.httpStatus = shape.httpStatus;
    this.retryPolicy = shape.retryPolicy;
    this.userMessage = shape.userMessage;
    this.internalDetail = shape.internalDetail;
  }
}
```

### 4.2 Edge Function & RPC Wire Error Envelope (`application/json`)

All Supabase Edge Functions (`ai-gateway`) return a uniform error JSON payload:

```json
{
  "error": {
    "code": "AI_QUOTA_EXCEEDED",
    "message": "Daily shared AI limit reached (30/30). Add your own API key in Settings or try again tomorrow.",
    "retryable": false,
    "retryAfterSeconds": 43200
  }
}
```

### 4.3 Canonical Error Code Registry

| Code | HTTP | Retry Policy | Trigger Condition | User-Facing Recovery UX |
| --- | :---: | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | `USER_ACTION` | Missing or unauthenticated JWT on sync/RPC/AI call. | Prompt calm Sign-In modal (never block offline reading). |
| `AUTH_SESSION_EXPIRED` | 401 | `EXPONENTIAL_BACKOFF` | Refresh token revoked or expired. | Attempt silent refresh once; if failed, show non-blocking "Reconnect Sync" banner. |
| `AUTH_GUEST_MIGRATION_FAILED` | — | `USER_ACTION` | Local SQLite transaction error rewriting `guestUserId`. | Roll back transaction cleanly; keep local guest data intact and offer retry. |
| `CRYPTO_VAULT_LOCKED` | — | `USER_ACTION` | UI requests decrypted field while `DEK` is not in RAM. | Render inline "Unlock Private Vault" button (Biometrics or Passphrase). |
| `CRYPTO_INVALID_PASSPHRASE` | — | `USER_ACTION` | Unwrapping `e2ee_wrapped_dek_passphrase` fails GCM tag check. | Show *"Incorrect Vault Passphrase"* + link to *"Use 256-bit Recovery Key"*. |
| `CRYPTO_DECRYPT_FAILED` | — | `NONE` | Row ciphertext corrupted or AAD mismatch (`B6 §4.2`). | Show *"This encrypted entry could not be verified"* (do not crash list rendering); log code only. |
| `SYNC_OFFLINE` | — | `EXPONENTIAL_BACKOFF` | Device lacks network connectivity. | Display subtle offline pill; continue local SQLite reads/writes seamlessly. |
| `SYNC_MUTATION_REJECTED` | 403/400 | `NONE` | RLS or schema violation during PowerSync `uploadData`. | Discard/dead-letter bad mutation (`C2 §4.2`) so queue never jams; show non-intrusive toast. |
| `POOL_SHARE_CODE_INVALID` | 404 | `USER_ACTION` | Invalid or rotated 8-char `share_code`. | Show *"Code not found—ask your group leader for the latest code."* |
| `POOL_JOIN_RATE_LIMITED` | 429 | `USER_ACTION` | ≥5 failed join attempts within 15 minutes (`C4 §4.4`). | Show *"Too many attempts. Please wait 15 minutes and try again."* |
| `POOL_PERMISSION_DENIED` | 403 | `NONE` | Non-owner/leader attempts restricted pool action. | Disable write controls for `MEMBER` in leader-curated pools. |
| `PACK_DOWNLOAD_INTERRUPTED` | — | `EXPONENTIAL_BACKOFF` | Network drop during `.sqlite.gz` fetch from R2. | Keep `.tmp` file; auto-resume via HTTP `Range` header when back online. |
| `PACK_CHECKSUM_MISMATCH` | — | `USER_ACTION` | Downloaded `.tmp` SHA-256 differs from `manifest.json`. | Delete `.tmp` immediately; preserve currently attached pack; offer *"Retry Download"*. |
| `PACK_INTEGRITY_FAILED` | — | `USER_ACTION` | Decompressed SQLite fails `PRAGMA integrity_check`. | Delete staging file; never `DETACH` working pack. |
| `PACK_SCHEMA_INCOMPATIBLE` | — | `USER_ACTION` | Pack `schemaVersion` exceeds app's supported version. | Show *"Please update Breath & Word to install this pack update."* |
| `PACK_STORAGE_FULL` | — | `USER_ACTION` | Insufficient device disk space (<2× uncompressed pack size). | Show required MB and shortcut to manage/remove unused packs or audio cache. |
| `PACK_PARSE_FAILED` | — | `USER_ACTION` | ETL build-time: a raw source (USFM/open dataset) fails to parse into a `PackSource` (`tools/pack-builder`). | Build aborts with the offending file/line in `internalDetail`; never publish a partial pack. |
| `PACK_MANIFEST_INVALID` | — | `USER_ACTION` | The fetched `manifest.json` catalogue fails shape/version validation (`parsePackManifest`, `B4 §4.6`). | Leave attached packs untouched; show a non-blocking *"Catalogue unavailable"* notice and offer retry. |
| `AI_OFFLINE_UNAVAILABLE` | — | `USER_ACTION` | User triggers Smart Synopsis or AI Prayer while offline. | Offer instant one-tap fallback to **Offline Prayer Templates** or local Passage Guide. |
| `AI_QUOTA_EXCEEDED` | 429 | `USER_ACTION` | Exceeded 30 req/day on shared church LLM key (`B2 §4.4`). | Prompt optional BYOK API key entry in Settings or wait until UTC midnight reset. |
| `AI_BYOK_INVALID` | 401 | `USER_ACTION` | Upstream LLM rejects user's personal `X-BYOK-Key`. | Open BYOK Settings to verify provider + key (never log key). |
| `AI_NO_COMMENTARY_SOURCES` | 200 | `NONE` | Zero `commentary_chunks` match passage + tradition filters. | Return deterministic *"Not covered in the available commentary sources"* without calling LLM ($0 cost). |
| `AI_CITATION_VERIFICATION_FAILED` | 502 | `EXPONENTIAL_BACKOFF` | LLM output fails JSON schema or cites non-existent `chunk_id`. | Retry once with stricter system prompt; if second attempt fails, surface fallback message. |
| `ESV_KEY_MISSING` | — | `USER_ACTION` | User selects ESV without entering personal Crossway API key. | Open ESV BYO Key setup modal with Crossway signup link. |
| `ESV_CACHE_LIMIT_REACHED` | — | `NONE` | `api_ephemeral_cache` hits Crossway's 500-verse cap. | Automatically evict oldest cached ESV chapters (FIFO) before inserting new chapter. |
| `DB_CONTENT_PACK_NOT_ATTACHED` | — | `USER_ACTION` | User taps Interlinear/Factbook before downloading `exegesis_step` or `study_refs`. | Show friendly inline download card with pack size (~30 MB) and one-tap Install. |

### 4.4 Backoff & Timeout Guardrails

- **Automatic Retries (`EXPONENTIAL_BACKOFF`):** Max 4 attempts (`1s → 2s → 4s → 8s` + ±20% random jitter). Never retry `400`, `401`, `403`, `404`, or `CRYPTO_*` errors.
- **Client Network Timeouts:**
  - Auth / Pool RPCs: `10s`
  - AI Gateway (`ai-gateway` streaming/JSON): `30s`
  - Pack Download (R2): No total timeout; `30s` idle socket stall timeout with `Range` resume.

## Acceptance / Done Criteria

- All error codes raised across `B2`, `B4`, `B6`, `C1`, `C2`, and `C4` exist verbatim in §4.3.
- UI error boundaries render calm, non-technical `userMessage` text and never expose raw SQL errors, stack traces, or `e2ee:v1:` ciphertext.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` Cloudflare R2 supports standard HTTP `Range` requests for resumable pack downloads (verified default R2 behavior).

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Initial canonical `AppError` contract, wire envelope, 24 error codes, and offline recovery policy.
- `1.0.1` | `2026-11-26` | Athena | Add `PACK_PARSE_FAILED` for the `tools/pack-builder` USFM/dataset ETL (`B4 §4.6`).
- `1.0.2` | `2026-11-26` | Athena | Add `PACK_MANIFEST_INVALID` for validating the fetched FR-105 `manifest.json` catalogue (`parsePackManifest`).

## Traceability

- Upstream: `B1`, `B2`, `B4`, `B6`, `C2`, `C4`. Downstream: `C1`, `D3`, `E4`, `F1`.
