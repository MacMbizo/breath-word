// B3 §4.1 / §4.2 rule 2 — headless Content Pack Manager store (FR-105).
//
// Framework-free `zustand/vanilla` store the Library/Storage screens subscribe to. Installs,
// updates and removals run through `PackManagerRepository`; per-pack download progress is
// mirrored into `progress` for progress bars. Failures surface as canonical `AppError`s.

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ManifestPackEntry } from '../content/pack-manifest';
import { asAppError, type AppError, type AppErrorFallback } from '../errors/AppError';
import type {
  InstalledPack,
  PackInstallPhase,
  PackInstallProgress,
  PackManagerRepository,
} from '../repositories/pack-manager-repository';

import type { AsyncStatus } from './types';

const PACK_FAILURE: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'The content pack operation could not be completed. Please try again.',
};

/** In-flight progress for a single pack install/update (FR-105 progress bar). */
export interface PackProgress {
  readonly packId: string;
  readonly phase: PackInstallPhase;
  readonly receivedBytes: number;
  readonly totalBytes: number;
}

export interface PackStoreState {
  readonly installed: readonly InstalledPack[];
  /** Sum of installed pack sizes in bytes (the FR-105 offline storage total). */
  readonly storageBytes: number;
  readonly status: AsyncStatus;
  readonly error: AppError | null;
  readonly progress: PackProgress | null;
}

export interface PackStoreActions {
  /** Reload `installed` + `storageBytes` from the device DB. */
  refresh(): Promise<void>;
  /** Boot step — re-attach installed packs (B4 §4.6); returns the ids attached. */
  restoreAttached(): Promise<readonly string[]>;
  install(entry: ManifestPackEntry): Promise<InstalledPack | null>;
  update(entry: ManifestPackEntry): Promise<InstalledPack | null>;
  remove(packId: string): Promise<void>;
}

export type PackStore = StoreApi<PackStoreState & PackStoreActions>;

const INITIAL_STATE: PackStoreState = {
  installed: [],
  storageBytes: 0,
  status: 'idle',
  error: null,
  progress: null,
};

export function createPackStore(packs: PackManagerRepository): PackStore {
  return createStore<PackStoreState & PackStoreActions>()((set) => {
    const reload = async (): Promise<void> => {
      const [installed, storageBytes] = await Promise.all([
        packs.listInstalled(),
        packs.storageUsageBytes(),
      ]);
      set({ installed, storageBytes });
    };

    const progressReporter = (packId: string): PackInstallProgress => (phase, receivedBytes, totalBytes) =>
      set({ progress: { packId, phase, receivedBytes, totalBytes } });

    const apply = async (
      entry: ManifestPackEntry,
      run: () => Promise<InstalledPack>,
    ): Promise<InstalledPack | null> => {
      set({ status: 'loading', error: null, progress: null });
      try {
        const installed = await run();
        await reload();
        set({ status: 'ready', progress: null });
        return installed;
      } catch (error) {
        set({ status: 'error', error: asAppError(error, PACK_FAILURE), progress: null });
        return null;
      }
    };

    return {
      ...INITIAL_STATE,

      async refresh() {
        set({ status: 'loading', error: null });
        try {
          await reload();
          set({ status: 'ready' });
        } catch (error) {
          set({ status: 'error', error: asAppError(error, PACK_FAILURE) });
        }
      },

      async restoreAttached() {
        try {
          return await packs.attachInstalledPacks();
        } catch (error) {
          set({ error: asAppError(error, PACK_FAILURE) });
          return [];
        }
      },

      install(entry) {
        return apply(entry, () => packs.install(entry, progressReporter(entry.packId)));
      },

      update(entry) {
        return apply(entry, () => packs.update(entry, progressReporter(entry.packId)));
      },

      async remove(packId) {
        set({ status: 'loading', error: null });
        try {
          await packs.remove(packId);
          await reload();
          set({ status: 'ready' });
        } catch (error) {
          set({ status: 'error', error: asAppError(error, PACK_FAILURE) });
        }
      },
    };
  });
}
