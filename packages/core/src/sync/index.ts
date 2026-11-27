// C2 §4.2 / C3 §4.3 — sync-domain seam for `packages/core`.
//
// Holds the canonical `SYNC_OFFLINE` / `SYNC_MUTATION_REJECTED` error copy and the
// transport-free default `SyncAdapter` used until WS4 provisioning lands (Plan §6),
// so the offline pill and dead-letter surfaces work with zero network access.

import type { RejectedMutation, SyncAdapter, SyncConnectionStatus } from '../adapters';
import { AppError, type AppErrorFallback } from '../errors/AppError';

/** C3 §4.3 — device lacks connectivity; reads/writes continue seamlessly against local SQLite. */
export const SYNC_OFFLINE_FALLBACK: AppErrorFallback = {
  code: 'SYNC_OFFLINE',
  domain: 'SYNC',
  retryPolicy: 'EXPONENTIAL_BACKOFF',
  userMessage: "You're offline. Your changes are saved on this device and will sync when you reconnect.",
};

/** C3 §4.3 — a fatal 400/403 mutation was dead-lettered so the upload queue never jams. */
export const SYNC_MUTATION_REJECTED_FALLBACK: AppErrorFallback = {
  code: 'SYNC_MUTATION_REJECTED',
  domain: 'SYNC',
  retryPolicy: 'NONE',
  userMessage: "One change couldn't be synced and was skipped so your other edits keep syncing.",
};

export function syncOfflineError(): AppError {
  return new AppError(SYNC_OFFLINE_FALLBACK);
}

export function syncMutationRejectedError(mutation: RejectedMutation): AppError {
  return new AppError({
    ...SYNC_MUTATION_REJECTED_FALLBACK,
    httpStatus: 403,
    internalDetail: `${mutation.table}:${mutation.rowId} ${mutation.errorCode}`,
  });
}

const OFFLINE_STATUS: SyncConnectionStatus = {
  connected: false,
  uploading: false,
  downloading: false,
};

/**
 * A `SyncAdapter` that never touches the network and reports permanently offline. Used as the
 * default when no platform adapter is injected, so `connect()` is a no-op and the app stays
 * fully local (Plan §6) — an offline pill over an otherwise working app, never an error.
 */
export function createLocalOnlySyncAdapter(): SyncAdapter {
  return {
    getStatus() {
      return OFFLINE_STATUS;
    },
    onStatusChange() {
      return () => {};
    },
    onMutationRejected() {
      return () => {};
    },
    async connect() {},
    async disconnect() {},
  };
}
