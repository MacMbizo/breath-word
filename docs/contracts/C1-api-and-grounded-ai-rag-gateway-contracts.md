# C1: API & Grounded AI RAG Gateway Contracts

**Document ID:** `C1`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A2` (`FR-204`, `FR-401`), `B2`, `B4`, `B5`, `B6`, `C3`, `C4`

## Purpose & Scope

Defines exact HTTP/JSON request and response schemas, headers, validation rules, and anti-hallucination citation verification logic for the **Grounded AI Gateway** (`supabase/functions/ai-gateway`), Supabase Pool RPCs, and the client-side BYO ESV adapter.

## Audience

Developer and AI coding partner implementing `supabase/functions/ai-gateway/` and `packages/core/src/ai/`.

## Body

### 4.1 Grounded AI Gateway (`POST /functions/v1/ai-gateway`)

#### Required & Optional Headers

```http
Authorization: Bearer <supabase_access_jwt>
Content-Type: application/json
X-BYOK-Provider: gemini | anthropic | openai    # Optional; omits shared server quota when present
X-BYOK-Key: <user_personal_api_key>             # Optional; pass-through only, NEVER logged/persisted
X-BYOK-Model: <optional_model_override>         # e.g. gemini-2.5-flash, claude-sonnet-4-5
```

#### Mode 1: Smart Synopsis (`mode: "SYNOPSIS"`)

**Request Payload:**

```json
{
  "mode": "SYNOPSIS",
  "passageReference": "Romans 8:28-30",
  "passageText": "And we know that God works all things together for the good...",
  "question": "What does 'called according to His purpose' mean in context?",
  "traditions": ["HISTORICAL_GRAMMATICAL", "REFORMED"],
  "chunks": [
    {
      "chunkId": "jfb:45008028:01",
      "citationLabel": "Jamieson-Fausset-Brown on Rom 8:28",
      "traditionTags": ["HISTORICAL_GRAMMATICAL", "REFORMED"],
      "bodyText": "Not merely invited externally, but effectually drawn..."
    }
  ]
}
```

- **Input Validation Rules (Zod in Edge Function):**
  - `chunks.length === 0` → Short-circuit immediately with HTTP `200`, `covered: false`, `fallbackMessage: "Not covered in the available commentary sources."` (Zero LLM spend, matches `AI_NO_COMMENTARY_SOURCES`).
  - `chunks.length <= 12`, total prompt payload `<= 28,000 chars`.
  - Private fields (`userNotes`, `journal`) are **schema-forbidden** on `SYNOPSIS` requests (rejected with HTTP `400`).

**Response Payload (`200 OK`):**

```json
{
  "mode": "SYNOPSIS",
  "covered": true,
  "summary": "The cited commentaries interpret 'called' here as God's effectual, purposeful summons rather than a general outward invitation.",
  "claims": [
    {
      "text": "The term refers to believers who are effectually drawn according to God's eternal plan, linked directly to verses 29–30.",
      "citedChunkIds": ["jfb:45008028:01"]
    }
  ],
  "usedChunkIds": ["jfb:45008028:01"],
  "model": "gemini-2.5-flash",
  "quotaRemaining": 29
}
```

**Mandatory Server-Side Citation Verifier (Enforceable Grounding):**

1. Invoke LLM using strict JSON Schema structured output (`response_mime_type: "application/json"`).
2. Build `allowedIds = new Set(req.chunks.map(c => c.chunkId))`.
3. Verify every `claim.citedChunkIds` is non-empty and every ID ∈ `allowedIds`.
4. If any unknown `chunkId` appears or `claims` is empty when `covered === true`: retry once with corrective instruction; on second failure return HTTP `502` with `code: "AI_CITATION_VERIFICATION_FAILED"` (`C3`).

#### Mode 2: Reverent Prayer Prompt Generator (`mode: "PRAYER_PROMPT"`)

**Request Payload:**

```json
{
  "mode": "PRAYER_PROMPT",
  "passageReference": "Philippians 4:6-7",
  "passageText": "Be anxious for nothing, but in everything, by prayer and petition...",
  "category": "ANXIETY",
  "framework": "ACTS",
  "includeUserNotes": false,
  "optionalUserContext": null
}
```

- **Privacy Guardrail (`B6`):** If `includeUserNotes === false`, client MUST send `optionalUserContext: null`. Only when the user explicitly toggles *"Include my personal note for this card"* may decrypted context (max 500 chars) be sent over TLS—still zero-logged on Edge Function.

**Response Payload (`200 OK`):**

```json
{
  "mode": "PRAYER_PROMPT",
  "prayerText": "Heavenly Father, You command me to be anxious for nothing and invite me to bring every burden to You with thanksgiving...",
  "sections": [
    { "stage": "Adoration", "prompt": "Praise God as the sovereign Prince of Peace whose peace surpasses human understanding." },
    { "stage": "Confession", "prompt": "Confess the specific worries you have been carrying in self-reliance." },
    { "stage": "Thanksgiving", "prompt": "Thank Him for three concrete mercies you have seen this week." },
    { "stage": "Supplication", "prompt": "Place your present concern before Him and ask Him to guard your heart and mind in Christ Jesus." }
  ],
  "model": "gemini-2.5-flash",
  "quotaRemaining": 28
}
```

### 4.2 Shared Pool RPC Contracts (Supabase PostgREST)

| Endpoint | Auth | Request JSON | Success Response (`200`) | Error Codes (`C3`) |
| --- | :---: | --- | --- | --- |
| `POST /rest/v1/rpc/join_shared_pool_by_code` | JWT | `{ "p_code": "K9P4M2X7" }` | `{ "poolId": "uuid", "title": "Sunday Sermon Pool", "role": "MEMBER" }` | `AUTH_REQUIRED`, `POOL_SHARE_CODE_INVALID`, `POOL_JOIN_RATE_LIMITED` |
| `POST /rest/v1/rpc/rotate_pool_share_code` | JWT (Owner) | `{ "p_pool_id": "uuid" }` | `"R7T2N8V4"` (8-char Crockford Base32) | `AUTH_REQUIRED`, `POOL_PERMISSION_DENIED` |

### 4.3 Client-Side BYO ESV API Adapter Contract

- Endpoint: `GET https://api.esv.org/v3/passage/text/?q=<Book+Ch>&include-headings=true&include-footnotes=true&include-verse-numbers=true`
- Header: `Authorization: Token <user_esv_key_from_secure_storage>`
- Cache Policy (`local_device.sqlite -> api_ephemeral_cache`):
  - Check `SUM(verse_count)` before insert; FIFO-evict oldest rows until `SUM(verse_count) + newCount <= 500` and chapter count for that book never exceeds 50% of `books.chapter_count`.
  - Set `expires_at = now() + 7 days`.

## Acceptance / Done Criteria

- Unit tests verify `ai-gateway` strips/rejects fabricated `chunkId` citations and returns `covered: false` without calling any LLM when `chunks` is empty.
- `ai-gateway` logs contain zero API keys, zero `optionalUserContext`, and zero `passageText`.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` Default shared server model in Phase 4 is a fast, low-cost JSON-structured model (e.g., Gemini Flash tier) to maintain the `$0–$5/mo` guardrail (`B7`).

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Complete HTTP/JSON contracts for Grounded AI Gateway, citation verifier, Pool RPCs, and BYO ESV adapter.

## Traceability

- Upstream: `A2` (`FR-204`, `FR-401`), `B2`, `B5`, `B6`, `C3`, `C4`. Downstream: `B3`, `F1`.
