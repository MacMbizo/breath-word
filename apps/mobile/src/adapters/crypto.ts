// CryptoPrimitivesAdapter — react-native-quick-crypto primitives (B3 §4.3, B6 §4).
//
// Backs the zero-knowledge E2EE vault on native: a CSPRNG for IVs/dek material, PBKDF2-SHA256 for
// the passphrase KDF, and AES-256-GCM for the `e2ee:v1:…` envelope. The envelope format and AAD are
// owned by `packages/core/src/crypto/envelope.ts`; this adapter only performs the raw operations.
//
// `react-native-quick-crypto` implements the WebCrypto `SubtleCrypto` subset we need on the
// device's native JSI (OpenSSL-backed), so the operations mirror the desktop WebCrypto adapter.

import QuickCrypto from 'react-native-quick-crypto';
import type { CryptoPrimitivesAdapter } from '@breath-and-word/core';

function subtle(): typeof QuickCrypto.subtle {
  return QuickCrypto.subtle;
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
      QuickCrypto.getRandomValues(bytes);
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
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveBits'],
      );
      const bits = await subtle().deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
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
      const cryptoKey = await subtle().importKey('raw', key, 'AES-GCM', false, ['encrypt']);
      const ciphertext = await subtle().encrypt(
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
      const cryptoKey = await subtle().importKey('raw', key, 'AES-GCM', false, ['decrypt']);
      const plaintext = await subtle().decrypt(
        { name: 'AES-GCM', iv, additionalData: aad },
        cryptoKey,
        ciphertextWithTag,
      );
      return new Uint8Array(plaintext);
    },

    async sha256Hex(data: Uint8Array): Promise<string> {
      const digest = await subtle().digest('SHA-256', data);
      return toHex(new Uint8Array(digest));
    },
  };
}
