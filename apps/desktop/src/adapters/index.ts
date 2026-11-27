// B3 §4.1 `apps/desktop/src/adapters` — the desktop platform adapter layer.
//
// Assembles the full `CoreAdapters` (B3 §4.3) the WebView injects into `packages/core` at boot:
// the Tauri-`invoke` content DB + pack file primitives, the native writable device DBs, WebCrypto,
// WebView secure storage, HTML5 audio and the PowerSync/Supabase sync seam.

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

export { callCommand, toAppError } from './invoke';
export { getSupabaseClient } from './supabase-client';
export { SupabaseConnector } from './supabase-connector';
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

/**
 * Build the desktop `CoreAdapters`. Async because `localDevice` opens its DDL-backed database,
 * `userDb` opens the PowerSync database and `sync` may start a Supabase client on first boot. Pass
 * the result to `bootDesktopApp({ adapters })`.
 */
export async function createDesktopAdapters(): Promise<CoreAdapters> {
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
