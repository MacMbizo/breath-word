// LocalDeviceAdapter — the local-only, never-synced `local_device.sqlite` (B3 §4.3, B4 §4.4).
//
// Backs `installed_packs`, the audio LRU cache, the ESV ephemeral cache and workspace layout over
// the native writable connection. `packages/core` owns the DDL and every query; this adapter
// applies the canonical `LOCAL_DEVICE_DDL` once (gated by `PRAGMA user_version`) at first boot.

import {
  LOCAL_DEVICE_DDL,
  LOCAL_DEVICE_SCHEMA_VERSION,
  type AppErrorFallback,
  type LocalDeviceAdapter,
  type SqlQueryResult,
} from '@breath-and-word/core';
import { callCommand } from './invoke';

const FALLBACK: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Breath & Word could not read its local device data.',
};

async function runQuery<T>(sql: string, params: unknown[]): Promise<SqlQueryResult<T>> {
  const rows = await callCommand<Array<Record<string, unknown>>>(
    'local_device_query',
    { sql, params },
    FALLBACK,
  );
  return { rows: rows as unknown as T[] };
}

/** Apply the canonical DDL the first time this device DB is opened, then stamp the version. */
async function ensureSchema(): Promise<void> {
  const version = await runQuery<Record<string, number>>('PRAGMA user_version', []);
  const current = Object.values(version.rows[0] ?? {})[0] ?? 0;
  if (current >= LOCAL_DEVICE_SCHEMA_VERSION) {
    return;
  }
  await callCommand('local_device_execute_batch', { sql: LOCAL_DEVICE_DDL }, FALLBACK);
  await callCommand(
    'local_device_execute',
    { sql: `PRAGMA user_version = ${LOCAL_DEVICE_SCHEMA_VERSION}`, params: [] },
    FALLBACK,
  );
}

export async function createLocalDeviceAdapter(): Promise<LocalDeviceAdapter> {
  await ensureSchema();
  return {
    async execute(sql: string, params: unknown[] = []): Promise<void> {
      await callCommand<number>('local_device_execute', { sql, params }, FALLBACK);
    },

    query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<SqlQueryResult<T>> {
      return runQuery<T>(sql, params);
    },
  };
}
