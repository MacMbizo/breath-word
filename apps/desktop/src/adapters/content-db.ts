// ContentDbAdapter — read-only content packs over the native `rusqlite` connection (B3 §4.3).
//
// Forwards to the `attach_content_pack` / `detach_content_pack` / `list_attached_packs` /
// `run_content_query` commands. `run_content_query` is the generic read-only path that serves
// every repository SELECT; the native side refuses writes, so packs stay immutable (B4 §4.2).

import type { AppErrorFallback, ContentDbAdapter, SqlQueryResult } from '@breath-and-word/core';
import { callCommand } from './invoke';

const FALLBACK: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Breath & Word could not read the Bible text on this device.',
};

export function createContentDbAdapter(): ContentDbAdapter {
  return {
    async attachPack(packId, absolutePath): Promise<void> {
      await callCommand('attach_content_pack', { packId, absolutePath }, FALLBACK);
    },

    async detachPack(packId): Promise<void> {
      await callCommand('detach_content_pack', { packId }, FALLBACK);
    },

    getAttachedPacks(): Promise<string[]> {
      return callCommand<string[]>('list_attached_packs', {}, FALLBACK);
    },

    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<SqlQueryResult<T>> {
      const rows = await callCommand<Array<Record<string, unknown>>>(
        'run_content_query',
        { sql, params },
        FALLBACK,
      );
      return { rows: rows as unknown as T[] };
    },
  };
}
