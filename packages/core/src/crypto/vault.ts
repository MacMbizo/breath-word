// B6 §4.2/§4.3 — Vault key lifecycle (`e2ee:v1`).
//
//   init      : generate DEK + salt + recoveryKey, derive KEK_pass, wrap DEK twice
//   unlock    : derive KEK_pass (or use the raw recoveryKey) and unwrap DEK into RAM
//   rewrap    : change passphrase by re-wrapping the SAME DEK with a fresh salt
//   lock      : zero the in-memory DEK
//
// The DEK never leaves the device unencrypted; only the wrapped copies are persisted
// on `user_profiles` (synced via PowerSync) and the raw DEK may optionally be stored in
// the OS hardware-backed keystore for biometric fast unlock (`SecureStorageAdapter`).

import type { CryptoPrimitivesAdapter } from '../adapters';
import { AppError } from '../errors/AppError';
import { base64UrlToBytes, bytesToBase64Url } from './base64url';
import { buildDekWrapAad, decryptEnvelope, encryptEnvelope } from './envelope';
import {
  RECOVERY_KEY_BYTES,
  formatRecoveryKey,
  parseRecoveryKey,
} from './recovery-key';

/** PBKDF2-HMAC-SHA256 iterations (B6 §4.2, OWASP 2023+). */
export const PBKDF2_ITERATIONS = 600_000;
/** Persisted on `user_profiles.e2ee_kdf_algo` so a future Argon2id upgrade is detectable. */
export const KDF_ALGO = 'PBKDF2-SHA256-600K';
export const VAULT_SALT_BYTES = 16;
export const DEK_BYTES = 32;

/** The four vault columns written to `user_profiles`. */
export interface VaultMaterial {
  readonly e2eeSaltB64: string;
  readonly e2eeWrappedDekPassphrase: string;
  readonly e2eeWrappedDekRecovery: string;
  readonly e2eeKdfAlgo: typeof KDF_ALGO;
}

export interface VaultInitResult extends VaultMaterial {
  /** In-memory-only data key; never persisted in the clear. */
  readonly dek: Uint8Array;
  /** Raw recovery-key bytes — held only long enough to display/copy. */
  readonly recoveryKey: Uint8Array;
  /** The 13-block Crockford Base32 string shown to the user and encoded into the QR code. */
  readonly recoveryKeyDisplay: string;
}

export interface VaultInitParams {
  readonly userId: string;
  readonly passphrase: string;
}

export interface UnlockWithPassphraseParams {
  readonly userId: string;
  readonly passphrase: string;
  readonly e2eeSaltB64: string;
  readonly e2eeWrappedDekPassphrase: string;
  /** Defaults to `PBKDF2_ITERATIONS`; explicit only to read a legacy `e2ee_kdf_algo`. */
  readonly iterations?: number;
}

export interface UnlockWithRecoveryKeyParams {
  readonly userId: string;
  readonly recoveryKey: Uint8Array;
  readonly e2eeWrappedDekRecovery: string;
}

export interface RewrapPassphraseParams {
  readonly userId: string;
  /** The already-unlocked DEK (RAM only). */
  readonly dek: Uint8Array;
  readonly newPassphrase: string;
}

/** (1) Vault Initialization — 30-second wizard (B6 §4.2.1). */
export async function initializeVault(
  adapter: CryptoPrimitivesAdapter,
  { userId, passphrase }: VaultInitParams,
): Promise<VaultInitResult> {
  const dek = adapter.randomBytes(DEK_BYTES);
  const salt = adapter.randomBytes(VAULT_SALT_BYTES);
  const recoveryKey = adapter.randomBytes(RECOVERY_KEY_BYTES);

  const kekPass = await adapter.pbkdf2Sha256(passphrase, salt, PBKDF2_ITERATIONS, DEK_BYTES);
  const e2eeWrappedDekPassphrase = await encryptEnvelope(adapter, {
    dek: kekPass,
    plaintext: dek,
    aad: buildDekWrapAad(userId, 'dek_passphrase'),
  });
  zeroize(kekPass);

  const e2eeWrappedDekRecovery = await encryptEnvelope(adapter, {
    dek: recoveryKey,
    plaintext: dek,
    aad: buildDekWrapAad(userId, 'dek_recovery'),
  });

  return {
    e2eeSaltB64: bytesToBase64Url(salt),
    e2eeWrappedDekPassphrase,
    e2eeWrappedDekRecovery,
    e2eeKdfAlgo: KDF_ALGO,
    dek,
    recoveryKey,
    recoveryKeyDisplay: formatRecoveryKey(recoveryKey),
  };
}

/** (2) Unlock on any device with the Vault Passphrase (B6 §4.2.2). */
export async function unlockVaultWithPassphrase(
  adapter: CryptoPrimitivesAdapter,
  {
    userId,
    passphrase,
    e2eeSaltB64,
    e2eeWrappedDekPassphrase,
    iterations = PBKDF2_ITERATIONS,
  }: UnlockWithPassphraseParams,
): Promise<Uint8Array> {
  const salt = base64UrlToBytes(e2eeSaltB64);
  const kekPass = await adapter.pbkdf2Sha256(passphrase, salt, iterations, DEK_BYTES);
  try {
    return await decryptEnvelope(
      adapter,
      kekPass,
      e2eeWrappedDekPassphrase,
      buildDekWrapAad(userId, 'dek_passphrase'),
    );
  } catch (cause) {
    throw invalidCredential('Incorrect Vault Passphrase', 'passphrase wrap', cause);
  } finally {
    zeroize(kekPass);
  }
}

