// B3 §4.1 `apps/mobile/src/adapters` — the mobile platform adapter layer.
//
// Assembles the full `CoreAdapters` (B3 §4.3) the Expo shell injects into `packages/core` at boot:
// the op-sqlite `ATTACH DATABASE` content DB, the PowerSync/op-sqlite writable device DBs,
// react-native-quick-crypto, expo-secure-store, react-native-track-player and the expo-file-system
// pack primitives — so `packages/core` stays platform-agnostic (ADR-002).

import type { CoreAdapters } from '@breath-and-word/core';

import { createAudioAdapter } from './audio';
import { createAuthAdapter } from './auth';
import { createContentDbAdapter } from './content-db';
import { createCryptoAdapter } from './crypto';
import { createLocalDeviceAdapter } from './local-device';
import { createPackInstallerAdapter } from './pack-installer';
import { createPoolShareAdapter } from './pool-share';
import { createSecureStorageAdapter } from './secure-storage';
import { createSyncAdapter } from './sync';
import { createUserDbAdapter, getUserPowerSyncDatabase } from './user-db';

export {
  createAudioAdapter,
  createAuthAdapter,
  createContentDbAdapter,
  createCryptoAdapter,
  createLocalDeviceAdapter,
  createPackInstallerAdapter,
  createPoolShareAdapter,
  createSecureStorageAdapter,
  createSyncAdapter,
  createUserDbAdapter,
  getUserPowerSyncDatabase,
};
export { getSupabaseClient } from './supabase-client';
export { SupabaseConnector } from './supabase-connector';

/**
 * Build the mobile `CoreAdapters`. Async because `localDevice` opens its DDL-backed database,
 * `userDb` opens the PowerSync database and `sync` may start a Supabase client on first boot. Pass
 * the result to `bootMobileApp({ adapters })`.
 */
export async function createMobileAdapters(): Promise<CoreAdapters> {
  const [localDevice, userDb, sync] = await Promise.all([
    createLocalDeviceAdapter(),
    createUserDbAdapter(),
    createSyncAdapter(),
  ]);
  const auth = createAuthAdapter();
  const poolShare = createPoolShareAdapter();

  return {
    contentDb: createContentDbAdapter(),
    localDevice,
    userDb,
    sync,
    packInstaller: createPackInstallerAdapter(),
    crypto: createCryptoAdapter(),
    secureStorage: createSecureStorageAdapter(),
    audio: createAudioAdapter(),
    ...(auth === null ? {} : { auth }),
    ...(poolShare === null ? {} : { poolShare }),
  };
}
