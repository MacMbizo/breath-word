// FR-201 / FR-202 / FR-203 — Prayer Pools, capture, E2EE private state, rotation & testimonies.
//
// `B4 §4.3` synced tables: `prayer_pools`, `prayer_pool_members`, `prayer_pool_items`,
// `prayer_item_user_states`. Per `AGENTS.md` rules 1–3 and `C4 §4.2`:
//   * This is the ONLY place prayer SQL may live; the UI never writes SQL.
//   * Shared-pool privacy split: `prayer_pool_items` holds only canonical passage content;
//     every per-user field (`user_notes_payload`, `pray_count`, `last_prayed_at`,
//     `testimony_payload`, `is_archived`) lives strictly in `prayer_item_user_states`.
//   * All synced writes are soft (`deleted_at`); this file never emits a hard `DELETE`.
//   * Private fields (`user_notes_payload`, `testimony_payload`) are encrypted with the vault's
//     `FieldCipher` when E2EE is enabled (`is_encrypted = 1`), else stored as plaintext.

import type { CryptoPrimitivesAdapter, UserDbAdapter } from '../adapters';
import { formatCanonicalRange } from '../domain/bbcccvvv';
import type {
  PrayerCategory,
  PrayerPoolItemView,
  PrayerPoolRecord,
  PrayerPoolView,
  PoolRole,
  PoolVisibility,
} from '../domain/types';
import type { FieldCipher } from '../crypto/field-cipher';
import { uuidV4 } from '../crypto/uuid';

const STATE_TABLE = 'prayer_item_user_states';

export interface PrayerPoolRepositoryOptions {
  readonly userDb: UserDbAdapter;
  /** CSPRNG source for UUID v4 primary keys (B4 §4.3). */
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  /** Per-field E2EE cipher; when omitted the vault is treated as disabled (plaintext fields). */
  readonly cipher?: FieldCipher;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface CreatePoolParams {
  readonly ownerUserId: string;
  readonly title: string;
  readonly category: PrayerCategory;
  readonly description?: string;
  readonly colorHex?: string;
  readonly visibility?: PoolVisibility;
  readonly allowMemberContributions?: boolean;
}

export interface UpdatePoolParams {
  readonly title?: string;
  readonly description?: string;
  readonly category?: PrayerCategory;
  readonly colorHex?: string;
  readonly visibility?: PoolVisibility;
  readonly allowMemberContributions?: boolean;
}

export interface AddPoolItemParams {
  readonly poolId: string;
  readonly createdByUserId: string;
  readonly startVerseId: number;
  readonly endVerseId: number;
  readonly translationCode: string;
  readonly capturedText: string;
  readonly sharedPromptText?: string;
}

/** A member roster entry (FR-202 shared-pool tenancy). */
export interface PoolMemberView {
  readonly id: string;
  readonly poolId: string;
  readonly userId: string;
  readonly role: PoolRole;
  readonly joinedAt: string;
}

interface PoolRow {
  id: string;
  owner_user_id: string;
  title: string;
  description: string | null;
  category: string;
  color_hex: string;
  visibility: string;
  share_code: string | null;
  allow_member_contributions: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface PoolViewRow extends PoolRow {
  user_role: string;
  active_items_count: number;
  answered_items_count: number;
  member_count: number;
}

interface MemberRow {
  id: string;
  pool_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ItemJoinRow {
  id: string;
  pool_id: string;
  created_by_user_id: string;
  start_verse_id: number;
  end_verse_id: number;
  translation_code: string;
  captured_text: string;
  shared_prompt_text: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  state_id: string | null;
  user_notes_payload: string | null;
  generated_prayer_prompt: string | null;
  is_encrypted: number | null;
  pray_count: number | null;
  last_prayed_at: string | null;
  answered_at: string | null;
  testimony_payload: string | null;
  is_archived: number | null;
}

/** The `prayer_item_user_states` / `prayer_pool_items` projection used by every item read. */
const ITEM_SELECT = `
  SELECT i.id, i.pool_id, i.created_by_user_id, i.start_verse_id, i.end_verse_id,
         i.translation_code, i.captured_text, i.shared_prompt_text, i.created_at, i.updated_at,
         i.deleted_at,
         s.id AS state_id, s.user_notes_payload, s.generated_prayer_prompt, s.is_encrypted,
         s.pray_count, s.last_prayed_at, s.answered_at, s.testimony_payload, s.is_archived
    FROM prayer_pool_items i
    LEFT JOIN prayer_item_user_states s
      ON s.item_id = i.id AND s.user_id = ? AND s.deleted_at IS NULL`;

/**
 * FR-201..203 — Pools, captured items, and per-user private state. One instance per session.
 */
export class PrayerPoolRepository {
  private readonly userDb: UserDbAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  private readonly cipher: FieldCipher | undefined;
  private readonly now: () => number;

