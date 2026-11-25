// Node implementation of the Core `ContentDbAdapter` contract (B3 §4.3).
//
// The shipping app injects op-sqlite (Mobile) and Rust rusqlite (Tauri). This Node
// implementation lets Gate-1 Spike 1 exercise the *exact* attach/FTS5 SQL the platform
// adapters will run, without native bindings. Packs are namespaced via `ATTACH DATABASE`
// so multiple translations (`core_bsb.verses`, `trans_web.verses`) can be queried together.

import type { ContentDbAdapter, SqlQueryResult } from '../../src/adapters';

import { DatabaseSync } from './node-sqlite';
import type { DatabaseSyncInstance } from './node-sqlite';

/** Pack ids become SQLite schema names, so they must be simple identifiers. */
const SAFE_SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;

export class NodeContentDbAdapter implements ContentDbAdapter {
  private readonly db: DatabaseSyncInstance;

  constructor(dbPath = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  /** Escape an absolute path for a single-quoted SQL string literal. */
  private quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private assertSafeSchemaName(packId: string): void {
    if (!SAFE_SCHEMA_NAME.test(packId)) {
      throw new Error(`Invalid pack id "${packId}": expected [a-z][a-z0-9_]*.`);
    }
  }

  async attachPack(packId: string, absolutePath: string): Promise<void> {
    this.assertSafeSchemaName(packId);
    this.db.exec(`ATTACH DATABASE ${this.quoteLiteral(absolutePath)} AS "${packId}";`);
  }

  async detachPack(packId: string): Promise<void> {
    this.assertSafeSchemaName(packId);
    this.db.exec(`DETACH DATABASE "${packId}";`);
  }

  async getAttachedPacks(): Promise<string[]> {
    const result = await this.query<{ name: string }>(
      "SELECT name FROM pragma_database_list WHERE name NOT IN ('main', 'temp');",
    );
    return result.rows.map((row) => row.name);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
    const statement = this.db.prepare(sql);
    const rows = statement.all(...(params as never[])) as T[];
    return { rows };
  }

  /** Test-only escape hatch for setup/assertions beyond the read-only content contract. */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}
