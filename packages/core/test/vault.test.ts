// B6 §4.2/§4.3 — Vault key lifecycle acceptance.
//   init -> unlock (passphrase / recovery) -> passphrase change (zero re-encryption) -> lock

import { beforeAll, describe, expect, it } from 'vitest';

import { base64UrlToBytes } from '../src/crypto/base64url';
import { parseEnvelope } from '../src/crypto/envelope';
import {
  decodeCrockfordBase32,
  encodeCrockfordBase32,
  formatRecoveryKey,
  parseRecoveryKey,
} from '../src/crypto/recovery-key';
import {
  RECOVERY_QR_PREFIX,
  generateRecoveryQr,
  parseRecoveryQrPayload,
  recoveryKeyQrPayload,
} from '../src/crypto/recovery-qr';
import {
  DEK_BYTES,
  PBKDF2_ITERATIONS,
  VAULT_SALT_BYTES,
  biometricDekStorageKey,
  decodeBiometricDek,
  encodeDekForBiometric,
  initializeVault,
  rewrapVaultPassphrase,
  unlockVaultWithPassphrase,
  unlockVaultWithRecoveryKey,
  unlockVaultWithRecoveryKeyDisplay,
  zeroizeDek,
  type VaultInitResult,
} from '../src/crypto/vault';

import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const PASSPHRASE = 'correct horse battery staple';

let vault: VaultInitResult;

beforeAll(async () => {
  vault = await initializeVault(webCryptoAdapter, { userId: USER_ID, passphrase: PASSPHRASE });
});

describe('Vault initialization (B6 §4.2.1)', () => {
  it('generates a 32-byte DEK, 16-byte salt, recovery key, and KDF tag', () => {
    expect(vault.dek.length).toBe(DEK_BYTES);
    expect(vault.recoveryKey.length).toBe(32);
    expect(base64UrlToBytes(vault.e2eeSaltB64).length).toBe(VAULT_SALT_BYTES);
    expect(vault.e2eeKdfAlgo).toBe('PBKDF2-SHA256-600K');
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('wraps the DEK into two e2ee:v1 envelopes with fresh 12-byte IVs', () => {
    expect(vault.e2eeWrappedDekPassphrase.startsWith('e2ee:v1:')).toBe(true);
    expect(vault.e2eeWrappedDekRecovery.startsWith('e2ee:v1:')).toBe(true);
    expect(parseEnvelope(vault.e2eeWrappedDekPassphrase).iv.length).toBe(12);
    expect(parseEnvelope(vault.e2eeWrappedDekRecovery).iv.length).toBe(12);
    expect(vault.e2eeWrappedDekPassphrase).not.toBe(vault.e2eeWrappedDekRecovery);
  });

  it('displays the recovery key as 52 Crockford chars in 13 blocks of 4', () => {
    const blocks = vault.recoveryKeyDisplay.split('-');
    expect(blocks).toHaveLength(13);
    for (const block of blocks) {
      expect(block).toHaveLength(4);
      expect(block).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });
});

describe('Vault unlock (B6 §4.2.2)', () => {
  it('unwraps the exact same DEK from the passphrase wrap', async () => {
    const dek = await unlockVaultWithPassphrase(webCryptoAdapter, {
      userId: USER_ID,
      passphrase: PASSPHRASE,
      e2eeSaltB64: vault.e2eeSaltB64,
      e2eeWrappedDekPassphrase: vault.e2eeWrappedDekPassphrase,
    });
    expect(dek).toEqual(vault.dek);
  });

  it('unwraps the exact same DEK from the recovery wrap', async () => {
    const dek = await unlockVaultWithRecoveryKey(webCryptoAdapter, {
      userId: USER_ID,
      recoveryKey: vault.recoveryKey,
      e2eeWrappedDekRecovery: vault.e2eeWrappedDekRecovery,
    });
    expect(dek).toEqual(vault.dek);
  });

  it('accepts a user-typed recovery key (round-trips the displayed form)', async () => {
    const dek = await unlockVaultWithRecoveryKeyDisplay(webCryptoAdapter, {
      userId: USER_ID,
      recoveryKeyDisplay: vault.recoveryKeyDisplay,
      e2eeWrappedDekRecovery: vault.e2eeWrappedDekRecovery,
    });
    expect(dek).toEqual(vault.dek);
  });

  it('rejects a wrong passphrase as CRYPTO_INVALID_PASSPHRASE', async () => {
    await expect(
      unlockVaultWithPassphrase(webCryptoAdapter, {
        userId: USER_ID,
        passphrase: 'not-the-passphrase',
        e2eeSaltB64: vault.e2eeSaltB64,
        e2eeWrappedDekPassphrase: vault.e2eeWrappedDekPassphrase,
      }),
    ).rejects.toMatchObject({
      code: 'CRYPTO_INVALID_PASSPHRASE',
      domain: 'CRYPTO',
      retryPolicy: 'USER_ACTION',
    });
  });

  it('rejects a wrong recovery key as CRYPTO_INVALID_PASSPHRASE', async () => {
    await expect(
      unlockVaultWithRecoveryKey(webCryptoAdapter, {
        userId: USER_ID,
        recoveryKey: new Uint8Array(32).fill(1),
        e2eeWrappedDekRecovery: vault.e2eeWrappedDekRecovery,
      }),
    ).rejects.toMatchObject({ code: 'CRYPTO_INVALID_PASSPHRASE' });
  });

  it('binds each wrap to its own AAD (passphrase wrap cannot be opened by the recovery key)', async () => {
    await expect(
      unlockVaultWithRecoveryKey(webCryptoAdapter, {
        userId: USER_ID,
        recoveryKey: vault.recoveryKey,
        e2eeWrappedDekRecovery: vault.e2eeWrappedDekPassphrase,
      }),
    ).rejects.toMatchObject({ code: 'CRYPTO_INVALID_PASSPHRASE' });
  });
});

describe('Passphrase change with zero re-encryption (B6 §4.2.3)', () => {
  it('re-wraps the same DEK with a fresh salt and keeps the recovery wrap valid', async () => {
    const rewrapped = await rewrapVaultPassphrase(webCryptoAdapter, {
      userId: USER_ID,
      dek: vault.dek,
      newPassphrase: 'a-brand-new-passphrase',
    });

    expect(rewrapped.e2eeSaltB64).not.toBe(vault.e2eeSaltB64);

    const viaNewPassphrase = await unlockVaultWithPassphrase(webCryptoAdapter, {
      userId: USER_ID,
      passphrase: 'a-brand-new-passphrase',
      e2eeSaltB64: rewrapped.e2eeSaltB64,
      e2eeWrappedDekPassphrase: rewrapped.e2eeWrappedDekPassphrase,
    });
    expect(viaNewPassphrase).toEqual(vault.dek);

    await expect(
      unlockVaultWithPassphrase(webCryptoAdapter, {
        userId: USER_ID,
        passphrase: PASSPHRASE,
        e2eeSaltB64: rewrapped.e2eeSaltB64,
        e2eeWrappedDekPassphrase: rewrapped.e2eeWrappedDekPassphrase,
      }),
    ).rejects.toMatchObject({ code: 'CRYPTO_INVALID_PASSPHRASE' });

    const viaRecovery = await unlockVaultWithRecoveryKey(webCryptoAdapter, {
      userId: USER_ID,
      recoveryKey: vault.recoveryKey,
      e2eeWrappedDekRecovery: vault.e2eeWrappedDekRecovery,
    });
    expect(viaRecovery).toEqual(vault.dek);
  });
});

describe('App lock (B6 §4.2.4)', () => {
  it('zeroizes the in-memory DEK', () => {
    const dek = vault.dek.slice();
    zeroizeDek(dek);
    expect(dek.every((byte) => byte === 0)).toBe(true);
  });
});

describe('Biometric DEK parking (B6 §4.2.2)', () => {
  it('namespaces the keystore key per user', () => {
    expect(biometricDekStorageKey(USER_ID)).toBe(`bw.vault.dek.${USER_ID}`);
  });

  it('round-trips a 32-byte DEK through the base64url codec', () => {
    const dek = vault.dek.slice();
    expect(decodeBiometricDek(encodeDekForBiometric(dek))).toEqual(dek);
  });

  it('rejects a stored value that is not a 32-byte DEK', () => {
    expect(() => decodeBiometricDek('AAAA')).toThrowError(/Biometric unlock/);
  });
});

describe('Crockford Base32 recovery key codec (B6 §4.2)', () => {
  it('round-trips 32 bytes through encode/decode', () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7 + 3) % 256;
    const code = encodeCrockfordBase32(bytes);
    expect(code).toHaveLength(52);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{52}$/);
    expect(decodeCrockfordBase32(code)).toEqual(bytes);
  });

  it('resolves ambiguous letters (I/L -> 1, O -> 0) on input', () => {
    const bytes = new Uint8Array(32).fill(0);
    const canonical = formatRecoveryKey(bytes);
    const sloppy = canonical.replace(/0/gu, 'O').replace(/1/gu, 'I').toLowerCase();
    expect(parseRecoveryKey(sloppy)).toEqual(bytes);
  });

  it('rejects invalid symbols and wrong lengths', () => {
    expect(() => decodeCrockfordBase32('U')).toThrow(RangeError);
    expect(() => parseRecoveryKey('1234-5678')).toThrow(RangeError);
  });
});

