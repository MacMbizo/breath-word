// B3 §4.1 `apps/mobile/src/adapters` — the mobile platform adapter layer.
//
// Assembles the full `CoreAdapters` (B3 §4.3) the Expo shell injects into `packages/core` at boot:
// the op-sqlite `ATTACH DATABASE` content DB, the PowerSync/op-sqlite writable device DBs,
// react-native-quick-crypto, expo-secure-store, react-native-track-player and the expo-file-system
// pack primitives — so `packages/core` stays platform-agnostic (ADR-002).

import type { CoreAdapters } from '@breath-and-word/core';

import { createAudioAdapter } from './audio';
import { createContentDbAdapter } from './content-db';
import { createCryptoAdapter } from './crypto';
import { createLocalDeviceAdapter } from './local-device';
import { createPackInstallerAdapter } from './pack-installer';
import { createSecureStorageAdapter } from './secure-storage';
import { createUserDbAdapter } from './user-db';

export {
  createAudioAdapter,
  createContentDbAdapter,
  createCryptoAdapter,
  createLocalDeviceAdapter,
  createPackInstallerAdapter,
  createSecureStorageAdapter,
  createUserDbAdapter,
};

/**
 * Build the mobile `CoreAdapters`. Async because `localDevice` and `userDb` bootstrap their schema
 * (from the canonical core DDL) on first boot. Pass the result to `bootMobileApp({ adapters })`.
 */
export async function createMobileAdapters(): Promise<CoreAdapters> {
  const [localDevice, userDb] = await Promise.all([
    createLocalDeviceAdapter(),
    createUserDbAdapter(),
  ]);

  return {
    contentDb: createContentDbAdapter(),
    localDevice,
    userDb,
    packInstaller: createPackInstallerAdapter(),
    crypto: createCryptoAdapter(),
    secureStorage: createSecureStorageAdapter(),
    audio: createAudioAdapter(),
  };
}
