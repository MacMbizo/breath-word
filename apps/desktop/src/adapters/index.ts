// B3 §4.1 `apps/desktop/src/adapters` — the desktop platform adapter layer.
//
// Assembles the full `CoreAdapters` (B3 §4.3) the WebView injects into `packages/core` at boot:
// the Tauri-`invoke` content DB + pack file primitives, the native writable device DBs, WebCrypto,
// WebView secure storage and HTML5 audio.

import type { CoreAdapters } from '@breath-and-word/core';

import { createAudioAdapter } from './audio';
import { createContentDbAdapter } from './content-db';
import { createCryptoAdapter } from './crypto';
import { createLocalDeviceAdapter } from './local-device';
import { createPackInstallerAdapter } from './pack-installer';
import { createSecureStorageAdapter } from './secure-storage';
import { createUserDbAdapter } from './user-db';

export { callCommand, toAppError } from './invoke';
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
 * Build the desktop `CoreAdapters`. Async because `localDevice` and `userDb` bootstrap their
 * schema (from the canonical core DDL) on first boot. Pass the result to
 * `bootDesktopApp({ adapters })`.
 */
export async function createDesktopAdapters(): Promise<CoreAdapters> {
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