  constructor(options: PrayerPoolRepositoryOptions) {
    this.userDb = options.userDb;
    this.crypto = options.crypto;
    this.cipher = options.cipher;
    this.now = options.now ?? Date.now;
  }

  // ---- Pools -----------------------------------------------------------------------------

  /**
   * Create a private (or shared) pool.
   *
   * The OWNER membership row is provisioned server-side by `trg_add_pool_owner_member` (B2 §4.2)
   * and syncs back down; the client deliberately writes no membership row here because
   * `prayer_pool_members` grants no INSERT policy (C4 §4.3) and the row's `UNIQUE (pool_id,
   * user_id)` key would collide with the trigger's own row. The pool is still visible to its owner
   * immediately — `listPoolsForUser` treats `owner_user_id` as an implicit OWNER membership.
   */
  async createPool(params: CreatePoolParams): Promise<PrayerPoolRecord> {
    const timestamp = this.timestamp();
    const record: PrayerPoolRecord = {
      id: uuidV4(this.crypto.randomBytes),
      ownerUserId: params.ownerUserId,
      title: params.title,
      category: params.category,
      colorHex: params.colorHex ?? '#3B82F6',
      visibility: params.visibility ?? 'PRIVATE',
      allowMemberContributions: params.allowMemberContributions ?? false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(params.description === undefined ? {} : { description: params.description }),
    };

    await this.userDb.execute(
      `INSERT INTO prayer_pools
         (id, owner_user_id, title, description, category, color_hex, visibility,
          allow_member_contributions, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        record.id,
        record.ownerUserId,
        record.title,
        record.description ?? null,
        record.category,
        record.colorHex,
        record.visibility,
        record.allowMemberContributions ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      ],
    );

    return record;
  }

  async getPool(poolId: string): Promise<PrayerPoolRecord | null> {
    const { rows } = await this.userDb.query<PoolRow>(`${POOL_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`, [
      poolId,
    ]);
    const row = rows[0];
    return row === undefined ? null : toPoolRecord(row);
  }

  /**
   * Every pool the user owns or belongs to, with derived counts and the user's role.
   *
   * A pool is matched by a membership row OR by `owner_user_id`: the OWNER membership row is
   * provisioned server-side (`trg_add_pool_owner_member`, B2 §4.2) and only lands on the next sync,
   * so a pool the owner just created must still be listed here with role `OWNER`.
   */
  async listPoolsForUser(userId: string): Promise<PrayerPoolView[]> {
    const { rows } = await this.userDb.query<PoolViewRow>(
      `SELECT p.id, p.owner_user_id, p.title, p.description, p.category, p.color_hex, p.visibility,
              p.share_code, p.allow_member_contributions, p.created_at, p.updated_at, p.deleted_at,
              COALESCE(m.role, 'OWNER') AS user_role,
              (SELECT COUNT(*) FROM prayer_pool_items i
                 WHERE i.pool_id = p.id AND i.deleted_at IS NULL) AS active_items_count,
              (SELECT COUNT(*) FROM prayer_item_user_states s
                 JOIN prayer_pool_items i ON i.id = s.item_id
                WHERE i.pool_id = p.id AND s.user_id = ? AND s.answered_at IS NOT NULL
                  AND s.deleted_at IS NULL) AS answered_items_count,
              (SELECT COUNT(*) FROM prayer_pool_members mm
                 WHERE mm.pool_id = p.id AND mm.deleted_at IS NULL
                   AND mm.user_id <> p.owner_user_id) + 1 AS member_count
         FROM prayer_pools p
         LEFT JOIN prayer_pool_members m
           ON m.pool_id = p.id AND m.user_id = ? AND m.deleted_at IS NULL
        WHERE p.deleted_at IS NULL AND (p.owner_user_id = ? OR m.user_id IS NOT NULL)
        ORDER BY p.title ASC`,
      [userId, userId, userId],
    );
    return rows.map(toPoolView);
  }

  /** Update a pool's metadata (owner-only; the UI enforces `C4 §4.2`). */
  async updatePool(poolId: string, patch: UpdatePoolParams): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.description !== undefined) {
      sets.push('description = ?');
      params.push(patch.description);
    }
    if (patch.category !== undefined) {
      sets.push('category = ?');
      params.push(patch.category);
    }
    if (patch.colorHex !== undefined) {
      sets.push('color_hex = ?');
      params.push(patch.colorHex);
    }
    if (patch.visibility !== undefined) {
      sets.push('visibility = ?');
      params.push(patch.visibility);
    }
    if (patch.allowMemberContributions !== undefined) {
      sets.push('allow_member_contributions = ?');
      params.push(patch.allowMemberContributions ? 1 : 0);
    }
    const timestamp = this.timestamp();
    sets.push('updated_at = ?');
    params.push(timestamp);
    params.push(poolId);

    await this.userDb.execute(
      `UPDATE prayer_pools SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      params,
    );
  }

  /** Soft-delete a pool and tombstone its items + memberships (C4 `cascade_pool_soft_delete`). */
  async softDeletePool(poolId: string): Promise<void> {
    const timestamp = this.timestamp();
    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE prayer_pools SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, poolId],
      );
      await tx.execute(
        `UPDATE prayer_pool_items SET deleted_at = ?, updated_at = ? WHERE pool_id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, poolId],
      );
      await tx.execute(
        `UPDATE prayer_pool_members SET deleted_at = ?, updated_at = ? WHERE pool_id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, poolId],
      );
    });
  }

  // ---- Membership ------------------------------------------------------------------------

  /** Add or revive a membership (upsert on the `UNIQUE (pool_id, user_id)` key). */
  async addMember(poolId: string, userId: string, role: PoolRole = 'MEMBER'): Promise<void> {
    const timestamp = this.timestamp();
    // SELECT-then-INSERT/UPDATE rather than `ON CONFLICT`: PowerSync materialises the synced tables
    // as managed views, against which SQLite cannot resolve an upsert conflict target (ADR-002).
    await this.userDb.writeTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM prayer_pool_members WHERE pool_id = ? AND user_id = ? LIMIT 1`,
        [poolId, userId],
      );
      if (rows.length === 0) {
        await tx.execute(
          `INSERT INTO prayer_pool_members (id, pool_id, user_id, role, joined_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          [uuidV4(this.crypto.randomBytes), poolId, userId, role, timestamp, timestamp],
        );
      } else {
        await tx.execute(
          `UPDATE prayer_pool_members
              SET role = ?, deleted_at = NULL, updated_at = ?
            WHERE pool_id = ? AND user_id = ?`,
          [role, timestamp, poolId, userId],
        );
      }
    });
  }

  /** Soft-remove a membership (self-leave or owner-initiated). Never a hard `DELETE`. */
  async removeMember(poolId: string, userId: string): Promise<void> {
    const timestamp = this.timestamp();
    await this.userDb.execute(
      `UPDATE prayer_pool_members SET deleted_at = ?, updated_at = ?
        WHERE pool_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, poolId, userId],
    );
  }

  async listMembers(poolId: string): Promise<PoolMemberView[]> {
    const { rows } = await this.userDb.query<MemberRow>(
      `SELECT id, pool_id, user_id, role, joined_at, updated_at, deleted_at
         FROM prayer_pool_members
        WHERE pool_id = ? AND deleted_at IS NULL
        ORDER BY joined_at ASC`,
      [poolId],
    );
    return rows.map((row) => ({
      id: row.id,
      poolId: row.pool_id,
      userId: row.user_id,
      role: row.role as PoolRole,
      joinedAt: row.joined_at,
    }));
  }

  // ---- Captured items (FR-201) -----------------------------------------------------------

  /** FR-201 — capture a passage into a pool as a shared item. */
  async addItem(params: AddPoolItemParams): Promise<PrayerPoolItemView> {
    const timestamp = this.timestamp();
    const id = uuidV4(this.crypto.randomBytes);
    await this.userDb.execute(
      `INSERT INTO prayer_pool_items
         (id, pool_id, created_by_user_id, start_verse_id, end_verse_id, translation_code,
          captured_text, shared_prompt_text, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        params.poolId,
        params.createdByUserId,
        params.startVerseId,
        params.endVerseId,
        params.translationCode,
        params.capturedText,
        params.sharedPromptText ?? null,
        timestamp,
        timestamp,
      ],
    );

    return {
      itemId: id,
      poolId: params.poolId,
      createdByUserId: params.createdByUserId,
      startVerseId: params.startVerseId,
      endVerseId: params.endVerseId,
      passageReference: formatCanonicalRange(params.startVerseId, params.endVerseId),
      translationCode: params.translationCode,
      capturedText: params.capturedText,
      isEncrypted: false,
      prayCount: 0,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(params.sharedPromptText === undefined ? {} : { sharedPromptText: params.sharedPromptText }),
    };
  }

  /** FR-202 — all non-deleted items in a pool, joined to the requesting user's private state. */
  async listItems(userId: string, poolId: string): Promise<PrayerPoolItemView[]> {
    const { rows } = await this.userDb.query<ItemJoinRow>(
      `${ITEM_SELECT}
        WHERE i.pool_id = ? AND i.deleted_at IS NULL
        ORDER BY i.created_at ASC`,
      [userId, poolId],
    );
    return this.toItemViews(rows);
  }

  /** Soft-delete a captured item (leader/owner removal, or the author's own item). */
  async softDeleteItem(itemId: string): Promise<void> {
    const timestamp = this.timestamp();
    await this.userDb.execute(
      `UPDATE prayer_pool_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, itemId],
    );
  }

  // ---- Per-user private state (FR-202 / FR-206) ------------------------------------------

  /** FR-202 — write the requesting user's own E2EE note for an item (never visible to others). */
  async setUserNote(userId: string, itemId: string, poolId: string, note: string): Promise<void> {
    const stateId = await this.ensureStateRow(userId, itemId, poolId);
    const field = await this.encryptField(stateId, 'user_notes_payload', note);
    const timestamp = this.timestamp();
    await this.userDb.execute(
      `UPDATE prayer_item_user_states
          SET user_notes_payload = ?, is_encrypted = ?, updated_at = ?
        WHERE id = ?`,
      [field.value, field.isEncrypted ? 1 : 0, timestamp, stateId],
    );
  }

  /** FR-203 — record one completed prayer on a card (local monotonic increment). */
  async recordPray(userId: string, itemId: string, poolId: string): Promise<void> {
    const stateId = await this.ensureStateRow(userId, itemId, poolId);
    const timestamp = this.timestamp();
    await this.userDb.execute(
      `UPDATE prayer_item_user_states
          SET pray_count = pray_count + 1, last_prayed_at = ?, updated_at = ?
        WHERE id = ?`,
      [timestamp, timestamp, stateId],
    );
  }

  /** FR-203 — mark an item answered, optionally recording an E2EE testimony. */
  async markAnswered(
    userId: string,
    itemId: string,
    poolId: string,
    testimony?: string,
  ): Promise<void> {
    const stateId = await this.ensureStateRow(userId, itemId, poolId);
    const timestamp = this.timestamp();

    if (testimony === undefined) {
      await this.userDb.execute(
        `UPDATE prayer_item_user_states SET answered_at = ?, updated_at = ? WHERE id = ?`,
        [timestamp, timestamp, stateId],
      );
      return;
    }

    const field = await this.encryptField(stateId, 'testimony_payload', testimony);
    await this.userDb.execute(
      `UPDATE prayer_item_user_states
          SET answered_at = ?, testimony_payload = ?, is_encrypted = ?, updated_at = ?
        WHERE id = ?`,
      [timestamp, field.value, field.isEncrypted ? 1 : 0, timestamp, stateId],
    );
  }

  /** Archive / unarchive a card for the requesting user only. */
  async setArchived(userId: string, itemId: string, poolId: string, archived: boolean): Promise<void> {
    const stateId = await this.ensureStateRow(userId, itemId, poolId);
    const timestamp = this.timestamp();
    await this.userDb.execute(
      `UPDATE prayer_item_user_states SET is_archived = ?, updated_at = ? WHERE id = ?`,
      [archived ? 1 : 0, timestamp, stateId],
    );
  }

  /**
   * FR-203 — the next session queue. Least-recently-prayed first; a card just prayed lands at the
   * back (`last_prayed_at` newest last). Archived cards are excluded.
   */
  async getRotationQueue(userId: string, poolId: string, limit = 20): Promise<PrayerPoolItemView[]> {
    const { rows } = await this.userDb.query<ItemJoinRow>(
      `${ITEM_SELECT}
        WHERE i.pool_id = ? AND i.deleted_at IS NULL AND COALESCE(s.is_archived, 0) = 0
        ORDER BY (s.last_prayed_at IS NULL) DESC, s.last_prayed_at ASC, i.created_at ASC
        LIMIT ?`,
      [userId, poolId, limit],
    );
    return this.toItemViews(rows);
  }

  // ---- Internals -------------------------------------------------------------------------

  private async toItemViews(rows: ItemJoinRow[]): Promise<PrayerPoolItemView[]> {
    return Promise.all(rows.map((row) => this.toItemView(row)));
  }

  private async toItemView(row: ItemJoinRow): Promise<PrayerPoolItemView> {
    const isEncrypted = row.is_encrypted === 1;
    const userNotes = await this.decryptField(row.state_id, 'user_notes_payload', row.user_notes_payload, isEncrypted);
    const testimony = await this.decryptField(row.state_id, 'testimony_payload', row.testimony_payload, isEncrypted);

    return {
      itemId: row.id,
      poolId: row.pool_id,
      createdByUserId: row.created_by_user_id,
      startVerseId: row.start_verse_id,
      endVerseId: row.end_verse_id,
      passageReference: formatCanonicalRange(row.start_verse_id, row.end_verse_id),
      translationCode: row.translation_code,
      capturedText: row.captured_text,
      isEncrypted,
      prayCount: row.pray_count ?? 0,
      isArchived: row.is_archived === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.state_id === null ? {} : { stateId: row.state_id }),
      ...(row.shared_prompt_text === null ? {} : { sharedPromptText: row.shared_prompt_text }),
      ...(userNotes === undefined ? {} : { userNotes }),
      ...(row.generated_prayer_prompt === null
        ? {}
        : { generatedPrayerPrompt: row.generated_prayer_prompt }),
      ...(row.last_prayed_at === null ? {} : { lastPrayedAt: row.last_prayed_at }),
      ...(row.answered_at === null ? {} : { answeredAt: row.answered_at }),
      ...(testimony === undefined ? {} : { testimony }),
    };
  }

  /**
   * Decrypt a stored private field. Returns `undefined` when there is nothing to show or the row
   * cannot be decrypted (vault locked, or tamper/AAD mismatch) — list rendering must never crash
   * and the UI shows "Unlock to view" when `isEncrypted && field === undefined` (`C3`).
   */
  private async decryptField(
    stateId: string | null,
    column: string,
    stored: string | null,
    isEncrypted: boolean,
  ): Promise<string | undefined> {
    if (stored === null) {
      return undefined;
    }
    if (!isEncrypted) {
      return stored;
    }
    if (stateId === null || this.cipher === undefined) {
      return undefined;
    }
    try {
      return await this.cipher.decrypt(STATE_TABLE, stateId, column, stored);
    } catch {
      return undefined;
    }
  }

  private async encryptField(
    stateId: string,
    column: string,
    plaintext: string,
  ): Promise<{ value: string; isEncrypted: boolean }> {
    const cipher = this.cipher;
    if (cipher !== undefined && cipher.enabled) {
      return { value: await cipher.encrypt(STATE_TABLE, stateId, column, plaintext), isEncrypted: true };
    }
    return { value: plaintext, isEncrypted: false };
  }

  /** Find the requesting user's state row id for an item, or `null`. */
  private async findStateRowId(itemId: string, userId: string): Promise<string | null> {
    const { rows } = await this.userDb.query<{ id: string }>(
      `SELECT id FROM prayer_item_user_states WHERE item_id = ? AND user_id = ? LIMIT 1`,
      [itemId, userId],
    );
    return rows[0]?.id ?? null;
  }

  /** Get-or-create the requesting user's state row (lazily created on first interaction). */
  private async ensureStateRow(userId: string, itemId: string, poolId: string): Promise<string> {
    const existing = await this.findStateRowId(itemId, userId);
    if (existing !== null) {
      return existing;
    }

    const id = uuidV4(this.crypto.randomBytes);
    const timestamp = this.timestamp();
    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO prayer_item_user_states
           (id, item_id, pool_id, user_id, is_encrypted, pray_count, is_archived,
            created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, NULL)`,
        [id, itemId, poolId, userId, timestamp, timestamp],
      );
    });
    return id;
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}

const POOL_SELECT = `
  SELECT p.id, p.owner_user_id, p.title, p.description, p.category, p.color_hex, p.visibility,
         p.share_code, p.allow_member_contributions, p.created_at, p.updated_at, p.deleted_at
    FROM prayer_pools p`;

function toPoolRecord(row: PoolRow): PrayerPoolRecord {
  const record: PrayerPoolRecord = {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    category: row.category as PrayerCategory,
    colorHex: row.color_hex,
    visibility: row.visibility as PoolVisibility,
    allowMemberContributions: row.allow_member_contributions === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return {
    ...record,
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.share_code === null ? {} : { shareCode: row.share_code }),
    ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
  };
}

function toPoolView(row: PoolViewRow): PrayerPoolView {
  return {
    ...toPoolRecord(row),
    userRole: row.user_role as PoolRole,
    activeItemsCount: row.active_items_count,
    answeredItemsCount: row.answered_items_count,
    memberCount: row.member_count,
  };
}
