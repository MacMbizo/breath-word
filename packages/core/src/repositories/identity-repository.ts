// C4 §4.1 — Offline Guest → Authenticated account identity (FR-206).
//
// On first launch the app runs in Offline Guest Mode: every local row is written under a
// device-generated `guestUserId` persisted in `local_device.sqlite` (`workspace_state`) and
// PowerSync stays disconnected. When the guest signs into a Supabase account the app performs
// the **Zero-Loss Guest → Account Upgrade**: one atomic local transaction rewrites
// `user_id` (and `owner_user_id` / `created_by_user_id`) from the guest id to the Supabase
// `authUserId`, after which the app connects PowerSync and the rows upload into the account
// (that connect/upload half is `P2-13`; this repository owns only the local rewrite).
//
// Per AGENTS.md rule 1 this is the ONLY place the identity-rewrite SQL may live. Every synced
// table is soft-delete-only, so migration is a pure `UPDATE` — no row is ever hard-deleted.

import type { CryptoPrimitivesAdapter, LocalDeviceAdapter, UserDbAdapter } from '../adapters';
import { guestMigrationError } from '../auth';
import { uuidV4 } from '../crypto/uuid';
import type { AppError } from '../errors/AppError';

/** `workspace_state` key holding the device's guest identity while signed out (C4 §4.1). */
export const GUEST_USER_ID_KEY = 'guest_user_id';

/** `workspace_state` key recording the Supabase account id once the device is upgraded. */
export const ACCOUNT_USER_ID_KEY = 'account_user_id';

/**
 * Every column that carries an owning user across the 11 synced tables (B4 §4.3), paired with
 * the table that owns it. `user_profiles` is keyed by `id` (which equals the account id).
 */
const USER_ID_COLUMNS: ReadonlyArray<{ readonly table: string; readonly column: string }> = [
  { table: 'user_profiles', column: 'id' },
  { table: 'highlights', column: 'user_id' },
  { table: 'study_notes', column: 'user_id' },
  { table: 'ink_canvases', column: 'user_id' },
  { table: 'prayer_pools', column: 'owner_user_id' },
  { table: 'prayer_pool_members', column: 'user_id' },
  { table: 'prayer_pool_items', column: 'created_by_user_id' },
  { table: 'prayer_item_user_states', column: 'user_id' },
  { table: 'prayer_session_logs', column: 'user_id' },
  { table: 'reading_plan_enrollments', column: 'user_id' },
  { table: 'reading_progress', column: 'user_id' },
];

/** Outcome of a Guest → Account migration (C4 §4.1 step 1). */
export interface IdentityMigrationReport {
  readonly guestUserId: string;
  readonly authUserId: string;
  /** ISO-8601 UTC timestamp the rewrite committed. */
  readonly migratedAt: string;
  /** Rows re-owned, keyed by table (includes soft-deleted rows, so nothing is left orphaned). */
  readonly migratedCounts: Readonly<Record<string, number>>;
  readonly totalMigrated: number;
}

export interface IdentityRepositoryOptions {
  readonly userDb: UserDbAdapter;
  readonly localDevice: LocalDeviceAdapter;
  /** CSPRNG source for the guest UUID v4 primary identity (B4 §4.3). */
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * C4 §4.1 — owns the device identity (guest or account) and the atomic Zero-Loss upgrade that
 * re-homes every local synced row onto the signed-in account. One instance is reused per session.
 */
export class IdentityRepository {
  private readonly userDb: UserDbAdapter;
  private readonly localDevice: LocalDeviceAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  private readonly now: () => number;

  constructor(options: IdentityRepositoryOptions) {
    this.userDb = options.userDb;
    this.localDevice = options.localDevice;
    this.crypto = options.crypto;
    this.now = options.now ?? Date.now;
  }

  /** The persisted guest id, or `null` once the device has been upgraded to an account. */
  async getGuestUserId(): Promise<string | null> {
    return this.readWorkspace(GUEST_USER_ID_KEY);
  }

