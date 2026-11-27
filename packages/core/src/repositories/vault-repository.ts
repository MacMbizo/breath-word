// FR-206 / B6 §4.2 — Vault repository: the `user_profiles` E2EE key lifecycle.
//
// Owns the only place the wrapped DEK columns and the in-RAM data key are touched:
//   * `initVault`   — generate DEK/salt/recovery key, persist the two wrapped DEK copies.
//   * `unlock`      — unwrap the DEK with a Vault Passphrase or the 256-bit Recovery Key.
//   * `rewrap`      — change the passphrase by re-wrapping the SAME DEK (zero re-encryption).
//   * `lock`        — zero the in-RAM DEK.
//
// The DEK never leaves this object unencrypted: the synced `user_profiles` row stores only the
// `e2ee:v1:…` wraps, and `cipher()` hands the prayer repositories a `FieldCipher` that reads the
// live DEK through a closure (so locking takes effect immediately). Per `AGENTS.md` rule 1 this
// is the only place `user_profiles` SQL lives.

import type { CryptoPrimitivesAdapter, SecureStorageAdapter, UserDbAdapter } from '../adapters';
import { createFieldCipher, type FieldCipher } from '../crypto/field-cipher';
import {
  KDF_ALGO,
  PBKDF2_ITERATIONS,
  biometricDekStorageKey,
  decodeBiometricDek,
  encodeDekForBiometric,
  initializeVault,
  rewrapVaultPassphrase,
  unlockVaultWithPassphrase,
  unlockVaultWithRecoveryKeyDisplay,
  zeroizeDek,
} from '../crypto/vault';
import { AppError } from '../errors/AppError';

export interface VaultRepositoryOptions {
  readonly userDb: UserDbAdapter;
  /** Full CSPRNG/PBKDF2/AES adapter (B6 §4.2). */
  readonly crypto: CryptoPrimitivesAdapter;
  /**
   * B6 §4.2.2 — hardware-backed keystore for optional biometric fast unlock. Optional so tests (and
   * the unprovisioned desktop build, whose store is not yet the OS Keychain) can omit it; when
   * absent or not hardware-backed, every biometric call fails as `CRYPTO_VAULT_LOCKED`.
   */
  readonly secureStorage?: SecureStorageAdapter;
}

export interface VaultInitOutcome {
  /** 52 Crockford Base32 characters in 13 blocks of 4 — shown once and encoded into the QR. */
  readonly recoveryKeyDisplay: string;
  /** Raw recovery-key bytes; held only long enough to display/encode. */
  readonly recoveryKey: Uint8Array;
}

interface ProfileVaultRow {
  e2ee_enabled: number;
  e2ee_kdf_algo: string | null;
  e2ee_salt_b64: string | null;
  e2ee_wrapped_dek_passphrase: string | null;
  e2ee_wrapped_dek_recovery: string | null;
}

export class VaultRepository {
  private readonly userDb: UserDbAdapter;
  private readonly crypto: CryptoPrimitivesAdapter;
  private readonly secureStorage: SecureStorageAdapter | undefined;
  private dek: Uint8Array | null = null;
  private enabled = false;
  private userId: string | null = null;

  constructor(options: VaultRepositoryOptions) {
    this.userDb = options.userDb;
    this.crypto = options.crypto;
    this.secureStorage = options.secureStorage;
  }

  /** Whether the vault is enabled for the loaded user (persisted `e2ee_enabled`). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether the DEK is currently held in RAM. */
  isUnlocked(): boolean {
    return this.dek !== null;
  }

  /** Read the persisted enabled flag for a user (does not unlock). Call once at boot. */
  async load(userId: string): Promise<boolean> {
    this.userId = userId;
    const row = await this.readProfile(userId);
    this.enabled = row?.e2ee_enabled === 1;
    return this.enabled;
  }

