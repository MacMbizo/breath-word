# B6: Security, Privacy & E2EE Architecture

**Document ID:** `B6`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Security  
**Last Updated:** `2026-11-24`  
**Related Docs:** `B2`, `B4`, `B8` (`ADR-004`), `C3`, `C4`, `E4`, `F1`

## Purpose & Scope

Specifies the STRIDE threat model, exact cryptographic protocol for opt-in client-side E2EE (`e2ee:v1:...`), key lifecycle (generation, wrapping, rotation, recovery, biometric unlock), BYOK LLM key protection, and privacy-safe crash telemetry rules.

## Audience

Developer and AI coding partner implementing `packages/core/src/crypto/` and `apps/*/src/adapters/crypto.ts`. **Do not deviate from the byte layouts or AAD rules below.**

## Body

### 4.1 STRIDE Threat Model (Key Risks & Controls)

| Threat Category | Concrete Attack Scenario | Severity | Mandatory Control |
| --- | --- | --- | --- |
| **Spoofing** | Attacker guesses 8-char `share_code` to join private church pool. | High | Crockford Base32 8-char code ($32^8 \approx 1.1 \times 10^{12}$ space) + RPC rate limit (5 failed attempts / 15 min / user) + pool owner can regenerate code (`C4`). |
| **Tampering** | Malicious DB admin swaps ciphertext from User A's `study_notes` row into `prayer_item_user_states` or another row. | High | AES-256-GCM **AAD** strictly binds `v1|<table>|<row_id>|<column>`; any row/column swap fails GCM tag authentication. |
| **Repudiation / Accidental Leakage** | Private confession notes leak into Sentry crash breadcrumbs, console logs, or LLM prompts. | Critical | Automated telemetry scrubber strips all `*_payload` fields; LLM calls never attach `user_notes_payload` unless user explicitly checks per-card opt-in. |
| **Information Disclosure** | Church DB admin inspects Supabase dashboard and reads member confession/repentance journals. | Critical | Opt-in Zero-Knowledge E2EE (`ADR-004`); DEK never leaves client unencrypted; server stores only `e2ee:v1:...` envelopes. |
| **Information Disclosure (BYOK)** | User's personal Gemini/OpenAI/ESV API key is stolen from DB or Edge logs. | High | BYOK keys stored **only** in OS Secure Storage (`expo-secure-store` / OS Keychain), never synced to Supabase; passed per-request over TLS header; zero logging in Edge Functions. |
| **Denial of Service** | Malicious user floods shared AI Edge Function quota or downloads huge packs repeatedly. | Medium | Per-user daily AI rate limit (30/day on shared key); Cloudflare R2 zero-egress hosting for packs; PowerSync RLS scopes sync bandwidth per user. |
| **Elevation of Privilege** | Church pool `MEMBER` mutates `prayer_pools.title` or inserts items into a leader-curated pool. | High | Enforced strictly via PostgreSQL RLS policies (`C4 §4.3`), never trusted solely to client UI checks. |

### 4.2 Exact Cryptographic Specification (`e2ee:v1`)

#### Primitives & Parameters

- **Symmetric Cipher:** `AES-256-GCM` (256-bit key, 96-bit / 12-byte CSPRNG IV, 128-bit / 16-byte authentication tag).
- **Key Derivation Function (Passphrase → KEK):** `PBKDF2-HMAC-SHA256`, **600,000 iterations** (OWASP 2023+ recommendation), 16-byte CSPRNG salt, 32-byte derived KEK. *(Algorithm string persisted in `user_profiles.e2ee_kdf_algo = 'PBKDF2-SHA256-600K'` to allow future seamless upgrade to Argon2id.)*
- **Data Encryption Key (DEK):** 32 random CSPRNG bytes generated once per user vault.
- **Recovery Key:** 32 random CSPRNG bytes displayed to the user as **52 Crockford Base32 characters** grouped in 13 blocks of 4 (`XXXX-XXXX-...`) plus an offline-generated QR code for scanning into a secondary device.

#### Wire / Storage Envelope Format

Every encrypted column (`title_payload`, `body_payload`, `strokes_payload`, `user_notes_payload`, `testimony_payload`, `journal_payload`) stores a UTF-8 string:

