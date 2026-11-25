// ContentDbAdapter — read-only content packs over op-sqlite `ATTACH DATABASE`
// (B3 §4.3, B4 §4.2, ADR-002).
//
// Packs are separate immutable SQLite files; this adapter keeps one scratch in-memory primary
// connection and ATTACHes each installed pack under an alias equal to its pack id, matching the
// `"<packId>".<table>` SQL the headless repositories emit
// (`packages/core/src/repositories/reader-repository.ts`). `ATTACH DATABASE` is per-connection, so
// `attachInstalledPacks` re-attaches on every cold start (B4 §4.6 / B7 cold-start-to-readable).

import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import {
  asAppError,
  type AppErrorFallback,
  type ContentDbAdapter,
  type SqlQueryResult,
} from '@breath-and-word/core';

const FALLBACK: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Breath & Word could not read the Bible text on this device.',
};

/** The scratch primary connection; packs are attached to it, so it owns no tables of its own. */
let database: DB | null = null;

const attached = new Set<string>();

function db(): DB {
  if (database === null) {
    // `location: ':memory:'` opens an in-memory database; `name` is ignored.
    database = open({ name: 'bw_content_index', location: ':memory:' });
  }
  return database;
}

/** Map any op-sqlite/SQLite failure onto the canonical `AppError` taxonomy (AGENTS.md rule 7). */
function wrap<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    throw asAppError(error, FALLBACK);
  });
}

/** op-sqlite takes plain filesystem paths; strip the `file://` scheme the pack layer stores. */
function toFsPath(uri: string): string {
  const withoutScheme = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  return decodeURIComponent(withoutScheme);
}

/** `ATTACH` needs the file name and directory separately (op-sqlite composes `location/name`). */
function splitFilePath(path: string): { directory: string; fileName: string } {
  const slash = path.lastIndexOf('/');
  if (slash < 0) {
    return { directory: '.', fileName: path };
  }
  return { directory: path.slice(0, slash) || '/', fileName: path.slice(slash + 1) };
}

export function createContentDbAdapter(): ContentDbAdapter {
  return {
    async attachPack(packId, absolutePath): Promise<void> {
      await wrap(async () => {
        const { directory, fileName } = splitFilePath(toFsPath(absolutePath));
        db().attach({ secondaryDbFileName: fileName, alias: packId, location: directory });
        attached.add(packId);
      });
    },

    async detachPack(packId): Promise<void> {
      await wrap(async () => {
        db().detach(packId);
        attached.delete(packId);
      });
    },

    async getAttachedPacks(): Promise<string[]> {
      return [...attached];
    },

    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<SqlQueryResult<T>> {
      return wrap(async () => {
        const result = await db().execute(sql, params as Scalar[]);
        return { rows: result.rows as unknown as T[] };
      });
    },
  };
}
