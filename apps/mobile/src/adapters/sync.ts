// SyncAdapter — the PowerSync transport seam for the mobile app (FR-206, C2).
//
// `packages/core` stays transport-free (B3 §4.3); this adapter is the only place the app touches
// `@powersync/react-native` + Supabase. It reports PowerSync's connection status to the WS4 sync
// store, forwards dead-lettered uploads, and opens/closes the sync connection.
//
// Env-guarded (`Plan §6`): when the Supabase + PowerSync endpoints are absent the app stays fully
// local and the core falls back to `createLocalOnlySyncAdapter()`, so an unprovisioned build boots
// with zero network access and no regression.

import type { PowerSyncDatabase } from '@powersync/react-native';

import {
  createLocalOnlySyncAdapter,
  type RejectedMutation,
  type SyncAdapter,
  type SyncConnectionStatus,
} from '@breath-and-word/core';

import { readSyncServiceConfig } from '../config/sync-service';
import { getSupabaseClient } from './supabase-client';
import { getUserPowerSyncDatabase } from './user-db';
import { SupabaseConnector } from './supabase-connector';

/** Map PowerSync's live status onto the transport-free `SyncConnectionStatus` the core consumes. */
function toSyncConnectionStatus(db: PowerSyncDatabase): SyncConnectionStatus {
  const status = db.currentStatus;
  const lastSyncedAt = status.lastSyncedAt;
  return {
    connected: status.connected,
    uploading: status.uploading,
    downloading: status.downloading,
    ...(lastSyncedAt === undefined ? {} : { lastSyncedAt: lastSyncedAt.toISOString() }),
  };
}

/**
 * Build the mobile `SyncAdapter`. Returns the permanently-offline stub when the Supabase +
 * PowerSync endpoints are not configured (unprovisioned build — Plan §6).
 */
export async function createSyncAdapter(): Promise<SyncAdapter> {
  const config = readSyncServiceConfig();
  const supabase = getSupabaseClient();
  if (config === null || supabase === null) {
    return createLocalOnlySyncAdapter();
  }

  const db = await getUserPowerSyncDatabase();

  const statusHandlers = new Set<(status: SyncConnectionStatus) => void>();
  const rejectedHandlers = new Set<(mutation: RejectedMutation) => void>();

  db.registerListener({
    statusChanged: () => {
      const status = toSyncConnectionStatus(db);
      for (const handler of statusHandlers) {
        handler(status);
      }
    },
  });

  const connector = new SupabaseConnector({
    supabase,
    powersyncUrl: config.powersyncUrl,
    onMutationRejected: (mutation) => {
      for (const handler of rejectedHandlers) {
        handler(mutation);
      }
    },
  });

  return {
    getStatus: () => toSyncConnectionStatus(db),

    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },

    onMutationRejected(handler) {
      rejectedHandlers.add(handler);
      return () => {
        rejectedHandlers.delete(handler);
      };
    },

    async connect() {
      await db.connect(connector);
    },

    async disconnect() {
      await db.disconnect();
    },
  };
}
