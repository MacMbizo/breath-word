// UserDbAdapter — the synced `user_data.sqlite` (B3 §4.3, B4 §4.3, ADR-002).
//
// Backed by PowerSync's `@powersync/web` SDK (WA-SQLite + OPFS) as mandated by ADR-002: rows
// written here live in the WebView's OPFS-backed SQLite and survive an app restart, and — once the
// Phase-2 backend connector is attached — sync offline-first across devices. Phase 1 runs the
// database local-only: `connect()` is never called, so no sync client, network or bucket machinery
// starts.
//
// The canonical `USER_DATA_DDL` (B4 §4.3) is applied verbatim at first boot, so every repository
// query in `packages/core/src/repositories` runs unchanged. PowerSync's own sync schema starts empty
// and gains the synced tables when the Phase-2 sync layer is wired behind this same adapter.

import { PowerSyncDatabase, Schema, WASQLiteVFS, type Transaction } from '@powersync/web';
import {
  USER_DATA_DDL,
  USER_DATA_SCHEMA_VERSION,
  asAppError,
  type AppErrorFallback,
  type SqlQueryResult,
  type UserDbAdapter,
} from '@breath-and-word/core';

const FALLBACK: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Breath & Word could not read your study data.',
};

/** OPFS-backed database file PowerSync opens inside the Tauri WebView (B4 §4.4). */
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

/** Apply the canonical DDL the first time this user DB is opened, then stamp the version. */
async function ensureSchema(db: PowerSyncDatabase): Promise<void> {
  const version = await db.getOptional<Record<string, number>>('PRAGMA user_version');
  const current = version === null ? 0 : (Object.values(version)[0] ?? 0);
  if (current >= USER_DATA_SCHEMA_VERSION) {
    return;
  }
  // `USER_DATA_DDL` is a multi-statement script; PowerSync runs every statement when no bindings
  // are passed (WA-SQLite adapter `executeRaw`).
  await db.execute(USER_DATA_DDL);
  await db.execute(`PRAGMA user_version = ${USER_DATA_SCHEMA_VERSION}`);
}

/** Lazily open — and memoise — the one PowerSync connection this WebView owns. */
function openDatabase(): Promise<PowerSyncDatabase> {
  if (databasePromise === null) {
    databasePromise = (async () => {
      const db = new PowerSyncDatabase({
        // Phase 1 is local-only; the synced-table schema + backend connector arrive in Phase 2.
        schema: new Schema({}),
        database: {
          dbFilename: DB_FILENAME,
          // ADR-002 / B3 §4.2 mandate WA-SQLite + OPFS on desktop. The SDK default is the IndexedDB
          // `IDBBatchAtomicVFS` served from a *shared* worker, which violates the dual-SQLite storage
          // decision (and leaves WebView2 reusing a stale shared worker across page reloads). OPFS
          // VFSes require a dedicated worker; the desktop app is single-window, so multi-tab support
          // is intentionally off.
          vfs: WASQLiteVFS.SimpleOpfsVFS,
          enableMultiTabs: false,
        },
      });
      await db.init();
      await ensureSchema(db);
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
  const db = await openDatabase();
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
