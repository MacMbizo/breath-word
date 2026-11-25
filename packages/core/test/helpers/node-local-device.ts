// Node implementation of the Core `LocalDeviceAdapter` contract (B3 §4.3).
//
// Mirrors the local-only, never-synced `local_device.sqlite` (B4 §4.4) so the Content
// Pack Manager tests exercise the exact `installed_packs` SQL the platform adapters run.

import { LOCAL_DEVICE_DDL } from '../../src/content/local-device-schema';
import type { LocalDeviceAdapter, SqlQueryResult } from '../../src/adapters';

import { DatabaseSync } from './node-sqlite';
import type { DatabaseSyncInstance } from './node-sqlite';

export class NodeLocalDeviceAdapter implements LocalDeviceAdapter {
  private readonly db: DatabaseSyncInstance;

  constructor(dbPath = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(LOCAL_DEVICE_DDL);
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
    const rows = this.db.prepare(sql).all(...(params as never[])) as T[];
    return { rows };
  }

  close(): void {
    this.db.close();
  }
}
