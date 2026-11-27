// SupabaseConnector — the PowerSync backend connector (C2 §4.2, FR-206).
//
// PowerSync asks this connector for credentials before each connection and hands it every queued
// local mutation to upload. Credentials come from the Supabase auth session; uploads go straight
// to PostgREST so the raw HTTP status is visible for the fatal-error dead-letter (C2 §4.2 §3).
//
// Conflict policy (C2 §4.2 §2) is deliberately *not* implemented client-side:
//   * Row-level LWW is enforced server-side by the `trg_*_updated_at` / `GREATEST` triggers
//     (supabase/migrations/0002_triggers_and_powersync.sql).
//   * Clients never hard-DELETE a synced row (AGENTS.md rule 2); a stray `DELETE` op is rewritten
//     to a soft-delete `UPDATE deleted_at`.
//   * An HTTP 400/403 (RLS or constraint) dead-letters exactly that mutation so the queue keeps
//     flowing, and every accepted mutation after it still uploads.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  UpdateType,
  type CommonPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/react-native';

import type { RejectedMutation } from '@breath-and-word/core';

/**
 * `table.column` pairs stored as `boolean` in PostgreSQL but `INTEGER` 0/1 in the client SQLite
 * mirror (B4 §4.3). PostgREST rejects `0`/`1` for a `boolean` column, so they are converted here.
 */
const BOOLEAN_COLUMNS: ReadonlySet<string> = new Set([
  'user_profiles.manna_pacing_enabled',
  'user_profiles.e2ee_enabled',
  'study_notes.is_encrypted',
  'ink_canvases.is_encrypted',
  'prayer_pools.allow_member_contributions',
  'prayer_item_user_states.is_encrypted',
  'prayer_item_user_states.is_archived',
  'prayer_session_logs.is_encrypted',
  'reading_plan_enrollments.manna_locked',
  'reading_plan_enrollments.is_active',
]);

/** A mutation PostgREST permanently rejected; the caller dead-letters it (C2 §4.2 §3). */
class FatalUploadError extends Error {
  constructor(
    readonly rejection: RejectedMutation,
    readonly httpStatus: number,
  ) {
    super(`Upload rejected (${httpStatus}) for ${rejection.table}:${rejection.rowId}`);
    this.name = 'FatalUploadError';
  }
}

export interface SupabaseConnectorOptions {
  readonly supabase: SupabaseClient;
  /** PowerSync Cloud endpoint; returned to the client as the sync `endpoint`. */
  readonly powersyncUrl: string;
  /** Called for every dead-lettered mutation so `SyncAdapter.onMutationRejected` can surface it. */
  readonly onMutationRejected: (mutation: RejectedMutation) => void;
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly supabase: SupabaseClient;
  private readonly powersyncUrl: string;
  private readonly onMutationRejected: (mutation: RejectedMutation) => void;

  constructor(options: SupabaseConnectorOptions) {
    this.supabase = options.supabase;
    this.powersyncUrl = options.powersyncUrl;
    this.onMutationRejected = options.onMutationRejected;
  }

  /**
   * Fetch a *fresh* Supabase access token for the PowerSync service (C2 §4.2). Returning `null`
   * keeps the client offline — the signed-out (Guest Mode) state — without raising an error.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error !== null) {
      throw error;
    }
    const session = data.session;
    if (session === null) {
      return null;
    }
    return {
      endpoint: this.powersyncUrl,
      token: session.access_token,
      ...(session.expires_at === undefined
        ? {}
        : { expiresAt: new Date(session.expires_at * 1000) }),
    };
  }

  /** Upload the oldest queued transaction, discarding it whole if PostgREST rejects it (C2 §4.2). */
  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (transaction === null) {
      return;
    }

    try {
      for (const entry of transaction.crud) {
        await this.uploadEntry(entry);
      }
    } catch (error) {
      if (error instanceof FatalUploadError) {
        // Dead-letter the offending transaction so later valid mutations are not wedged.
        this.onMutationRejected(error.rejection);
        await transaction.complete();
        return;
      }
      // Transient (network / 5xx): leave the transaction queued and let PowerSync retry.
      throw error;
    }

    await transaction.complete();
  }

  private async uploadEntry(entry: CrudEntry): Promise<void> {
    const row = toPostgresRow(entry.table, entry.opData ?? {});
    row.id = entry.id;

    if (entry.op === UpdateType.DELETE) {
      // AGENTS.md rule 2: clients never hard-DELETE; any stray DELETE becomes a soft delete.
      const response = await this.supabase
        .from(entry.table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', entry.id);
      this.assertUploaded(entry, response);
      return;
    }

    const response =
      entry.op === UpdateType.PATCH
        ? await this.supabase.from(entry.table).update(row).eq('id', entry.id)
        : await this.supabase.from(entry.table).upsert(row, { onConflict: 'id' });
    this.assertUploaded(entry, response);
  }

  /** Raise a `FatalUploadError` for a 400/403, a plain error (retry) for anything else. */
  private assertUploaded(
    entry: CrudEntry,
    response: { error: { code?: string; message: string } | null; status: number },
  ): void {
    if (response.error === null) {
      return;
    }
    if (response.status === 400 || response.status === 403) {
      throw new FatalUploadError(
        {
          table: entry.table,
          rowId: entry.id,
          errorCode: response.error.code ?? `HTTP_${response.status}`,
        },
        response.status,
      );
    }
    throw new Error(
      `Supabase upload failed for ${entry.table}:${entry.id} (${response.status}): ${response.error.message}`,
    );
  }
}

/** Convert the client SQLite row into a PostgREST payload (0/1 booleans -> true/false). */
function toPostgresRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(data)) {
    if (value === null) {
      row[column] = null;
    } else if (BOOLEAN_COLUMNS.has(`${table}.${column}`)) {
      row[column] = value === 1 || value === true;
    } else {
      row[column] = value;
    }
  }
  return row;
}
