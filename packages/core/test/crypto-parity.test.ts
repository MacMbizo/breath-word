import { describe, expect, it } from 'vitest';

import { base64UrlToBytes, bytesToBase64Url } from '../src/crypto/base64url';
import {
  buildDekWrapAad,
  buildRowAad,
  bytesToUtf8,
  decryptEnvelope,
  encryptEnvelope,
  parseEnvelope,
  utf8ToBytes,
} from '../src/crypto/envelope';

import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const DEK = new Uint8Array(32).fill(7);
const ROW_AAD = buildRowAad(
  'prayer_item_user_states',
  '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  'user_notes_payload',
);

describe('E2EE envelope — Gate-1 Spike 3 (crypto parity, B6 §4.2)', () => {
  it('round-trips UTF-8 through an e2ee:v1 envelope', async () => {
    const plaintext = utf8ToBytes('Lord, teach me to pray.');
    const envelope = await encryptEnvelope(webCryptoAdapter, { dek: DEK, plaintext, aad: ROW_AAD });

    expect(envelope.startsWith('e2ee:v1:')).toBe(true);
    const decrypted = await decryptEnvelope(webCryptoAdapter, DEK, envelope, ROW_AAD);
    expect(bytesToUtf8(decrypted)).toBe('Lord, teach me to pray.');
  });

  it('generates a fresh 12-byte IV on every write (never reuses DEK+IV)', async () => {
    const plaintext = utf8ToBytes('identical content');
    const a = await encryptEnvelope(webCryptoAdapter, { dek: DEK, plaintext, aad: ROW_AAD });
    const b = await encryptEnvelope(webCryptoAdapter, { dek: DEK, plaintext, aad: ROW_AAD });

    expect(a).not.toBe(b);
    expect(parseEnvelope(a).iv.length).toBe(12);
    // 12 bytes encodes to exactly 16 unpadded base64url characters.
    expect(a.slice('e2ee:v1:'.length, a.indexOf(':', 'e2ee:v1:'.length)).length).toBe(16);
  });

  it('rejects an AAD swap (row/column substitution) as CRYPTO_DECRYPT_FAILED', async () => {
    const envelope = await encryptEnvelope(webCryptoAdapter, {
      dek: DEK,
      plaintext: utf8ToBytes('private confession'),
      aad: ROW_AAD,
    });
    const swappedAad = buildRowAad('study_notes', 'some-other-id', 'body_payload');

    await expect(decryptEnvelope(webCryptoAdapter, DEK, envelope, swappedAad)).rejects.toMatchObject({
      code: 'CRYPTO_DECRYPT_FAILED',
    });
  });

  it('rejects a tampered ciphertext byte as CRYPTO_DECRYPT_FAILED', async () => {
    const envelope = await encryptEnvelope(webCryptoAdapter, {
      dek: DEK,
      plaintext: utf8ToBytes('tamper me'),
      aad: ROW_AAD,
    });
    const { iv, ciphertext } = parseEnvelope(envelope);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    const tamperedEnvelope = `e2ee:v1:${bytesToBase64Url(iv)}:${bytesToBase64Url(tampered)}`;

    await expect(decryptEnvelope(webCryptoAdapter, DEK, tamperedEnvelope, ROW_AAD)).rejects.toMatchObject({
      code: 'CRYPTO_DECRYPT_FAILED',
      domain: 'CRYPTO',
    });
  });

  it('rejects malformed envelopes', async () => {
    await expect(decryptEnvelope(webCryptoAdapter, DEK, 'not-an-envelope', ROW_AAD)).rejects.toMatchObject({
      code: 'CRYPTO_DECRYPT_FAILED',
    });
    await expect(decryptEnvelope(webCryptoAdapter, DEK, 'e2ee:v1:abc', ROW_AAD)).rejects.toMatchObject({
      code: 'CRYPTO_DECRYPT_FAILED',
    });
  });

  it('binds the DEK wrap AAD to user_profiles rows', () => {
    expect(buildDekWrapAad('user-123', 'dek_passphrase')).toBe(
      'v1|user_profiles|user-123|dek_passphrase',
    );
    expect(buildDekWrapAad('user-123', 'dek_recovery')).toBe(
      'v1|user_profiles|user-123|dek_recovery',
    );
  });

  it('base64url helpers round-trip arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
    expect(bytesToBase64Url(new Uint8Array([251, 239, 190]))).not.toContain('=');
  });
});

describe('PBKDF2-SHA256 parity (B6 §4.2)', () => {
  it('derives deterministic 32-byte keys for identical inputs', async () => {
    const salt = new Uint8Array(16).fill(3);
    const a = await webCryptoAdapter.pbkdf2Sha256('correct horse battery staple', salt, 10_000, 32);
    const b = await webCryptoAdapter.pbkdf2Sha256('correct horse battery staple', salt, 10_000, 32);

    expect(a.length).toBe(32);
    expect(a).toEqual(b);
  });

  it('produces a different key for a different passphrase', async () => {
    const salt = new Uint8Array(16).fill(3);
    const a = await webCryptoAdapter.pbkdf2Sha256('passphrase-a', salt, 10_000, 32);
    const b = await webCryptoAdapter.pbkdf2Sha256('passphrase-b', salt, 10_000, 32);

    expect(a).not.toEqual(b);
  });
});