describe('Recovery-Key QR code (B6 §4.2)', () => {
  it('namespaces the payload so a scanner can recognise it', () => {
    expect(recoveryKeyQrPayload('ABCD-EFGH')).toBe(`${RECOVERY_QR_PREFIX}ABCD-EFGH`);
    expect(parseRecoveryQrPayload(`${RECOVERY_QR_PREFIX}ABCD-EFGH`)).toBe('ABCD-EFGH');
  });

  it('ignores payloads that are not Recovery-Key codes', () => {
    expect(parseRecoveryQrPayload('https://example.com')).toBeNull();
    expect(parseRecoveryQrPayload(RECOVERY_QR_PREFIX)).toBeNull();
  });

  it('renders a square module matrix of a valid QR size', () => {
    const qr = generateRecoveryQr(vault.recoveryKeyDisplay);
    expect(qr.matrix).toHaveLength(qr.size);
    for (const row of qr.matrix) expect(row).toHaveLength(qr.size);
    // QR versions 1..40 are 21..177 modules; each version adds 4.
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect((qr.size - 21) % 4).toBe(0);
    // A real code mixes dark and light modules.
    expect(qr.matrix.some((row) => row.some(Boolean))).toBe(true);
    expect(qr.matrix.some((row) => row.some((module) => !module))).toBe(true);
  });

  it('is deterministic for the same recovery key', () => {
    const a = generateRecoveryQr(vault.recoveryKeyDisplay);
    const b = generateRecoveryQr(vault.recoveryKeyDisplay);
    expect(b).toEqual(a);
  });

  it('refuses to render an empty recovery key', () => {
    expect(() => generateRecoveryQr('  ')).toThrowError(/Recovery Key/);
  });
});
