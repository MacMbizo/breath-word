// FR-304 Inductive Bible Study Suite (B4 §4.3 `highlights`, `study_notes`; B4 §4.4 local reminders).
//
// Supports:
//   (1) Observation: color + symbolic highlights (`KEY_TERM`, `GOD_REF`, `TRANSITION`, `PROMISE`,
//       `COMMAND`) and structured 5Ws & H notes (`INDUCTIVE_5WH`).
//   (2) Interpretation: Personal Paraphrase notes (`PARAPHRASE`).
//   (3) Application: 5-step card (`APPLICATION`: Verse -> Truth -> Need -> Intent -> Checkup) with
//       `checkup_remind_at` synced on `study_notes` and scheduled in `local_device.sqlite`.
//
// Synced tables (`highlights`, `study_notes`) use UUID v4 PKs and soft deletes (`deleted_at`) only
// (AGENTS.md rule 2). Sensitive note payloads (`title_payload`, `body_payload`) use `e2ee:v1` when
// the Private Vault is enabled (rule 5).

import type { CryptoPrimitivesAdapter, LocalDeviceAdapter, UserDbAdapter } from '../adapters';
import { isEncryptedEnvelope } from '../crypto/envelope';
import type { FieldCipher } from '../crypto/field-cipher';
import { uuidV4 } from '../crypto/uuid';
import { formatCanonicalRange } from '../domain/bbcccvvv';
import type {
  Application5StepContent,
  ApplicationCheckupReminder,
  HighlightRecord,
  Inductive5WhContent,
  NoteType,
  StudyNoteRecord,
  SymbolTag,
} from '../domain/types';

const NOTES_TABLE = 'study_notes';
const CHECKUP_STATE_KEY = 'inductive_checkup_reminders_v1';

interface HighlightRow {
  id: string;
  user_id: string;
  translation_code: string;
  start_verse_id: number;
  end_verse_id: number;
  start_offset: number | null;
  end_offset: number | null;
  color_hex: string;
  symbol_tag: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface StudyNoteRow {
  id: string;
  user_id: string;
  start_verse_id: number;
  end_verse_id: number;
  note_type: string;
  title_payload: string | null;
  body_payload: string;
  is_encrypted: number;
  checkup_remind_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateHighlightInput {
  readonly userId: string;
  readonly translationCode: string;
  readonly startVerseId: number;
  readonly endVerseId: number;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly colorHex: string;
  readonly symbolTag?: SymbolTag;
}

export interface UpdateHighlightInput {
  readonly colorHex?: string;
  readonly symbolTag?: SymbolTag | null;
}

export interface CreateStudyNoteInput {
  readonly userId: string;
  readonly startVerseId: number;
  readonly endVerseId: number;
  readonly noteType: NoteType;
  readonly title?: string;
  readonly body: string;
  readonly checkupRemindAt?: string;
}

export interface UpdateStudyNoteInput {
  readonly title?: string | null;
  readonly body?: string;
  readonly noteType?: NoteType;
  readonly checkupRemindAt?: string | null;
}

export interface ListCheckupRemindersOptions {
  readonly includeDismissed?: boolean;
  readonly dueBefore?: string;
}

export interface InductiveStudyRepositoryOptions {
  readonly userDb: UserDbAdapter;
  readonly localDevice: LocalDeviceAdapter;
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  readonly cipher?: FieldCipher;
  readonly now?: () => number;
}

export function serializeInductive5Wh(content: Inductive5WhContent): string {
  return JSON.stringify(content);
}

export function parseInductive5Wh(raw: string): Inductive5WhContent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    return {
      who: typeof rec.who === 'string' ? rec.who : '',
      what: typeof rec.what === 'string' ? rec.what : '',
      when: typeof rec.when === 'string' ? rec.when : '',
      where: typeof rec.where === 'string' ? rec.where : '',
      why: typeof rec.why === 'string' ? rec.why : '',
      how: typeof rec.how === 'string' ? rec.how : '',
    };
  } catch {
    return null;
  }
}

export function serializeApplication5Step(content: Application5StepContent): string {
  return JSON.stringify(content);
}