  /** The persisted guest id, generating and persisting one on first call (C4 §4.1 step 0). */
  async getOrCreateGuestUserId(): Promise<string> {
    const existing = await this.getGuestUserId();
    if (existing !== null) {
      return existing;
    }
    const guestUserId = uuidV4(this.crypto.randomBytes);
    await this.writeWorkspace(GUEST_USER_ID_KEY, guestUserId);
    return guestUserId;
  }

  /** The bound Supabase account id, or `null` while the device is still in guest mode. */
  async getAccountUserId(): Promise<string | null> {
    return this.readWorkspace(ACCOUNT_USER_ID_KEY);
  }

  /** The identity the app should attribute local writes to: account if signed in, else guest. */
  async getCurrentUserId(): Promise<string | null> {
    return (await this.getAccountUserId()) ?? (await this.getGuestUserId());
  }

  /**
   * The id to attribute local writes to, guaranteed non-null: the bound account id when signed in,
   * otherwise the device guest id (created on first use). UI screens MUST resolve the writing
   * identity through this — NOT `getOrCreateGuestUserId`, which mints a fresh device-only id even
   * while an account is bound, so every synced write would carry an owner `auth.uid()` does not
   * match and the RLS policies reject it (C4 §4.3), leaving the row unsyncable and pruned at the
   * next PowerSync checkpoint.
   */
  async getOrCreateCurrentUserId(): Promise<string> {
    return (await this.getAccountUserId()) ?? (await this.getOrCreateGuestUserId());
  }

  /**
   * Zero-Loss Guest → Account upgrade (C4 §4.1 step 1): atomically rewrite every local synced
   * row owned by `guestUserId` onto `authUserId`. On any failure the transaction rolls back,
   * leaving the guest data intact, and `AUTH_GUEST_MIGRATION_FAILED` is thrown (C3).
   */
  async migrateGuestToAccount(
    guestUserId: string,
    authUserId: string,
  ): Promise<IdentityMigrationReport> {
    if (guestUserId.length === 0 || authUserId.length === 0) {
      throw this.migrationError('Both guestUserId and authUserId must be non-empty.');
    }
    if (guestUserId === authUserId) {
      throw this.migrationError('guestUserId and authUserId are identical.');
    }

    const migratedAt = this.timestamp();
    const migratedCounts: Record<string, number> = {};

    try {
      await this.userDb.writeTransaction(async (tx) => {
        for (const { table, column } of USER_ID_COLUMNS) {
          const { rows } = await tx.query<{ n: number }>(
            `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`,
            [guestUserId],
          );
          const count = rows[0]?.n ?? 0;
          migratedCounts[table] = count;
          if (count === 0) {
            continue;
          }
          await tx.execute(
            `UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE ${column} = ?`,
            [authUserId, migratedAt, guestUserId],
          );
        }
      });
    } catch (cause) {
      throw this.migrationError('Local user_id rewrite failed; the transaction was rolled back.', cause);
    }

    // Record the binding only after the rewrite commits, so a failed rewrite keeps guest mode.
    await this.writeWorkspace(ACCOUNT_USER_ID_KEY, authUserId);
    await this.clearGuestUserId();

    const totalMigrated = Object.values(migratedCounts).reduce((sum, n) => sum + n, 0);
    return { guestUserId, authUserId, migratedAt, migratedCounts, totalMigrated };
  }

  /** Drop the guest identity once the device is bound to an account (`local_device` hard-deletes). */
  private async clearGuestUserId(): Promise<void> {
    await this.localDevice.execute('DELETE FROM workspace_state WHERE key = ?', [GUEST_USER_ID_KEY]);
  }

  private async readWorkspace(key: string): Promise<string | null> {
    const { rows } = await this.localDevice.query<{ value_json: string }>(
      'SELECT value_json FROM workspace_state WHERE key = ?',
      [key],
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(row.value_json);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeWorkspace(key: string, value: string): Promise<void> {
    await this.localDevice.execute(
      `INSERT INTO workspace_state (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), this.timestamp()],
    );
  }

  private migrationError(internalDetail: string, cause?: unknown): AppError {
    return guestMigrationError(internalDetail, cause);
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}
