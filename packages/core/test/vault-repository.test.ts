// FR-206 / B6 §4.2 — Vault repository lifecycle + per-field encrypt-on-write / decrypt-on-read.
//
//   load -> initVault -> lock -> unlock (passphrase | recovery) -> rewrap -> lock
//
// Also the P2-07 seam: locked writes throw `CRYPTO_VAULT_LOCKED`, and tampered/AAD-swapped
// ciphertext throws `CRYPTO_DECRYPT_FAILED` (C3).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SecureStorageAdapter } from '../src/adapters';
import { isAppError } from '../src/errors/AppError';
import { VaultRepository } from '../src/repositories/vault-repository';

import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const PASSPHRASE = 'correct horse battery staple';

let userDb: NodeUserDbAdapter;
let vault: VaultRepository;

beforeEach(() => {
  userDb = new NodeUserDbAdapter();
  vault = new VaultRepository({ userDb, crypto: webCryptoAdapter });
});

afterEach(() => {
  userDb.close();
});

describe('VaultRepository.load & initVault (FR-206)', () => {
  it('reports disabled and locked before any vault exists', async () => {
    expect(await vault.load(USER_ID)).toBe(false);
    expect(vault.isEnabled()).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
  });

  it('initializes the vault, persists the four E2EE columns and unlocks in-place', async () => {
    const outcome = await vault.initVault(USER_ID, PASSPHRASE);

    expect(outcome.recoveryKey.length).toBe(32);
    const blocks = outcome.recoveryKeyDisplay.split('-');
    expect(blocks).toHaveLength(13);
    for (const block of blocks) expect(block).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);

    expect(vault.isEnabled()).toBe(true);
    expect(vault.isUnlocked()).toBe(true);

    const row = await userDb.query<{
      e2ee_enabled: number;
      e2ee_key_version: number;
      e2ee_kdf_algo: string | null;
      e2ee_salt_b64: string | null;
      e2ee_wrapped_dek_passphrase: string | null;
      e2ee_wrapped_dek_recovery: string | null;
    }>(
      `SELECT e2ee_enabled, e2ee_key_version, e2ee_kdf_algo, e2ee_salt_b64,
              e2ee_wrapped_dek_passphrase, e2ee_wrapped_dek_recovery
         FROM user_profiles WHERE id = ?`,
      [USER_ID],
    );
    const profile = row.rows[0];
    expect(profile?.e2ee_enabled).toBe(1);
    expect(profile?.e2ee_key_version).toBe(1);
    expect(profile?.e2ee_kdf_algo).toBe('PBKDF2-SHA256-600K');
    expect(profile?.e2ee_wrapped_dek_passphrase?.startsWith('e2ee:v1:')).toBe(true);
    expect(profile?.e2ee_wrapped_dek_recovery?.startsWith('e2ee:v1:')).toBe(true);

    // A fresh repository reading the same row sees the enabled flag.
    const reopened = new VaultRepository({ userDb, crypto: webCryptoAdapter });
    expect(await reopened.load(USER_ID)).toBe(true);
    expect(reopened.isUnlocked()).toBe(false);
  });
});

