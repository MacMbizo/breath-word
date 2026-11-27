// SecureStorageAdapter (B3 §4.3) — key/value storage for the optional vault-unlock material.
//
// Phase-1 placeholder: WebView `localStorage` under a namespaced prefix. B3 §4.1 targets the OS
// Keychain via a Tauri plugin for release builds; that swap changes only this file. Passphrases
// and the wrapped DEK are never written here in plaintext — `packages/core` only stores the
// recovery-wrapped key material it derives from the vault.

import type { SecureStorageAdapter } from '@breath-and-word/core';

const PREFIX = 'bw.secure.';

export function createSecureStorageAdapter(): SecureStorageAdapter {
  return {
    // B3 §4.1 still targets the OS Keychain (macOS/Windows) via a Tauri plugin. Until that lands
    // this `localStorage` placeholder is not hardware-backed, so the vault never parks a raw DEK
    // here and biometric fast-unlock stays unavailable (B6 §4.2.2).
    supportsBiometric: false,

    async getItem(key: string): Promise<string | null> {
      return globalThis.localStorage.getItem(PREFIX + key);
    },

    async setItem(key: string, value: string): Promise<void> {
      globalThis.localStorage.setItem(PREFIX + key, value);
    },

    async deleteItem(key: string): Promise<void> {
      globalThis.localStorage.removeItem(PREFIX + key);
    },
  };
}
