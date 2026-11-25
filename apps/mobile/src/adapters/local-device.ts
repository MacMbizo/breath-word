// LocalDeviceAdapter — the local-only, never-synced `local_device.sqlite` (B3 §4.3, B4 §4.4).
//
// Backs `installed_packs`, the audio LRU cache, the ESV ephemeral cache and workspace layout over an
// op-sqlite connection. `packages/core` owns the DDL and every query; this adapter applies the
// canonical `LOCAL_DEVICE_DDL` once (gated by `PRAGMA user_version`) at first boot.

import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import {
  LOCAL_DEVICE_DDL,
  LOCAL_DEVICE_SCHEMA_VERSION,
  asAppError,
  type AppErrorFallback,
  type LocalDeviceAdapter,
  type SqlQueryResult,
} from '@breath-and-word/core';

const FALLBACK: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Breath & Word could not read its local device data.',
};

const DB_NAME = 'local_device.sqlite';

let databasePromise: Promise<DB> | null = null;

function wrap<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    throw asAppError(error, FALLBACK);
  });
}

/** op-sqlite runs one statement per `execute`; the canonical DDL is a `;`-separated script. */
function splitStatements(script: string): string[] {
  return script
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Apply the canonical DDL the first time this device DB is opened, then stamp the version. */
async function ensureSchema(db: DB): Promise<void> {
  const version = await db.execute('PRAGMA user_version');
  const current = Number(Object.values(version.rows[0] ?? {})[0] ?? 0);
  if (current >= LOCAL_DEVICE_SCHEMA_VERSION) {
    return;
  }
  const commands = splitStatements(LOCAL_DEVICE_DDL).map((statement): [string] => [statement]);
  await db.executeBatch(commands);
  await db.execute(`PRAGMA user_version = ${LOCAL_DEVICE_SCHEMA_VERSION}`);
}

/** Lazily open — and memoise — the one op-sqlite connection this device owns. */
function openDevice(): Promise<DB> {
  if (databasePromise === null) {
    databasePromise = (async () => {
      const db = open({ name: DB_NAME });
      await ensureSchema(db);
      return db;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw asAppError(error, FALLBACK);
    });
  }
  return databasePromise;
}

export async function createLocalDeviceAdapter(): Promise<LocalDeviceAdapter> {
  const db = await openDevice();
  return {
    async execute(sql: string, params: unknown[] = []): Promise<void> {
      await wrap(async () => {
        await db.execute(sql, params as Scalar[]);
      });
    },

    query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<SqlQueryResult<T>> {
      return wrap(async () => {
        const result = await db.execute(sql, params as Scalar[]);
        return { rows: result.rows as unknown as T[] };
      });
    },
  };
}
