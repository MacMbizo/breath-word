// CryptoPrimitivesAdapter — WebCrypto (`globalThis.crypto`) primitives (B3 §4.3, B6 §4).
//
// Backs the zero-knowledge E2EE vault: a CSPRNG for IVs/dek material, PBKDF2-SHA256 for the
// passphrase KDF, and AES-256-GCM for the `e2ee:v1:…` envelope. The envelope format and AAD are
// owned by `packages/core/src/crypto/envelope.ts`; this adapter only performs the raw operations.

import type { CryptoPrimitivesAdapter } from '@breath-and-word/core';

function subtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

export function createCryptoAdapter(): CryptoPrimitivesAdapter {
  return {
    randomBytes(length: number): Uint8Array {
      const bytes = new Uint8Array(length);
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    },

    async pbkdf2Sha256(
      passphrase: string,
      salt: Uint8Array,
      iterations: number,
      keyLengthBytes: number,
    ): Promise<Uint8Array> {
      const material = await subtle().importKey(
        'raw',
        new TextEncoder().encode(passphrase) as BufferSource,
        'PBKDF2',
        false,
        ['deriveBits'],
      );
      const bits = await subtle().deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
        material,
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
      const cryptoKey = await subtle().importKey('raw', key as BufferSource, 'AES-GCM', false, [
        'encrypt',
      ]);
      const ciphertext = await subtle().encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
        cryptoKey,
        plaintext as BufferSource,
      );
      return new Uint8Array(ciphertext);
    },

    async aesGcmDecrypt(
      key: Uint8Array,
      iv: Uint8Array,
      ciphertextWithTag: Uint8Array,
      aad: Uint8Array,
    ): Promise<Uint8Array> {
      const cryptoKey = await subtle().importKey('raw', key as BufferSource, 'AES-GCM', false, [
        'decrypt',
      ]);
      const plaintext = await subtle().decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
        cryptoKey,
        ciphertextWithTag as BufferSource,
      );
      return new Uint8Array(plaintext);
    },

    async sha256Hex(data: Uint8Array): Promise<string> {
      const digest = await subtle().digest('SHA-256', data as BufferSource);
      return toHex(new Uint8Array(digest));
    },
  };
}
