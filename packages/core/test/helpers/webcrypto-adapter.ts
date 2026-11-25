// Node WebCrypto implementation of CryptoPrimitivesAdapter.
// Mirrors what react-native-quick-crypto (Mobile) and globalThis.crypto.subtle
// (Desktop/Web) expose, so the envelope engine is verified against the same
// AES-256-GCM / PBKDF2-SHA256 primitives the platform adapters will use.

import { webcrypto } from 'node:crypto';

import type { CryptoPrimitivesAdapter } from '../../src/adapters';

const subtle = webcrypto.subtle;

export const webCryptoAdapter: CryptoPrimitivesAdapter = {
  randomBytes(length: number): Uint8Array {
    return webcrypto.getRandomValues(new Uint8Array(length));
  },

  async pbkdf2Sha256(
    passphrase: string,
    salt: Uint8Array,
    iterations: number,
    keyLengthBytes: number,
  ): Promise<Uint8Array> {
    const key = await subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      keyLengthBytes * 8,
    );
    return new Uint8Array(bits);
  },

  async aesGcmEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array> {
    const cryptoKey = await subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const ciphertext = await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      cryptoKey,
      plaintext,
    );
    return new Uint8Array(ciphertext);
  },

  async aesGcmDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertextWithTag: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array> {
    const cryptoKey = await subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
    const plaintext = await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      cryptoKey,
      ciphertextWithTag,
    );
    return new Uint8Array(plaintext);
  },

  async sha256Hex(data: Uint8Array): Promise<string> {
    const digest = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  },
};
