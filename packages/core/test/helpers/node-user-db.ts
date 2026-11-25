// Node implementation of the Core `UserDbAdapter` contract (B3 §4.3).
//
// Stands in for PowerSync's `user_data.sqlite` (Mobile: @powersync/react-native; Desktop:
// @powersync/web) so the reading-plan repository (FR-104) exercises the exact synced-table
// SQL the platform adapters run — including `writeTransaction` and soft-delete semantics.

import type { SqlQueryResult, UserDbAdapter } from '../../src/adapters';
import { USER_DATA_DDL } from '../../src/content/user-data-schema';

import { DatabaseSync } from './node-sqlite';
import type { DatabaseSyncInstance } from './node-sqlite';

interface Watcher {
  readonly sql: string;
  readonly params: unknown[];
  readonly onChange: (rows: unknown[]) => void;
}

export class NodeUserDbAdapter implements UserDbAdapter {
  private readonly db: DatabaseSyncInstance;
  private readonly watchers = new Set<Watcher>();

  constructor(dbPath = ':memory:', ddl: string = USER_DATA_DDL) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(ddl);
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
    const rows = this.db.prepare(sql).all(...(params as never[])) as T[];
    return { rows };
  }

  async writeTransaction<T>(
    fn: (tx: Pick<UserDbAdapter, 'execute' | 'query'>) => Promise<T>,
  ): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  watch<T>(sql: string, params: unknown[], onChange: (rows: T[]) => void): () => void {
    const watcher: Watcher = { sql, params, onChange: onChange as (rows: unknown[]) => void };
    this.watchers.add(watcher);
    void this.refresh(watcher);
    return () => {
      this.watchers.delete(watcher);
    };
  }

  /** Test-only: re-run every watcher's query and push fresh rows (PowerSync-style reactivity). */
  async refreshWatchers(): Promise<void> {
    for (const watcher of this.watchers) {
      await this.refresh(watcher);
    }
  }

  /** Test-only escape hatch for raw assertions (e.g. confirming no hard DELETE was issued). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }

  private async refresh(watcher: Watcher): Promise<void> {
    const { rows } = await this.query(watcher.sql, watcher.params);
    watcher.onChange(rows);
  }
}
