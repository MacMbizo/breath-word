// UserDbAdapter — the synced `user_data.sqlite` (B3 §4.3, B4 §4.3, ADR-002).
//
// Backed by PowerSync's `@powersync/react-native` SDK (op-sqlite) as mandated by ADR-002: rows
// written here live in the device's SQLite file and survive an app restart, and — once the WS4
// backend connector is attached (`createSyncAdapter`) — sync offline-first across devices. Without
// a configured backend the same database still opens and behaves exactly as Phase 1: `connect()`
// is never called, so no sync client, network or bucket machinery starts.
//
// PowerSync owns the synced tables: `db.init()` materialises each one from `userDataSchema` (the
// client mirror of the canonical `USER_DATA_DDL`, B4 §4.3), so every repository query in
// `packages/core/src/repositories` runs unchanged.

import { PowerSyncDatabase, type Transaction } from '@powersync/react-native';
import {
  asAppError,
  type AppErrorFallback,
  type SqlQueryResult,
  type UserDbAdapter,
} from '@breath-and-word/core';

import { userDataSchema } from './powersync-schema';

const FALLBACK: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Breath & Word could not read your study data.',
};

/** SQLite file PowerSync opens in the app's document sandbox (B4 §4.4). */
const DB_FILENAME = 'user_data.sqlite';

/** Minimum interval between `watch` re-queries (PowerSync throttling, B7 battery guardrails). */
const WATCH_THROTTLE_MS = 250;

type UserDbTx = Pick<UserDbAdapter, 'execute' | 'query'>;

let databasePromise: Promise<PowerSyncDatabase> | null = null;

/** Map any PowerSync/SQLite failure onto the canonical `AppError` taxonomy (AGENTS.md rule 7). */
function wrap<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    throw asAppError(error, FALLBACK);
  });
}

/**
 * Lazily open — and memoise — the one PowerSync connection this device owns. Shared with
 * `createSyncAdapter()` so the sync layer drives the very same database handle.
 */
export function getUserPowerSyncDatabase(): Promise<PowerSyncDatabase> {
  if (databasePromise === null) {
    databasePromise = (async () => {
      const db = new PowerSyncDatabase({
        schema: userDataSchema,
        database: { dbFilename: DB_FILENAME },
      });
      await db.init();
      return db;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw asAppError(error, FALLBACK);
    });
  }
  return databasePromise;
}

/** Bind the `UserDbAdapter` read/write pair to one PowerSync connection or transaction. */
function sqlOf(source: PowerSyncDatabase | Transaction): UserDbTx {
  return {
    async execute(sql: string, params: unknown[] = []): Promise<void> {
      // Omitting bindings lets PowerSync run a multi-statement script (our DDL).
      if (params.length === 0) {
        await source.execute(sql);
      } else {
        await source.execute(sql, params);
      }
    },

    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<SqlQueryResult<T>> {
      const rows = await source.getAll<T>(sql, params);
      return { rows };
    },
  };
}

export async function createUserDbAdapter(): Promise<UserDbAdapter> {
  const db = await getUserPowerSyncDatabase();
  const sql = sqlOf(db);

  return {
    execute: (sqlText, params = []) => wrap(() => sql.execute(sqlText, params)),

    query: <T = Record<string, unknown>>(sqlText: string, params: unknown[] = []) =>
      wrap(() => sql.query<T>(sqlText, params)),

    writeTransaction: <T>(fn: (tx: UserDbTx) => Promise<T>): Promise<T> =>
      wrap(() => db.writeTransaction((tx) => fn(sqlOf(tx)))),

    watch: <T>(sqlText: string, params: unknown[], onChange: (rows: T[]) => void): (() => void) => {
      const controller = new AbortController();
      void (async () => {
        try {
          const stream = db.watchWithAsyncGenerator(sqlText, params, {
            signal: controller.signal,
            throttleMs: WATCH_THROTTLE_MS,
          });
          for await (const result of stream) {
            onChange(result.array as unknown as T[]);
          }
        } catch {
          // Aborted on teardown, or a transient read failure; the caller re-subscribes on remount.
        }
      })();
      return () => {
        controller.abort();
      };
    },
  };
}