```text
e2ee:v1:<iv_base64url>:<ciphertext_and_tag_base64url>
```

- **IV Rule (CRITICAL):** Generate a **brand-new 12-byte CSPRNG IV on every single encrypt call**, including updates to an existing row. Never reuse `(DEK, IV)`.
- **AAD Binding (CRITICAL):**
  - For data rows: `AAD = UTF8("v1|" + tableName + "|" + rowId + "|" + columnName)`
    *(Example: `v1|prayer_item_user_states|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d|user_notes_payload`)*
  - For wrapped DEKs in `user_profiles`:
    - Passphrase wrap: `AAD = UTF8("v1|user_profiles|" + userId + "|dek_passphrase")`
    - Recovery wrap: `AAD = UTF8("v1|user_profiles|" + userId + "|dek_recovery")`

#### Key Lifecycle Operations

1. **Vault Initialization (30-Second Wizard):**
   - Generate `DEK (32B)`, `salt (16B)`, `recoveryKey (32B)`.
   - Derive `KEK_pass = PBKDF2(passphrase, salt, 600_000, 32)`.
   - Compute `e2ee_wrapped_dek_passphrase = Encrypt(KEK_pass, DEK, AAD_pass)`.
   - Compute `e2ee_wrapped_dek_recovery = Encrypt(recoveryKey, DEK, AAD_rec)`.
   - Require user confirmation checkbox (*"I saved my Recovery Key"*) before writing `user_profiles` and batch-encrypting any existing plaintext private rows in a local transaction.
2. **Unlock on New Device (Android / iPad / Desktop):**
   - PowerSync syncs `user_profiles` (`e2ee_salt_b64`, `e2ee_wrapped_dek_passphrase`).
   - User enters Vault Passphrase → derive `KEK_pass` → unwrap `DEK` in RAM.
   - Optional **Biometric Fast Unlock:** Store raw `DEK` (base64) in OS hardware-backed keystore (`expo-secure-store` with `requireAuthentication: true` / macOS Keychain / Windows Credential Manager) so FaceID/TouchID/Fingerprint unlocks the vault without retyping the passphrase.
3. **Passphrase Change / Recovery (Zero Re-Encryption):**
   - Unwrap `DEK` using either old passphrase or `recoveryKey` → generate fresh `salt` → derive new `KEK_pass` → re-wrap the **exact same `DEK`** → update `user_profiles`. Zero existing notes need re-encryption.
4. **App Lock & Volatile Search Purge:**
   - On explicit lock, sign-out, or configurable inactivity timeout (default: 15 min background), zero/dereference the in-memory `DEK` (`dek.fill(0)`) and destroy the volatile `MiniSearch` index (`ADR-004`).

### 4.3 Privacy & Telemetry Redaction Policy

- Crash reporting (`E4`) is opt-in and runs a mandatory `beforeSend` scrubber blocking any payload matching `e2ee:v1:`, SQL bind parameters, `user_notes`, `journal`, `testimony`, `body_payload`, or `X-BYOK-Key` headers.
- Offline guest users transmit **zero** network telemetry.

## Acceptance / Done Criteria

- Cross-platform crypto parity tests pass: ciphertext produced by `react-native-quick-crypto` decrypts cleanly in Node/WebCrypto (`crypto.subtle`) and vice versa.
- Tampering with 1 byte of ciphertext, IV, or `rowId` AAD throws `CRYPTO_DECRYPT_FAILED`.
- Changing Vault Passphrase succeeds without modifying `study_notes` or `prayer_item_user_states` rows.

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` 600,000 PBKDF2-SHA256 iterations runs in <400ms on target Android/iPad/Desktop hardware via native C++/Rust crypto bindings (verified in Gate-1 Spike 3; never run pure-JS PBKDF2).

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Complete STRIDE threat model and `e2ee:v1` cryptographic protocol specification.

## Traceability

- Upstream: `B8` (`ADR-004`), `A2` (`FR-206`). Downstream: `B3` (`CryptoPrimitivesAdapter`), `C3`, `C4`, `F1`.
