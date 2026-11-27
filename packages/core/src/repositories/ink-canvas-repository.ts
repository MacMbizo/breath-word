// FR-305 Cross-Platform Stylus Ink Canvas (`ink_canvases`, B4 §4.3, ADR-003).
//
// Stores portable normalized `0..1000` vector stroke canvases attached to a `canonical_verse_id`
// (and optional `study_notes.id`). Synced table: UUID v4 PK, soft-delete (`deleted_at`) only
// (AGENTS.md rule 2), and `strokes_payload` encrypted via `e2ee:v1` when the Private Vault is
// enabled (rule 5).

import type { CryptoPrimitivesAdapter, UserDbAdapter } from '../adapters';
import { isEncryptedEnvelope } from '../crypto/envelope';
import type { FieldCipher } from '../crypto/field-cipher';
import { uuidV4 } from '../crypto/uuid';
import type { InkCanvasRecord, InkStroke } from '../domain/types';
import { normalizeInkStroke, parseInkStrokes } from '../ink/strokes';

const INK_TABLE = 'ink_canvases';

interface InkCanvasRow {
  id: string;
  user_id: string;
  note_id: string | null;
  canonical_verse_id: number;
  strokes_payload: string;
  is_encrypted: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SaveInkCanvasInput {
  readonly id?: string;
  readonly userId: string;
  readonly canonicalVerseId: number;
  readonly noteId?: string;
  readonly strokes: readonly InkStroke[];
}

export interface InkCanvasRepositoryOptions {
  readonly userDb: UserDbAdapter;
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  readonly cipher?: FieldCipher;
  readonly now?: () => number;
}

export class InkCanvasRepository {
  private readonly userDb: UserDbAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  private readonly cipher: FieldCipher | undefined;
  private readonly now: () => number;

  constructor(options: InkCanvasRepositoryOptions) {
    this.userDb = options.userDb;
    this.crypto = options.crypto;
    this.cipher = options.cipher;
    this.now = options.now ?? Date.now;
  }

  /**
   * Create or update a portable vector ink canvas (`ink_canvases`).
   * Uses SELECT-then-INSERT/UPDATE so PowerSync managed views stay compatible (S2 / P2-13).
   */
  async saveCanvas(input: SaveInkCanvasInput): Promise<InkCanvasRecord> {
    const normalizedStrokes = input.strokes.map(normalizeInkStroke).filter((s) => s.points.length > 0);
    const id = input.id ?? uuidV4(this.crypto.randomBytes);
    const ts = this.timestamp();
    const plaintext = JSON.stringify(normalizedStrokes);
    const enc = await this.encryptStrokes(id, plaintext);

    const { rows } = await this.userDb.query<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM ink_canvases WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, input.userId],
    );
    const existing = rows[0];

    await this.userDb.writeTransaction(async (tx) => {
      if (existing === undefined) {
        await tx.execute(
          `INSERT INTO ink_canvases
             (id, user_id, note_id, canonical_verse_id, strokes_payload, is_encrypted,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.userId,
            input.noteId ?? null,
            input.canonicalVerseId,
            enc.value,
            enc.isEncrypted ? 1 : 0,
            ts,
            ts,
          ],
        );
      } else {
        await tx.execute(
          `UPDATE ink_canvases
              SET note_id = ?, canonical_verse_id = ?, strokes_payload = ?,
                  is_encrypted = ?, updated_at = ?, deleted_at = NULL
            WHERE id = ? AND user_id = ?`,
          [
            input.noteId ?? null,
            input.canonicalVerseId,
            enc.value,
            enc.isEncrypted ? 1 : 0,
            ts,
            id,
            input.userId,
          ],
        );
      }
    });

    return {
      id,
      userId: input.userId,
      ...(input.noteId !== undefined ? { noteId: input.noteId } : {}),
      canonicalVerseId: input.canonicalVerseId,
      strokes: normalizedStrokes,
      isEncrypted: enc.isEncrypted,
      createdAt: existing?.created_at ?? ts,
      updatedAt: ts,
    };
  }

  /** Fetch one active canvas by ID. */
  async getCanvas(canvasId: string, userId: string): Promise<InkCanvasRecord | null> {
    const { rows } = await this.userDb.query<InkCanvasRow>(
      `SELECT id, user_id, note_id, canonical_verse_id, strokes_payload, is_encrypted,
              created_at, updated_at, deleted_at
         FROM ink_canvases
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [canvasId, userId],
    );
    return rows[0] !== undefined ? this.hydrateRow(rows[0]) : null;
  }

  /** List active canvases attached to a canonical verse (ordered newest first). */
  async listCanvasesForVerse(userId: string, canonicalVerseId: number): Promise<InkCanvasRecord[]> {
    const { rows } = await this.userDb.query<InkCanvasRow>(
      `SELECT id, user_id, note_id, canonical_verse_id, strokes_payload, is_encrypted,
              created_at, updated_at, deleted_at
         FROM ink_canvases
        WHERE user_id = ? AND canonical_verse_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
      [userId, canonicalVerseId],
    );
    return Promise.all(rows.map((r) => this.hydrateRow(r)));
  }

  /** List active canvases attached to a specific `study_notes.id`. */
  async listCanvasesForNote(userId: string, noteId: string): Promise<InkCanvasRecord[]> {
    const { rows } = await this.userDb.query<InkCanvasRow>(
      `SELECT id, user_id, note_id, canonical_verse_id, strokes_payload, is_encrypted,
              created_at, updated_at, deleted_at
         FROM ink_canvases
        WHERE user_id = ? AND note_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
      [userId, noteId],
    );
    return Promise.all(rows.map((r) => this.hydrateRow(r)));
  }

  /** Soft-delete only (AGENTS.md rule 2). */
  async deleteCanvas(canvasId: string, userId: string): Promise<void> {
    const ts = this.timestamp();
    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE ink_canvases
            SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [ts, ts, canvasId, userId],
      );
    });
  }

  private async encryptStrokes(
    rowId: string,
    plaintext: string,
  ): Promise<{ value: string; isEncrypted: boolean }> {
    const cipher = this.cipher;
    if (cipher !== undefined && cipher.enabled) {
      return {
        value: await cipher.encrypt(INK_TABLE, rowId, 'strokes_payload', plaintext),
        isEncrypted: true,
      };
    }
    return { value: plaintext, isEncrypted: false };
  }

  private async hydrateRow(row: InkCanvasRow): Promise<InkCanvasRecord> {
    let rawJson = row.strokes_payload;
    const encrypted = row.is_encrypted === 1 || isEncryptedEnvelope(row.strokes_payload);
    if (isEncryptedEnvelope(row.strokes_payload)) {
      if (this.cipher === undefined) {
        rawJson = '[]';
      } else {
        try {
          rawJson = await this.cipher.decrypt(INK_TABLE, row.id, 'strokes_payload', row.strokes_payload);
        } catch {
          rawJson = '[]';
        }
      }
    }

    return {
      id: row.id,
      userId: row.user_id,
      ...(row.note_id !== null ? { noteId: row.note_id } : {}),
      canonicalVerseId: row.canonical_verse_id,
      strokes: parseInkStrokes(rawJson),
      isEncrypted: encrypted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}),
    };
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}