describe('VaultRepository lock & unlock (B6 §4.2.2 / §4.2.4)', () => {
  it('zeroizes the DEK on lock and refuses to encrypt while locked (P2-07)', async () => {
    await vault.initVault(USER_ID, PASSPHRASE);
    vault.lock();

    expect(vault.isUnlocked()).toBe(false);

    const error = await vault
      .cipher()
      .encrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', 'x')
      .catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('CRYPTO_VAULT_LOCKED');
  });

  it('round-trips a field written before lock after unlocking with the passphrase (P2-07)', async () => {
    await vault.initVault(USER_ID, PASSPHRASE);
    const envelope = await vault
      .cipher()
      .encrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', 'held in the vault');

    vault.lock();
    await vault.unlockWithPassphrase(USER_ID, PASSPHRASE);

    const value = await vault
      .cipher()
      .decrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', envelope);
    expect(value).toBe('held in the vault');
  });

  it('unlocks via the displayed Recovery Key', async () => {
    const outcome = await vault.initVault(USER_ID, PASSPHRASE);
    vault.lock();

    await vault.unlockWithRecoveryKey(USER_ID, outcome.recoveryKeyDisplay);
    expect(vault.isUnlocked()).toBe(true);
  });

  it('rejects a wrong passphrase as CRYPTO_INVALID_PASSPHRASE and stays locked', async () => {
    await vault.initVault(USER_ID, PASSPHRASE);
    vault.lock();

    const error = await vault.unlockWithPassphrase(USER_ID, 'nope').catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('CRYPTO_INVALID_PASSPHRASE');
    expect(vault.isUnlocked()).toBe(false);
  });

  it('reports CRYPTO_VAULT_LOCKED when unlocking before the vault is set up', async () => {
    const error = await vault.unlockWithPassphrase(USER_ID, PASSPHRASE).catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('CRYPTO_VAULT_LOCKED');
  });

  it('throws CRYPTO_DECRYPT_FAILED on an AAD-swapped field (P2-07)', async () => {
    await vault.initVault(USER_ID, PASSPHRASE);
    const cipher = vault.cipher();
    const envelope = await cipher.encrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', 'x');

    const error = await cipher
      .decrypt('prayer_item_user_states', 'row-2', 'user_notes_payload', envelope)
      .catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('CRYPTO_DECRYPT_FAILED');
  });
});

describe('VaultRepository.rewrapPassphrase (B6 §4.2.3)', () => {
  it('changes the passphrase by re-wrapping the same DEK (zero re-encryption)', async () => {
    await vault.initVault(USER_ID, PASSPHRASE);
    const envelope = await vault
      .cipher()
      .encrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', 'existing note');

    await vault.rewrapPassphrase('a-brand-new-passphrase');
    vault.lock();

    // The old passphrase no longer opens the vault; the new one does.
    const oldError = await vault.unlockWithPassphrase(USER_ID, PASSPHRASE).catch((e: unknown) => e);
    expect(isAppError(oldError) && oldError.code).toBe('CRYPTO_INVALID_PASSPHRASE');

    await vault.unlockWithPassphrase(USER_ID, 'a-brand-new-passphrase');
    const value = await vault
      .cipher()
      .decrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', envelope);
    expect(value).toBe('existing note');
  });
});

describe('VaultRepository biometric fast unlock (B6 §4.2.2)', () => {
  function makeStorage(): { adapter: SecureStorageAdapter; items: Map<string, string> } {
    const items = new Map<string, string>();
    const adapter: SecureStorageAdapter = {
      supportsBiometric: true,
      async getItem(key) {
        return items.get(key) ?? null;
      },
      async setItem(key, value) {
        items.set(key, value);
      },
      async deleteItem(key) {
        items.delete(key);
      },
    };
    return { adapter, items };
  }

  it('round-trips the DEK through the keystore so biometric unlocks after lock', async () => {
    const { adapter } = makeStorage();
    vault = new VaultRepository({ userDb, crypto: webCryptoAdapter, secureStorage: adapter });

    await vault.initVault(USER_ID, PASSPHRASE);
    const envelope = await vault
      .cipher()
      .encrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', 'kept behind Face ID');

    expect(await vault.isBiometricUnlockEnabled(USER_ID)).toBe(false);
    await vault.enableBiometricUnlock();
    expect(await vault.isBiometricUnlockEnabled(USER_ID)).toBe(true);

    vault.lock();
    expect(vault.isUnlocked()).toBe(false);

    expect(await vault.unlockWithBiometric(USER_ID)).toBe(true);
    const value = await vault
      .cipher()
      .decrypt('prayer_item_user_states', 'row-1', 'user_notes_payload', envelope);
    expect(value).toBe('kept behind Face ID');

    await vault.disableBiometricUnlock();
    expect(await vault.isBiometricUnlockEnabled(USER_ID)).toBe(false);
  });

  it('returns false when nothing is parked and clears the key on a fresh initVault', async () => {
    const { adapter, items } = makeStorage();
    vault = new VaultRepository({ userDb, crypto: webCryptoAdapter, secureStorage: adapter });

    expect(await vault.unlockWithBiometric(USER_ID)).toBe(false);

    await vault.initVault(USER_ID, PASSPHRASE);
    await vault.enableBiometricUnlock();
    expect(items.size).toBe(1);

    // A re-init generates a fresh DEK, so the previously parked key must be discarded.
    await vault.initVault(USER_ID, 'a-second-passphrase');
    expect(await vault.isBiometricUnlockEnabled(USER_ID)).toBe(false);
  });

  it('fails as CRYPTO_VAULT_LOCKED when no hardware-backed store is injected', async () => {
    await vault.initVault(USER_ID, PASSPHRASE);
    const error = await vault.enableBiometricUnlock().catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('CRYPTO_VAULT_LOCKED');
  });
});

