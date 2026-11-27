// B3 §4.1 `stores/` — headless sync-status store (FR-206).
//
// A framework-free `zustand/vanilla` store the offline pill + "sync issues" surfaces subscribe
// to. It wraps the injected `SyncAdapter`, mirrors `connected/uploading/downloading/lastSyncedAt`,
// raises the canonical `SYNC_OFFLINE` copy while disconnected, and keeps a dead-letter list of
// fatal upload rejections (`C2 §4.2`) so a single bad mutation never jams the queue. It never
// throws (failures land in `error` as a canonical `AppError` — AGENTS.md rule 7).

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { RejectedMutation, SyncAdapter, SyncConnectionStatus } from '../adapters';
import { asAppError, type AppError } from '../errors/AppError';
import type { CoreEventEmitter } from '../events';
import { SYNC_OFFLINE_FALLBACK, syncOfflineError } from '../sync';

import type { AsyncStatus } from './types';

/** Retained dead-lettered mutations before older entries are dropped. */
const DEFAULT_MAX_REJECTED = 20;

export interface SyncStoreDeps {
  /** The transport seam; `createLocalOnlySyncAdapter()` keeps the app fully local (Plan §6). */
  readonly adapter: SyncAdapter;
  /** Optional `C2 §4.3` fan-out: emits `SYNC_STATUS_CHANGED` / `SYNC_MUTATION_REJECTED`. */
  readonly emitter?: CoreEventEmitter;
  /** Cap on retained dead-lettered mutations (newest first). Defaults to 20. */
  readonly maxRejected?: number;
}

export interface SyncStoreState {
  readonly status: AsyncStatus;
  readonly error: AppError | null;
  readonly connected: boolean;
  readonly uploading: boolean;
  readonly downloading: boolean;
  readonly lastSyncedAt: string | null;
  /** True whenever the transport is disconnected — drives the subtle offline pill (`C3`). */
  readonly offline: boolean;
  /** Canonical `SYNC_OFFLINE` error while offline, else `null`. */
  readonly offlineError: AppError | null;
  /** Fatal upload rejections, newest first (`C2 §4.2` dead-letter). */
  readonly rejectedMutations: RejectedMutation[];
}

export interface SyncStoreActions {
  /** Seed from the adapter, subscribe to its callbacks, then `connect()`. Idempotent. */
  start(): Promise<void>;
  /** Drop subscriptions and report the disconnected (offline) state. */
  stop(): Promise<void>;
  /** Remove one dead-lettered mutation once the user has acknowledged it. */
  dismissRejected(table: string, rowId: string): void;
  /** Clear the entire dead-letter list. */
  clearRejected(): void;
}

export type SyncStore = StoreApi<SyncStoreState & SyncStoreActions>;

export function createSyncStore(deps: SyncStoreDeps): SyncStore {
  const { adapter, emitter, maxRejected = DEFAULT_MAX_REJECTED } = deps;

  // Subscriptions live in the closure, never in state (functions do not belong in the store).
  let unsubscribers: Array<() => void> = [];

  return createStore<SyncStoreState & SyncStoreActions>()((set) => {
    const applyStatus = (status: SyncConnectionStatus): void => {
      const offline = !status.connected;
      set({
        connected: status.connected,
        uploading: status.uploading,
        downloading: status.downloading,
        lastSyncedAt: status.lastSyncedAt ?? null,
        offline,
        offlineError: offline ? syncOfflineError() : null,
      });
      emitter?.emit({
        type: 'SYNC_STATUS_CHANGED',
        connected: status.connected,
        uploading: status.uploading,
        downloading: status.downloading,
        ...(status.lastSyncedAt !== undefined ? { lastSyncedAt: status.lastSyncedAt } : {}),
      });
    };

    const applyRejected = (mutation: RejectedMutation): void => {
      set((state) => ({
        rejectedMutations: [mutation, ...state.rejectedMutations].slice(0, maxRejected),
      }));
      emitter?.emit({
        type: 'SYNC_MUTATION_REJECTED',
        table: mutation.table,
        rowId: mutation.rowId,
        errorCode: mutation.errorCode,
      });
    };

    return {
      status: 'idle',
      error: null,
      connected: false,
      uploading: false,
      downloading: false,
      lastSyncedAt: null,
      offline: true,
      offlineError: syncOfflineError(),
      rejectedMutations: [],

      async start() {
        set({ status: 'loading', error: null });
        // Reflect the adapter's current state before the first callback arrives.
        applyStatus(adapter.getStatus());
        if (unsubscribers.length === 0) {
          unsubscribers = [adapter.onStatusChange(applyStatus), adapter.onMutationRejected(applyRejected)];
        }
        try {
          await adapter.connect();
          set({ status: 'ready' });
        } catch (error) {
          set({ status: 'error', error: asAppError(error, SYNC_OFFLINE_FALLBACK), offline: true, offlineError: syncOfflineError() });
        }
      },

      async stop() {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
        unsubscribers = [];
        try {
          await adapter.disconnect();
        } catch (error) {
          set({ status: 'error', error: asAppError(error, SYNC_OFFLINE_FALLBACK) });
          return;
        }
        set({
          status: 'idle',
          connected: false,
          uploading: false,
          downloading: false,
          offline: true,
          offlineError: syncOfflineError(),
        });
      },

      dismissRejected(table, rowId) {
        set((state) => ({
          rejectedMutations: state.rejectedMutations.filter(
            (mutation) => !(mutation.table === table && mutation.rowId === rowId),
          ),
        }));
      },

      clearRejected() {
        set({ rejectedMutations: [] });
      },
    };
  });
}
