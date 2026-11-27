// B6 §4.2 / AGENTS.md rule 5 — per-field E2EE cipher for synced private columns.
//
// Turns a plaintext private field (`user_notes_payload`, `testimony_payload`, `journal_payload`)
// into an `e2ee:v1` envelope bound to its table/row/column AAD, and back. The DEK lives only in
// RAM (owned by the Vault); this module never persists it, never logs plaintext, and never writes
// decrypted values to disk.
//
// Two distinct states, per B6:
//   * disabled  — the user has not enabled the vault; private fields are stored as plaintext.
//   * locked    — the vault is enabled but the DEK is not in RAM; any encrypt/decrypt attempt
//                 throws `CRYPTO_VAULT_LOCKED` so the UI can prompt for unlock.

import type { CryptoPrimitivesAdapter } from '../adapters';
import { AppError } from '../errors/AppError';

import { buildRowAad, bytesToUtf8, decryptEnvelope, encryptEnvelope, utf8ToBytes } from './envelope';

export interface FieldCipher {
  /** True once the user has enabled the E2EE vault (private fields MUST be encrypted). */
  readonly enabled: boolean;
  /** True while the DEK is held in RAM (vault unlocked). */
  isUnlocked(): boolean;
  encrypt(table: string, rowId: string, column: string, plaintext: string): Promise<string>;
  decrypt(table: string, rowId: string, column: string, envelope: string): Promise<string>;
}

/**
 * Build a `FieldCipher` over a CSPRNG/AES adapter and two accessors supplied by the Vault:
 * `isEnabled` reflects the persisted `user_profiles.e2ee_enabled` flag, and `getDek` returns the
 * in-RAM data key (or `null` while locked).
 */
export function createFieldCipher(
  adapter: CryptoPrimitivesAdapter,
  isEnabled: () => boolean,
  getDek: () => Uint8Array | null,
): FieldCipher {
  return {
    get enabled() {
      return isEnabled();
    },
    isUnlocked() {
      return getDek() !== null;
    },
    async encrypt(table, rowId, column, plaintext) {
      const dek = getDek();
      if (dek === null) {
        throw vaultLocked(table, column);
      }
      return encryptEnvelope(adapter, {
        dek,
        plaintext: utf8ToBytes(plaintext),
        aad: buildRowAad(table, rowId, column),
      });
    },
    async decrypt(table, rowId, column, envelope) {
      const dek = getDek();
      if (dek === null) {
        throw vaultLocked(table, column);
      }
      const bytes = await decryptEnvelope(adapter, dek, envelope, buildRowAad(table, rowId, column));
      return bytesToUtf8(bytes);
    },
  };
}

function vaultLocked(table: string, column: string): AppError {
  return new AppError({
    code: 'CRYPTO_VAULT_LOCKED',
    domain: 'CRYPTO',
    retryPolicy: 'USER_ACTION',
    userMessage: 'Unlock your Private Vault to save this private entry.',
    internalDetail: `Attempted to read/write ${table}.${column} while the DEK is not in RAM.`,
  });
}