describe('VaultRepository.initVault — batch-encrypts existing plaintext (B6 §4.2.1)', () => {
  it("re-encrypts the user's own plaintext private rows in place, leaving other users untouched", async () => {
    const ts = '2026-01-01T00:00:00Z';
    await userDb.execute(
      `INSERT INTO prayer_item_user_states
         (id, item_id, pool_id, user_id, user_notes_payload, created_at, updated_at)
       VALUES ('state-1', 'item-1', 'pool-1', ?, 'an old plaintext note', ?, ?)`,
      [USER_ID, ts, ts],
    );
    await userDb.execute(
      `INSERT INTO prayer_session_logs
         (id, user_id, framework, journal_payload, completed_at, created_at, updated_at)
       VALUES ('log-1', ?, 'ACTS', 'an old plaintext journal', ?, ?, ?)`,
      [USER_ID, ts, ts, ts],
    );
    await userDb.execute(
      `INSERT INTO prayer_item_user_states
         (id, item_id, pool_id, user_id, user_notes_payload, created_at, updated_at)
       VALUES ('state-2', 'item-2', 'pool-2', 'another-user', 'someone else note', ?, ?)`,
      [ts, ts],
    );

    await vault.initVault(USER_ID, PASSPHRASE);

    const states = await userDb.query<{
      id: string;
      user_notes_payload: string | null;
      is_encrypted: number;
    }>(`SELECT id, user_notes_payload, is_encrypted FROM prayer_item_user_states ORDER BY id`);
    const ownState = states.rows.find((row) => row.id === 'state-1');
    const otherState = states.rows.find((row) => row.id === 'state-2');
    expect(ownState?.user_notes_payload?.startsWith('e2ee:v1:')).toBe(true);
    expect(ownState?.is_encrypted).toBe(1);
    expect(otherState?.user_notes_payload).toBe('someone else note');
    expect(otherState?.is_encrypted).toBe(0);

    const logs = await userDb.query<{ journal_payload: string | null; is_encrypted: number }>(
      `SELECT journal_payload, is_encrypted FROM prayer_session_logs WHERE id = 'log-1'`,
    );
    expect(logs.rows[0]?.journal_payload?.startsWith('e2ee:v1:')).toBe(true);
    expect(logs.rows[0]?.is_encrypted).toBe(1);

    // The envelope was bound to (table|rowId|column) AAD, so the live DEK reads it straight back.
    const note = await vault
      .cipher()
      .decrypt(
        'prayer_item_user_states',
        'state-1',
        'user_notes_payload',
        ownState?.user_notes_payload ?? '',
      );
    expect(note).toBe('an old plaintext note');
  });

  it('leaves an already-encrypted envelope untouched (idempotent sweep)', async () => {
    const alreadyEncrypted = 'e2ee:v1:AAAA:BBBB';
    await userDb.execute(
      `INSERT INTO prayer_item_user_states
         (id, item_id, pool_id, user_id, user_notes_payload, is_encrypted, created_at, updated_at)
       VALUES ('state-1', 'item-1', 'pool-1', ?, ?, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      [USER_ID, alreadyEncrypted],
    );

    await vault.initVault(USER_ID, PASSPHRASE);

    const row = await userDb.query<{ user_notes_payload: string | null; is_encrypted: number }>(
      `SELECT user_notes_payload, is_encrypted FROM prayer_item_user_states WHERE id = 'state-1'`,
    );
    expect(row.rows[0]?.user_notes_payload).toBe(alreadyEncrypted);
    expect(row.rows[0]?.is_encrypted).toBe(1);
  });
});
