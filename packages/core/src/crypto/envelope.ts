// B6 §4.2 — `e2ee:v1` storage envelope engine.
// wire format: e2ee:v1:<iv_base64url>:<ciphertext_and_tag_base64url>
// AAD (authoritative, per B6 §4.2 / AGENTS.md): "v1|<table>|<row_id>|<column>"

import type { CryptoPrimitivesAdapter } from '../adapters';
import { AppError } from '../errors/AppError';
import { base64UrlToBytes, bytesToBase64Url } from './base64url';

const ENVELOPE_PREFIX = 'e2ee:v1:';
const IV_BYTES = 12;

/** True when a stored string carries the `e2ee:v1:` ciphertext envelope prefix (B6 §4.2). */
export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** AAD for data rows (binds ciphertext to its table/row/column, defeating substitution). */
export function buildRowAad(tableName: string, rowId: string, columnName: string): string {
  return `v1|${tableName}|${rowId}|${columnName}`;
}

/** AAD for the two wrapped DEK copies stored on user_profiles. */
export function buildDekWrapAad(userId: string, wrap: 'dek_passphrase' | 'dek_recovery'): string {
  return `v1|user_profiles|${userId}|${wrap}`;
}

export interface ParsedEnvelope {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export function parseEnvelope(envelope: string): ParsedEnvelope {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw decryptFailed('Envelope is missing the "e2ee:v1:" prefix.');
  }
  const rest = envelope.slice(ENVELOPE_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator >= rest.length - 1) {
    throw decryptFailed('Envelope is malformed (expected <iv>:<ciphertext>).');
  }

  const ivPart = rest.slice(0, separator);
  const ctPart = rest.slice(separator + 1);

  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = base64UrlToBytes(ivPart);
    ciphertext = base64UrlToBytes(ctPart);
  } catch (cause) {
    throw decryptFailed('Envelope contains invalid base64url.', cause);
  }

  if (iv.length !== IV_BYTES) {
    throw decryptFailed(`Envelope IV must be ${IV_BYTES} bytes.`);
  }
  return { iv, ciphertext };
}

export interface EncryptEnvelopeParams {
  dek: Uint8Array;
  plaintext: Uint8Array;
  aad: string;
}

/**
 * Encrypt bytes into an `e2ee:v1:...` envelope.
 * A brand-new 12-byte CSPRNG IV is generated on every call (never reused with a DEK).
 */
export async function encryptEnvelope(
  adapter: CryptoPrimitivesAdapter,
  params: EncryptEnvelopeParams,
): Promise<string> {
  const iv = adapter.randomBytes(IV_BYTES);
  const ciphertext = await adapter.aesGcmEncrypt(
    params.dek,
    iv,
    params.plaintext,
    textEncoder.encode(params.aad),
  );
  return `${ENVELOPE_PREFIX}${bytesToBase64Url(iv)}:${bytesToBase64Url(ciphertext)}`;
}

/**
 * Decrypt an `e2ee:v1:...` envelope. Any tampering (ciphertext, IV, or AAD/row swap)
 * throws `CRYPTO_DECRYPT_FAILED` (C3).
 */
export async function decryptEnvelope(
  adapter: CryptoPrimitivesAdapter,
  dek: Uint8Array,
  envelope: string,
  aad: string,
): Promise<Uint8Array> {
  const { iv, ciphertext } = parseEnvelope(envelope);
  try {
    return await adapter.aesGcmDecrypt(dek, iv, ciphertext, textEncoder.encode(aad));
  } catch (cause) {
    throw decryptFailed('AES-GCM authentication failed (tampered data or AAD mismatch).', cause);
  }
}

export function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function decryptFailed(internalDetail: string, cause?: unknown): AppError {
  return new AppError({
    code: 'CRYPTO_DECRYPT_FAILED',
    domain: 'CRYPTO',
    retryPolicy: 'NONE',
    userMessage: 'This encrypted entry could not be verified.',
    internalDetail,
    cause,
  });
}
