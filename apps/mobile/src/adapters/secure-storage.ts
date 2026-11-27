// SecureStorageAdapter (B3 §4.3) — key/value storage for the optional vault-unlock material.
//
// Backed by `expo-secure-store`: iOS Keychain and Android EncryptedSharedPreferences. Only
// recovery-wrapped key material the vault derives is written here — never a plaintext passphrase or
// DEK (`packages/core` owns that boundary). SecureStore keys may contain only alphanumerics, `.`,
// `-` and `_`, which the `bw.secure.` prefix respects.

import * as SecureStore from 'expo-secure-store';
import type { SecureStorageAdapter } from '@breath-and-word/core';

const PREFIX = 'bw.secure.';

export function createSecureStorageAdapter(): SecureStorageAdapter {
  return {
    // iOS Keychain / Android EncryptedSharedPreferences are hardware-backed (B6 §4.2.2).
    supportsBiometric: true,

    async getItem(key: string): Promise<string | null> {
      return SecureStore.getItemAsync(PREFIX + key);
    },

    async setItem(key: string, value: string, options): Promise<void> {
      await SecureStore.setItemAsync(PREFIX + key, value, {
        // B6 §4.2.2 — gate the parked vault DEK behind FaceID/TouchID/fingerprint.
        requireAuthentication: options?.requireAuthentication === true,
      });
    },

    async deleteItem(key: string): Promise<void> {
      await SecureStore.deleteItemAsync(PREFIX + key);
    },
  };
}
