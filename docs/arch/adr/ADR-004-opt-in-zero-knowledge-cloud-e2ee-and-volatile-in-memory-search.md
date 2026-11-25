# ADR-004: Opt-In Zero-Knowledge Cloud E2EE & Volatile In-Memory Search

- **Status:** Accepted
- **Date:** `2026-11-24`

## Context

Confession, Repentance, and personal prayer notes are deeply sensitive on a shared church Supabase instance, yet forcing mandatory zero-knowledge encryption on casual church users risks irreversible data loss if they lose their passphrase. Furthermore, encrypted columns cannot be indexed by SQLite FTS5 without leaking plaintext to disk.

## Decision

- **Always-On Local Protection:** Offline guest users rely on OS hardware encryption (iOS Data Protection / Android File-Based Encryption / BitLocker / FileVault).
- **Opt-In Cloud E2EE (Strongly Recommended Wizard):** When enabling cloud sync, users are guided through a 30-second Private Vault setup:
  - Generate a random 256-bit **Data Encryption Key (DEK)** on-device.
  - Wrap the DEK twice: (1) with a **KEK** derived from the user's Vault Passphrase (`PBKDF2-SHA256`, 600,000 iterations, 16-byte random salt—universally available across WebCrypto and React Native `react-native-quick-crypto`; upgradeable via `kdf_algo` field to Argon2id), and (2) with a **256-bit Recovery Key** displayed once for printing/password manager backup.
  - Encrypt sensitive fields with **AES-256-GCM** using a fresh CSPRNG 96-bit IV per write and Additional Authenticated Data (`AAD = "<table_name>:<row_id>:<column_name>"`) to prevent ciphertext substitution.
  - Store ciphertext in versioned envelope format: `e2ee:v1:<iv_b64>:<ct_and_tag_b64>`.
- **Search Strategy:** While the vault is unlocked in-memory (DEK held in RAM / OS Secure Enclave if biometric unlock is enabled), build a volatile in-memory `MiniSearch` index of decrypted notes; purge on app lock/sign-out. Never persist plaintext of encrypted notes to SQLite FTS5.

## Consequences

- (+) True zero-knowledge privacy from DB admins and accidental Supabase leaks.
- (+) Recovery Key prevents catastrophic lockouts; opt-in avoids alienating casual users.
- (+) <15ms search across thousands of personal notes with zero plaintext on disk.