  /** B6 §4.2.1 — initialize the vault and unlock it. */
  async initVault(userId: string, passphrase: string): Promise<VaultInitOutcome> {
    const result = await initializeVault(this.crypto, { userId, passphrase });
    const timestamp = this.timestamp();
    // SELECT-then-INSERT/UPDATE rather than `ON CONFLICT`: PowerSync materialises the synced tables
    // as managed views, against which SQLite cannot resolve an upsert conflict target (ADR-002). The
    // INSERT supplies every NOT NULL column explicitly because managed views do not carry the
    // `USER_DATA_DDL` DEFAULTs.
    await this.userDb.writeTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM user_profiles WHERE id = ? LIMIT 1`,
        [userId],
      );
      if (rows.length === 0) {
        await tx.execute(
          `INSERT INTO user_profiles
             (id, display_name, default_translation, manna_pacing_enabled, e2ee_enabled,
              e2ee_key_version, e2ee_kdf_algo, e2ee_salt_b64,
              e2ee_wrapped_dek_passphrase, e2ee_wrapped_dek_recovery, created_at, updated_at)
           VALUES (?, NULL, 'BSB', 0, 1, 1, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            result.e2eeKdfAlgo,
            result.e2eeSaltB64,
            result.e2eeWrappedDekPassphrase,
            result.e2eeWrappedDekRecovery,
            timestamp,
            timestamp,
          ],
        );
      } else {
        await tx.execute(
          `UPDATE user_profiles
              SET e2ee_enabled = 1,
                  e2ee_key_version = 1,
                  e2ee_kdf_algo = ?,
                  e2ee_salt_b64 = ?,
                  e2ee_wrapped_dek_passphrase = ?,
                  e2ee_wrapped_dek_recovery = ?,
                  updated_at = ?
            WHERE id = ?`,
          [
            result.e2eeKdfAlgo,
            result.e2eeSaltB64,
            result.e2eeWrappedDekPassphrase,
            result.e2eeWrappedDekRecovery,
            timestamp,
            userId,
          ],
        );
      }
    });

    this.userId = userId;
    this.enabled = true;
    this.dek = result.dek;
    // A fresh DEK invalidates any DEK parked earlier for biometric fast unlock (B6 §4.2.2).
    await this.secureStorage?.deleteItem(biometricDekStorageKey(userId));
    // B6 §4.2.1 — enabling the vault must not leave earlier plaintext private rows readable.
    await this.encryptExistingPrivateFields(userId);
    return { recoveryKeyDisplay: result.recoveryKeyDisplay, recoveryKey: result.recoveryKey };
  }

  /** B6 §4.2.2 — unlock with the Vault Passphrase. */
  async unlockWithPassphrase(userId: string, passphrase: string): Promise<void> {
    const row = await this.requireVaultMaterial(userId);
    const dek = await unlockVaultWithPassphrase(this.crypto, {
      userId,
      passphrase,
      e2eeSaltB64: row.e2ee_salt_b64,
      e2eeWrappedDekPassphrase: row.e2ee_wrapped_dek_passphrase,
      iterations: iterationsForKdfAlgo(row.e2ee_kdf_algo),
    });
    this.userId = userId;
    this.enabled = true;
    this.dek = dek;
  }

  /** B6 §4.2.2 — unlock with the 256-bit Recovery Key (no passphrase). */
  async unlockWithRecoveryKey(userId: string, recoveryKeyDisplay: string): Promise<void> {
    const row = await this.requireVaultMaterial(userId);
    const dek = await unlockVaultWithRecoveryKeyDisplay(this.crypto, {
      userId,
      recoveryKeyDisplay,
      e2eeWrappedDekRecovery: row.e2ee_wrapped_dek_recovery,
    });
    this.userId = userId;
    this.enabled = true;
    this.dek = dek;
  }

  /** B6 §4.2.3 — change the passphrase; the DEK (and every note) is reused untouched. */
  async rewrapPassphrase(newPassphrase: string): Promise<void> {
    const userId = this.requireUser();
    const dek = this.requireDek();
    const { e2eeSaltB64, e2eeWrappedDekPassphrase } = await rewrapVaultPassphrase(this.crypto, {
      userId,
      dek,
      newPassphrase,
    });
    await this.userDb.execute(
      `UPDATE user_profiles
          SET e2ee_salt_b64 = ?, e2ee_wrapped_dek_passphrase = ?, e2ee_kdf_algo = ?, updated_at = ?
        WHERE id = ?`,
      [e2eeSaltB64, e2eeWrappedDekPassphrase, KDF_ALGO, this.timestamp(), userId],
    );
  }

  /** B6 §4.2.4 — App Lock: overwrite the in-RAM DEK so it cannot be recovered from memory. */
  lock(): void {
    if (this.dek !== null) {
      zeroizeDek(this.dek);
      this.dek = null;
    }
  }

  /** B6 §4.2.2 — whether a raw DEK is parked in the OS keystore for this user. */
  async isBiometricUnlockEnabled(userId: string): Promise<boolean> {
    const store = this.requireSecureStore();
    return (await store.getItem(biometricDekStorageKey(userId))) !== null;
  }

  /**
   * B6 §4.2.2 — park the live DEK in the OS hardware-backed keystore (behind `requireAuthentication`)
   * so FaceID/TouchID/fingerprint unlocks the vault without retyping the passphrase. Requires an
   * unlocked vault.
   */
  async enableBiometricUnlock(): Promise<void> {
    const userId = this.requireUser();
    const dek = this.requireDek();
    await this.requireSecureStore().setItem(biometricDekStorageKey(userId), encodeDekForBiometric(dek), {
      requireAuthentication: true,
    });
  }

  /** B6 §4.2.2 — remove the parked DEK; the vault stays unlocked in RAM. */
  async disableBiometricUnlock(): Promise<void> {
    const userId = this.requireUser();
    await this.requireSecureStore().deleteItem(biometricDekStorageKey(userId));
  }

  /**
   * B6 §4.2.2 — fast unlock: read the parked DEK straight into RAM after the OS user-presence check.
   * Returns `false` when the user has no parked key; a vault that is not set up on this device (or a
   * stale parked key) surfaces a canonical `CRYPTO_VAULT_LOCKED`.
   */
  async unlockWithBiometric(userId: string): Promise<boolean> {
    const stored = await this.requireSecureStore().getItem(biometricDekStorageKey(userId));
    if (stored === null) return false;
    await this.requireVaultMaterial(userId);
    this.userId = userId;
    this.enabled = true;
    this.dek = decodeBiometricDek(stored);
    return true;
  }

  /** A `FieldCipher` bound to this vault's live enabled/DEK state (for the prayer repositories). */
  cipher(): FieldCipher {
    return createFieldCipher(this.crypto, () => this.enabled, () => this.dek);
  }

  private async readProfile(userId: string): Promise<ProfileVaultRow | null> {
    const { rows } = await this.userDb.query<ProfileVaultRow>(
      `SELECT e2ee_enabled, e2ee_kdf_algo, e2ee_salt_b64,
              e2ee_wrapped_dek_passphrase, e2ee_wrapped_dek_recovery
         FROM user_profiles
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async requireVaultMaterial(userId: string): Promise<
    ProfileVaultRow & {
      e2ee_salt_b64: string;
      e2ee_wrapped_dek_passphrase: string;
      e2ee_wrapped_dek_recovery: string;
    }
  > {
    const row = await this.readProfile(userId);
    if (row === null || row.e2ee_salt_b64 === null || row.e2ee_wrapped_dek_passphrase === null || row.e2ee_wrapped_dek_recovery === null) {
      throw new AppError({
        code: 'CRYPTO_VAULT_LOCKED',
        domain: 'CRYPTO',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Private Vault is not set up on this device yet.',
        internalDetail: `No E2EE key material found on user_profiles for user "${userId}".`,
      });
    }
    return {
      ...row,
      e2ee_salt_b64: row.e2ee_salt_b64,
      e2ee_wrapped_dek_passphrase: row.e2ee_wrapped_dek_passphrase,
      e2ee_wrapped_dek_recovery: row.e2ee_wrapped_dek_recovery,
    };
  }

  private requireUser(): string {
    if (this.userId === null) {
      throw new AppError({
        code: 'CRYPTO_VAULT_LOCKED',
        domain: 'CRYPTO',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Private Vault is not set up on this device yet.',
        internalDetail: 'Vault operation attempted before load()/initVault()/unlock().',
      });
    }
    return this.userId;
  }

  private requireDek(): Uint8Array {
    if (this.dek === null) {
      throw new AppError({
        code: 'CRYPTO_VAULT_LOCKED',
        domain: 'CRYPTO',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Unlock your Private Vault to change its passphrase.',
        internalDetail: 'DEK is not in RAM.',
      });
    }
    return this.dek;
  }

  /**
   * B6 §4.2.2 — the hardware-backed keystore the raw DEK may be parked in. Absent (tests, and the
   * desktop build whose store is still the `localStorage` placeholder) or not hardware-backed is a
   * canonical `CRYPTO_VAULT_LOCKED`: a raw DEK must never be written to a plaintext store.
   */
  private requireSecureStore(): SecureStorageAdapter {
    if (this.secureStorage === undefined || !this.secureStorage.supportsBiometric) {
      throw new AppError({
        code: 'CRYPTO_VAULT_LOCKED',
        domain: 'CRYPTO',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Biometric unlock is not available on this device.',
        internalDetail: 'No hardware-backed SecureStorageAdapter was injected.',
      });
    }
    return this.secureStorage;
  }

  /**
   * B6 §4.2.1 — sweep this user's pre-existing plaintext private rows into `e2ee:v1` envelopes in
   * a single local transaction, so turning the vault on never leaves earlier notes readable on
   * disk. Rows already stored as an envelope are skipped, making a re-run idempotent. Only the
   * user's own rows are touched (the shared-pool privacy split keeps other members' state out).
   */
  private async encryptExistingPrivateFields(userId: string): Promise<void> {
    const cipher = this.cipher();
    await this.userDb.writeTransaction(async (tx) => {
      for (const { table, column } of PRIVATE_FIELD_COLUMNS) {
        const { rows } = await tx.query<{ id: string; value: string }>(
          `SELECT id, ${column} AS value
             FROM ${table}
            WHERE user_id = ? AND deleted_at IS NULL AND ${column} IS NOT NULL
              AND ${column} NOT LIKE 'e2ee:v1:%'`,
          [userId],
        );
        for (const row of rows) {
          const envelope = await cipher.encrypt(table, row.id, column, row.value);
          await tx.execute(
            `UPDATE ${table}
                SET ${column} = ?, is_encrypted = 1, updated_at = ?
              WHERE id = ?`,
            [envelope, this.timestamp(), row.id],
          );
        }
      }
    });
  }

  private timestamp(): string {
    return new Date().toISOString();
  }
}

/**
 * B6 §4.2.1 — the private columns the vault protects, and the synced tables they live on
 * (B4 §4.3). Every table carries `user_id` as its owning column.
 */
const PRIVATE_FIELD_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'prayer_item_user_states', column: 'user_notes_payload' },
  { table: 'prayer_item_user_states', column: 'testimony_payload' },
  { table: 'prayer_session_logs', column: 'journal_payload' },
  { table: 'study_notes', column: 'title_payload' },
  { table: 'study_notes', column: 'body_payload' },
  { table: 'ink_canvases', column: 'strokes_payload' },
];

/** Parse `"PBKDF2-SHA256-600K"` -> 600000; fall back to the current default for unknown algos. */
function iterationsForKdfAlgo(algo: string | null): number {
  const match = /(\d+)K$/.exec(algo ?? '');
  return match === null ? PBKDF2_ITERATIONS : Number(match[1]) * 1_000;
}
