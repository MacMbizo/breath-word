// FR-205 — Guided Prayer Engines session logging.
//
// `B4 §4.3` synced table `prayer_session_logs`: one row per completed engine run (Lectio Divina,
// Three Rs, ACTS, Breath — the `DECK` framework is the FR-203 rotation deck). Per `AGENTS.md`
// rules 1–2 & 5 this is the only place sessions SQL lives, every write is soft, and the optional
// `journal_payload` is E2EE-encrypted via the vault's `FieldCipher` when the vault is enabled.

import type { CryptoPrimitivesAdapter, UserDbAdapter } from '../adapters';
import type { FieldCipher } from '../crypto/field-cipher';
import { uuidV4 } from '../crypto/uuid';
import type { PrayerFramework, PrayerSessionLog } from '../domain/types';

const TABLE = 'prayer_session_logs';
const JOURNAL_COLUMN = 'journal_payload';

export interface PrayerEngineRepositoryOptions {
  readonly userDb: UserDbAdapter;
  /** CSPRNG source for UUID v4 primary keys (B4 §4.3). */
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  /** Per-field E2EE cipher; when omitted the vault is treated as disabled (plaintext journal). */
  readonly cipher?: FieldCipher;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface LogSessionParams {
  readonly userId: string;
  readonly framework: PrayerFramework;
  readonly durationSeconds: number;
  readonly poolId?: string;
  readonly itemId?: string;
  /** Optional reflection journal; encrypted at rest when the vault is enabled. */
  readonly journal?: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  pool_id: string | null;
  item_id: string | null;
  framework: string;
  duration_seconds: number;
  journal_payload: string | null;
  is_encrypted: number;
  completed_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** FR-205 — one row per completed guided-prayer session. One instance per session. */
export class PrayerEngineRepository {
  private readonly userDb: UserDbAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  private readonly cipher: FieldCipher | undefined;
  private readonly now: () => number;

  constructor(options: PrayerEngineRepositoryOptions) {
    this.userDb = options.userDb;
    this.crypto = options.crypto;
    this.cipher = options.cipher;
    this.now = options.now ?? Date.now;
  }

  /** Record a finished engine run (FR-205). */
  async logSession(params: LogSessionParams): Promise<PrayerSessionLog> {
    const timestamp = this.timestamp();
    const id = uuidV4(this.crypto.randomBytes);

    let journalPayload: string | null = null;
    if (params.journal !== undefined) {
      journalPayload = await this.encryptJournal(id, params.journal);
    }
    const isEncrypted = journalPayload !== null && this.isVaultEncrypting();

    await this.userDb.execute(
      `INSERT INTO prayer_session_logs
         (id, user_id, pool_id, item_id, framework, duration_seconds, journal_payload,
          is_encrypted, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        params.userId,
        params.poolId ?? null,
        params.itemId ?? null,
        params.framework,
        params.durationSeconds,
        journalPayload,
        isEncrypted ? 1 : 0,
        timestamp,
        timestamp,
        timestamp,
      ],
    );

    return {
      id,
      userId: params.userId,
      framework: params.framework,
      durationSeconds: params.durationSeconds,
      isEncrypted,
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(params.poolId === undefined ? {} : { poolId: params.poolId }),
      ...(params.itemId === undefined ? {} : { itemId: params.itemId }),
      ...(params.journal === undefined ? {} : { journal: params.journal }),
    };
  }

  /** The user's most recent sessions, newest first (FR-205 history). */
  async listRecentSessions(userId: string, limit = 20): Promise<PrayerSessionLog[]> {
    const { rows } = await this.userDb.query<SessionRow>(
      `${SESSION_SELECT}
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY completed_at DESC
        LIMIT ?`,
      [userId, limit],
    );
    return Promise.all(rows.map((row) => this.toSessionLog(row)));
  }

  /** Soft-delete a session (never a hard `DELETE`). */
  async softDeleteSession(sessionId: string): Promise<void> {
    const timestamp = this.timestamp();
    await this.userDb.execute(
      `UPDATE prayer_session_logs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, sessionId],
    );
  }

  private async toSessionLog(row: SessionRow): Promise<PrayerSessionLog> {
    const journal = await this.decryptJournal(row.id, row.journal_payload, row.is_encrypted === 1);
    return {
      id: row.id,
      userId: row.user_id,
      framework: row.framework as PrayerFramework,
      durationSeconds: row.duration_seconds,
      isEncrypted: row.is_encrypted === 1,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.pool_id === null ? {} : { poolId: row.pool_id }),
      ...(row.item_id === null ? {} : { itemId: row.item_id }),
      ...(journal === undefined ? {} : { journal }),
      ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
    };
  }

  private isVaultEncrypting(): boolean {
    return this.cipher !== undefined && this.cipher.enabled;
  }

  private async encryptJournal(rowId: string, plaintext: string): Promise<string> {
    const cipher = this.cipher;
    if (cipher !== undefined && cipher.enabled) {
      return cipher.encrypt(TABLE, rowId, JOURNAL_COLUMN, plaintext);
    }
    return plaintext;
  }

  private async decryptJournal(
    rowId: string,
    stored: string | null,
    isEncrypted: boolean,
  ): Promise<string | undefined> {
    if (stored === null) {
      return undefined;
    }
    if (!isEncrypted) {
      return stored;
    }
    // No wired cipher => vault locked; degrade rather than crash a history list (C3).
    if (this.cipher === undefined) {
      return undefined;
    }
    try {
      return await this.cipher.decrypt(TABLE, rowId, JOURNAL_COLUMN, stored);
    } catch {
      return undefined;
    }
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}

const SESSION_SELECT = `
  SELECT id, user_id, pool_id, item_id, framework, duration_seconds, journal_payload,
         is_encrypted, completed_at, created_at, updated_at, deleted_at
    FROM prayer_session_logs`;