export function parseApplication5Step(raw: string): Application5StepContent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    return {
      verse: typeof rec.verse === 'string' ? rec.verse : '',
      truth: typeof rec.truth === 'string' ? rec.truth : '',
      need: typeof rec.need === 'string' ? rec.need : '',
      intent: typeof rec.intent === 'string' ? rec.intent : '',
      checkupNote: typeof rec.checkupNote === 'string' ? rec.checkupNote : '',
    };
  } catch {
    return null;
  }
}

export class InductiveStudyRepository {
  private readonly userDb: UserDbAdapter;
  private readonly localDevice: LocalDeviceAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'randomBytes'>;
  private readonly cipher: FieldCipher | undefined;
  private readonly now: () => number;

  constructor(options: InductiveStudyRepositoryOptions) {
    this.userDb = options.userDb;
    this.localDevice = options.localDevice;
    this.crypto = options.crypto;
    this.cipher = options.cipher;
    this.now = options.now ?? Date.now;
  }

  // --------------------------------------------------------------------------
  // Observation Highlights (`highlights`)
  // --------------------------------------------------------------------------

  async createHighlight(input: CreateHighlightInput): Promise<HighlightRecord> {
    const id = uuidV4(this.crypto.randomBytes);
    const ts = this.timestamp();
    const startVerseId = Math.min(input.startVerseId, input.endVerseId);
    const endVerseId = Math.max(input.startVerseId, input.endVerseId);

    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO highlights
           (id, user_id, translation_code, start_verse_id, end_verse_id,
            start_offset, end_offset, color_hex, symbol_tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.userId,
          input.translationCode,
          startVerseId,
          endVerseId,
          input.startOffset ?? null,
          input.endOffset ?? null,
          input.colorHex,
          input.symbolTag ?? null,
          ts,
          ts,
        ],
      );
    });

    return {
      id,
      userId: input.userId,
      translationCode: input.translationCode,
      startVerseId,
      endVerseId,
      ...(input.startOffset !== undefined ? { startOffset: input.startOffset } : {}),
      ...(input.endOffset !== undefined ? { endOffset: input.endOffset } : {}),
      colorHex: input.colorHex,
      ...(input.symbolTag !== undefined ? { symbolTag: input.symbolTag } : {}),
      createdAt: ts,
      updatedAt: ts,
    };
  }

  async updateHighlight(
    highlightId: string,
    userId: string,
    patch: UpdateHighlightInput,
  ): Promise<HighlightRecord | null> {
    const { rows } = await this.userDb.query<HighlightRow>(
      `SELECT id, user_id, translation_code, start_verse_id, end_verse_id,
              start_offset, end_offset, color_hex, symbol_tag, created_at, updated_at, deleted_at
         FROM highlights
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [highlightId, userId],
    );
    const existing = rows[0];
    if (existing === undefined) return null;

    const nextColor = patch.colorHex ?? existing.color_hex;
    const nextSymbol = patch.symbolTag === undefined ? existing.symbol_tag : patch.symbolTag;
    const ts = this.timestamp();

    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE highlights
            SET color_hex = ?, symbol_tag = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [nextColor, nextSymbol, ts, highlightId, userId],
      );
    });

    return mapHighlightRow({
      ...existing,
      color_hex: nextColor,
      symbol_tag: nextSymbol,
      updated_at: ts,
    });
  }

  async listHighlightsForRange(
    userId: string,
    startVerseId: number,
    endVerseId: number,
    translationCode?: string,
  ): Promise<HighlightRecord[]> {
    const params: unknown[] = [userId, endVerseId, startVerseId];
    let translationClause = '';
    if (translationCode !== undefined) {
      translationClause = ' AND translation_code = ?';
      params.push(translationCode);
    }
    const { rows } = await this.userDb.query<HighlightRow>(
      `SELECT id, user_id, translation_code, start_verse_id, end_verse_id,
              start_offset, end_offset, color_hex, symbol_tag, created_at, updated_at, deleted_at
         FROM highlights
        WHERE user_id = ? AND deleted_at IS NULL
          AND start_verse_id <= ? AND end_verse_id >= ?${translationClause}
        ORDER BY start_verse_id ASC, created_at ASC`,
      params,
    );
    return rows.map(mapHighlightRow);
  }

  async listHighlightsForUser(userId: string, symbolTag?: SymbolTag): Promise<HighlightRecord[]> {
    const params: unknown[] = [userId];
    let symbolClause = '';
    if (symbolTag !== undefined) {
      symbolClause = ' AND symbol_tag = ?';
      params.push(symbolTag);
    }
    const { rows } = await this.userDb.query<HighlightRow>(
      `SELECT id, user_id, translation_code, start_verse_id, end_verse_id,
              start_offset, end_offset, color_hex, symbol_tag, created_at, updated_at, deleted_at
         FROM highlights
        WHERE user_id = ? AND deleted_at IS NULL${symbolClause}
        ORDER BY updated_at DESC`,
      params,
    );
    return rows.map(mapHighlightRow);
  }

  /** Soft-delete only (AGENTS.md rule 2). */
  async deleteHighlight(highlightId: string, userId: string): Promise<void> {
    const ts = this.timestamp();
    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE highlights
            SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [ts, ts, highlightId, userId],
      );
    });
  }

  // --------------------------------------------------------------------------
  // Inductive Study Notes (`study_notes`) + Checkup Reminders
  // --------------------------------------------------------------------------

  async createNote(input: CreateStudyNoteInput): Promise<StudyNoteRecord> {
    const id = uuidV4(this.crypto.randomBytes);
    const ts = this.timestamp();
    const startVerseId = Math.min(input.startVerseId, input.endVerseId);
    const endVerseId = Math.max(input.startVerseId, input.endVerseId);

    const encBody = await this.encryptField(id, 'body_payload', input.body);
    const encTitle =
      input.title !== undefined
        ? await this.encryptField(id, 'title_payload', input.title)
        : { value: null as string | null, isEncrypted: encBody.isEncrypted };

    const isEncrypted = encBody.isEncrypted || encTitle.isEncrypted;

    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO study_notes
           (id, user_id, start_verse_id, end_verse_id, note_type,
            title_payload, body_payload, is_encrypted, checkup_remind_at,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.userId,
          startVerseId,
          endVerseId,
          input.noteType,
          encTitle.value,
          encBody.value,
          isEncrypted ? 1 : 0,
          input.checkupRemindAt ?? null,
          ts,
          ts,
        ],
      );
    });

    if (input.checkupRemindAt !== undefined) {
      await this.upsertCheckupReminder({
        noteId: id,
        startVerseId,
        endVerseId,
        passageReference: formatCanonicalRange(startVerseId, endVerseId),
        remindAt: input.checkupRemindAt,
        dismissed: false,
      });
    }

    return {
      id,
      userId: input.userId,
      startVerseId,
      endVerseId,
      passageReference: formatCanonicalRange(startVerseId, endVerseId),
      noteType: input.noteType,
      ...(input.title !== undefined ? { title: input.title } : {}),
      body: input.body,
      isEncrypted,
      ...(input.checkupRemindAt !== undefined ? { checkupRemindAt: input.checkupRemindAt } : {}),
      createdAt: ts,
      updatedAt: ts,
    };
  }

  async updateNote(
    noteId: string,
    userId: string,
    patch: UpdateStudyNoteInput,
  ): Promise<StudyNoteRecord | null> {
    const { rows } = await this.userDb.query<StudyNoteRow>(
      `SELECT id, user_id, start_verse_id, end_verse_id, note_type,
              title_payload, body_payload, is_encrypted, checkup_remind_at,
              created_at, updated_at, deleted_at
         FROM study_notes
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [noteId, userId],
    );
    const existing = rows[0];
    if (existing === undefined) return null;

    const ts = this.timestamp();
    const nextNoteType = patch.noteType ?? (existing.note_type as NoteType);

    let nextTitleStored = existing.title_payload;
    let nextTitleEncrypted = existing.is_encrypted === 1;
    if (patch.title === null) {
      nextTitleStored = null;
    } else if (patch.title !== undefined) {
      const enc = await this.encryptField(noteId, 'title_payload', patch.title);
      nextTitleStored = enc.value;
      nextTitleEncrypted = enc.isEncrypted;
    }

    let nextBodyStored = existing.body_payload;
    let nextBodyEncrypted = existing.is_encrypted === 1;
    if (patch.body !== undefined) {
      const enc = await this.encryptField(noteId, 'body_payload', patch.body);
      nextBodyStored = enc.value;
      nextBodyEncrypted = enc.isEncrypted;
    }

    const nextRemindAt =
      patch.checkupRemindAt === undefined ? existing.checkup_remind_at : patch.checkupRemindAt;
    const isEncrypted = nextBodyEncrypted || nextTitleEncrypted;

    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE study_notes
            SET note_type = ?, title_payload = ?, body_payload = ?,
                is_encrypted = ?, checkup_remind_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [
          nextNoteType,
          nextTitleStored,
          nextBodyStored,
          isEncrypted ? 1 : 0,
          nextRemindAt,
          ts,
          noteId,
          userId,
        ],
      );
    });

    if (patch.checkupRemindAt !== undefined) {
      if (patch.checkupRemindAt === null) {
        await this.removeCheckupReminder(noteId);
      } else {
        await this.upsertCheckupReminder({
          noteId,
          startVerseId: existing.start_verse_id,
          endVerseId: existing.end_verse_id,
          passageReference: formatCanonicalRange(existing.start_verse_id, existing.end_verse_id),
          remindAt: patch.checkupRemindAt,
          dismissed: false,
        });
      }
    }

    return this.hydrateNoteRow({
      ...existing,
      note_type: nextNoteType,
      title_payload: nextTitleStored,
      body_payload: nextBodyStored,
      is_encrypted: isEncrypted ? 1 : 0,
      checkup_remind_at: nextRemindAt,
      updated_at: ts,
    });
  }

  async getNote(noteId: string, userId: string): Promise<StudyNoteRecord | null> {
    const { rows } = await this.userDb.query<StudyNoteRow>(
      `SELECT id, user_id, start_verse_id, end_verse_id, note_type,
              title_payload, body_payload, is_encrypted, checkup_remind_at,
              created_at, updated_at, deleted_at
         FROM study_notes
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [noteId, userId],
    );
    return rows[0] !== undefined ? this.hydrateNoteRow(rows[0]) : null;
  }

  async listNotesForRange(
    userId: string,
    startVerseId: number,
    endVerseId: number,
    noteType?: NoteType,
  ): Promise<StudyNoteRecord[]> {
    const params: unknown[] = [userId, endVerseId, startVerseId];
    let typeClause = '';
    if (noteType !== undefined) {
      typeClause = ' AND note_type = ?';
      params.push(noteType);
    }
    const { rows } = await this.userDb.query<StudyNoteRow>(
      `SELECT id, user_id, start_verse_id, end_verse_id, note_type,
              title_payload, body_payload, is_encrypted, checkup_remind_at,
              created_at, updated_at, deleted_at
         FROM study_notes
        WHERE user_id = ? AND deleted_at IS NULL
          AND start_verse_id <= ? AND end_verse_id >= ?${typeClause}
        ORDER BY updated_at DESC`,
      params,
    );
    return Promise.all(rows.map((r) => this.hydrateNoteRow(r)));
  }

  async listNotesForUser(userId: string, noteType?: NoteType): Promise<StudyNoteRecord[]> {
    const params: unknown[] = [userId];
    let typeClause = '';
    if (noteType !== undefined) {
      typeClause = ' AND note_type = ?';
      params.push(noteType);
    }
    const { rows } = await this.userDb.query<StudyNoteRow>(
      `SELECT id, user_id, start_verse_id, end_verse_id, note_type,
              title_payload, body_payload, is_encrypted, checkup_remind_at,
              created_at, updated_at, deleted_at
         FROM study_notes
        WHERE user_id = ? AND deleted_at IS NULL${typeClause}
        ORDER BY updated_at DESC`,
      params,
    );
    return Promise.all(rows.map((r) => this.hydrateNoteRow(r)));
  }

  /** Soft-delete only (AGENTS.md rule 2); removes any local checkup reminder for this note. */
  async deleteNote(noteId: string, userId: string): Promise<void> {
    const ts = this.timestamp();
    await this.userDb.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE study_notes
            SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [ts, ts, noteId, userId],
      );
    });
    await this.removeCheckupReminder(noteId);
  }

  // --------------------------------------------------------------------------
  // Local Application Checkup Reminders (`local_device.sqlite -> workspace_state`)
  // --------------------------------------------------------------------------

  async listCheckupReminders(
    options: ListCheckupRemindersOptions = {},
  ): Promise<ApplicationCheckupReminder[]> {
    const all = await this.readCheckupReminders();
    return all
      .filter((r) => (options.includeDismissed === true ? true : !r.dismissed))
      .filter((r) => (options.dueBefore !== undefined ? r.remindAt <= options.dueBefore : true))
      .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  }

  async dismissCheckupReminder(noteId: string): Promise<void> {
    const all = await this.readCheckupReminders();
    const updated = all.map((r) => (r.noteId === noteId ? { ...r, dismissed: true } : r));
    await this.writeCheckupReminders(updated);
  }

  private async upsertCheckupReminder(entry: ApplicationCheckupReminder): Promise<void> {
    const all = await this.readCheckupReminders();
    const filtered = all.filter((r) => r.noteId !== entry.noteId);
    filtered.push(entry);
    await this.writeCheckupReminders(filtered);
  }

  private async removeCheckupReminder(noteId: string): Promise<void> {
    const all = await this.readCheckupReminders();
    const filtered = all.filter((r) => r.noteId !== noteId);
    if (filtered.length !== all.length) {
      await this.writeCheckupReminders(filtered);
    }
  }

  private async readCheckupReminders(): Promise<ApplicationCheckupReminder[]> {
    const { rows } = await this.localDevice.query<{ value_json: string }>(
      `SELECT value_json FROM workspace_state WHERE key = ? LIMIT 1`,
      [CHECKUP_STATE_KEY],
    );
    if (rows[0] === undefined) return [];
    try {
      const parsed: unknown = JSON.parse(rows[0].value_json);
      return Array.isArray(parsed) ? (parsed as ApplicationCheckupReminder[]) : [];
    } catch {
      return [];
    }
  }

  private async writeCheckupReminders(reminders: ApplicationCheckupReminder[]): Promise<void> {
    await this.localDevice.execute(
      `INSERT INTO workspace_state (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [CHECKUP_STATE_KEY, JSON.stringify(reminders), this.timestamp()],
    );
  }

  // --------------------------------------------------------------------------
  // E2EE helpers
  // --------------------------------------------------------------------------

  private async encryptField(
    rowId: string,
    column: 'title_payload' | 'body_payload',
    plaintext: string,
  ): Promise<{ value: string; isEncrypted: boolean }> {
    const cipher = this.cipher;
    if (cipher !== undefined && cipher.enabled) {
      return { value: await cipher.encrypt(NOTES_TABLE, rowId, column, plaintext), isEncrypted: true };
    }
    return { value: plaintext, isEncrypted: false };
  }

  private async decryptField(
    rowId: string,
    column: 'title_payload' | 'body_payload',
    stored: string | null,
  ): Promise<string | undefined> {
    if (stored === null) return undefined;
    if (!isEncryptedEnvelope(stored)) return stored;
    if (this.cipher === undefined) return undefined;
    try {
      return await this.cipher.decrypt(NOTES_TABLE, rowId, column, stored);
    } catch {
      return undefined;
    }
  }

  private async hydrateNoteRow(row: StudyNoteRow): Promise<StudyNoteRecord> {
    const title = await this.decryptField(row.id, 'title_payload', row.title_payload);
    const body = (await this.decryptField(row.id, 'body_payload', row.body_payload)) ?? '';
    return {
      id: row.id,
      userId: row.user_id,
      startVerseId: row.start_verse_id,
      endVerseId: row.end_verse_id,
      passageReference: formatCanonicalRange(row.start_verse_id, row.end_verse_id),
      noteType: row.note_type as NoteType,
      ...(title !== undefined ? { title } : {}),
      body,
      isEncrypted: row.is_encrypted === 1 || isEncryptedEnvelope(row.body_payload),
      ...(row.checkup_remind_at !== null ? { checkupRemindAt: row.checkup_remind_at } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}),
    };
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}

function mapHighlightRow(row: HighlightRow): HighlightRecord {
  return {
    id: row.id,
    userId: row.user_id,
    translationCode: row.translation_code,
    startVerseId: row.start_verse_id,
    endVerseId: row.end_verse_id,
    ...(row.start_offset !== null ? { startOffset: row.start_offset } : {}),
    ...(row.end_offset !== null ? { endOffset: row.end_offset } : {}),
    colorHex: row.color_hex,
    ...(row.symbol_tag !== null ? { symbolTag: row.symbol_tag as SymbolTag } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}),
  };
}