/** (2b) Unlock without the passphrase using the 256-bit Recovery Key (B6 §4.2.2). */
export async function unlockVaultWithRecoveryKey(
  adapter: CryptoPrimitivesAdapter,
  { userId, recoveryKey, e2eeWrappedDekRecovery }: UnlockWithRecoveryKeyParams,
): Promise<Uint8Array> {
  try {
    return await decryptEnvelope(
      adapter,
      recoveryKey,
      e2eeWrappedDekRecovery,
      buildDekWrapAad(userId, 'dek_recovery'),
    );
  } catch (cause) {
    throw invalidCredential('Incorrect Recovery Key', 'recovery wrap', cause);
  }
}

/** Unlock by parsing a user-typed 52-character recovery key (B6 §4.2). */
export async function unlockVaultWithRecoveryKeyDisplay(
  adapter: CryptoPrimitivesAdapter,
  params: Omit<UnlockWithRecoveryKeyParams, 'recoveryKey'> & { recoveryKeyDisplay: string },
): Promise<Uint8Array> {
  let recoveryKey: Uint8Array;
  try {
    recoveryKey = parseRecoveryKey(params.recoveryKeyDisplay);
  } catch (cause) {
    throw invalidCredential('Incorrect Recovery Key', 'malformed recovery key', cause);
  }
  return unlockVaultWithRecoveryKey(adapter, {
    userId: params.userId,
    recoveryKey,
    e2eeWrappedDekRecovery: params.e2eeWrappedDekRecovery,
  });
}

/**
 * (3) Passphrase change with ZERO re-encryption (B6 §4.2.3).
 * A fresh salt produces a fresh KEK that re-wraps the exact same DEK; the recovery
 * wrap is unchanged (same DEK, same recovery key), so existing notes are never touched.
 */
export async function rewrapVaultPassphrase(
  adapter: CryptoPrimitivesAdapter,
  { userId, dek, newPassphrase }: RewrapPassphraseParams,
): Promise<Pick<VaultMaterial, 'e2eeSaltB64' | 'e2eeWrappedDekPassphrase'>> {
  const salt = adapter.randomBytes(VAULT_SALT_BYTES);
  const kekPass = await adapter.pbkdf2Sha256(newPassphrase, salt, PBKDF2_ITERATIONS, DEK_BYTES);
  const e2eeWrappedDekPassphrase = await encryptEnvelope(adapter, {
    dek: kekPass,
    plaintext: dek,
    aad: buildDekWrapAad(userId, 'dek_passphrase'),
  });
  zeroize(kekPass);

  return { e2eeSaltB64: bytesToBase64Url(salt), e2eeWrappedDekPassphrase };
}

/** (4) App Lock — overwrite the in-memory DEK so it cannot be recovered from RAM. */
export function zeroizeDek(dek: Uint8Array): void {
  zeroize(dek);
}

/**
 * B6 §4.2.2 — the OS-keystore key under which the raw DEK is parked for biometric fast unlock.
 * Namespaced per user so a shared device never crosses vaults.
 */
export function biometricDekStorageKey(userId: string): string {
  return `bw.vault.dek.${userId}`;
}

/** B6 §4.2.2 — base64url form of the raw DEK written to the hardware-backed keystore. */
export function encodeDekForBiometric(dek: Uint8Array): string {
  return bytesToBase64Url(dek);
}

/**
 * B6 §4.2.2 — decode a DEK parked in the keystore. A malformed or wrong-length value is a canonical
 * `CRYPTO_VAULT_LOCKED` so the UI falls back to the Vault Passphrase.
 */
export function decodeBiometricDek(stored: string): Uint8Array {
  let dek: Uint8Array;
  try {
    dek = base64UrlToBytes(stored);
  } catch (cause) {
    throw biometricUnavailable('The stored biometric key is not valid base64url.', cause);
  }
  if (dek.length !== DEK_BYTES) {
    throw biometricUnavailable(
      `Stored biometric key decoded to ${dek.length} bytes, expected ${DEK_BYTES}.`,
    );
  }
  return dek;
}

function zeroize(bytes: Uint8Array): void {
  bytes.fill(0);
}

function biometricUnavailable(internalDetail: string, cause?: unknown): AppError {
  return new AppError({
    code: 'CRYPTO_VAULT_LOCKED',
    domain: 'CRYPTO',
    retryPolicy: 'USER_ACTION',
    userMessage: 'Biometric unlock is not available. Please use your Vault Passphrase.',
    internalDetail,
    cause,
  });
}

/**
 * C3 has no dedicated recovery-key code; both wraps are "the credential failed the GCM
 * tag check", so both surface as `CRYPTO_INVALID_PASSPHRASE` with copy specific to the
 * attempted method.
 */
function invalidCredential(userMessage: string, internalDetail: string, cause: unknown): AppError {
  return new AppError({
    code: 'CRYPTO_INVALID_PASSPHRASE',
    domain: 'CRYPTO',
    retryPolicy: 'USER_ACTION',
    userMessage,
    internalDetail: `DEK unwrap failed (${internalDetail}).`,
    cause,
  });
}
