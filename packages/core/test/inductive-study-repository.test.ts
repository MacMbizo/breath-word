// FR-304 Inductive Bible Study Suite — highlights, 5Ws&H, Paraphrase, 5-step Application,
// checkup reminders (`local_device.sqlite`), soft-delete tombstones, and E2EE vault protection.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isEncryptedEnvelope } from '../src/crypto/envelope';
import { isAppError } from '../src/errors/AppError';
import {
  InductiveStudyRepository,
  parseApplication5Step,
  parseInductive5Wh,
  serializeApplication5Step,
  serializeInductive5Wh,
} from '../src/repositories/inductive-study-repository';
import { VaultRepository } from '../src/repositories/vault-repository';

import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const FIXED_NOW = Date.parse('2026-11-27T09:00:00Z');

let userDb: NodeUserDbAdapter;
let localDevice: NodeLocalDeviceAdapter;
let vault: VaultRepository;
let repo: InductiveStudyRepository;

beforeEach(() => {
  userDb = new NodeUserDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
  vault = new VaultRepository({ userDb, crypto: webCryptoAdapter });
  repo = new InductiveStudyRepository({
    userDb,
    localDevice,
    crypto: webCryptoAdapter,
    cipher: vault.cipher(),
    now: () => FIXED_NOW,
  });
});

afterEach(() => {
  userDb.close();
  localDevice.close();
});

describe('InductiveStudyRepository (FR-304)', () => {
  it('creates, updates, lists, and soft-deletes symbolic highlights (never hard DELETE)', async () => {
    const hl = await repo.createHighlight({
      userId: USER_ID,
      translationCode: 'BSB',
      startVerseId: 45008028,
      endVerseId: 45008028,
      colorHex: '#BAE6FD',
      symbolTag: 'PROMISE',
    });

    expect(hl.symbolTag).toBe('PROMISE');
    const inRange = await repo.listHighlightsForRange(USER_ID, 45008001, 45008039, 'BSB');
    expect(inRange).toHaveLength(1);

    const updated = await repo.updateHighlight(hl.id, USER_ID, {
      colorHex: '#FEF08A',
      symbolTag: 'KEY_TERM',
    });
    expect(updated?.symbolTag).toBe('KEY_TERM');

    await repo.deleteHighlight(hl.id, USER_ID);
    expect(await repo.listHighlightsForRange(USER_ID, 45008001, 45008039)).toHaveLength(0);

    // Tombstone row still exists in SQLite (`deleted_at IS NOT NULL`)
    const raw = await userDb.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM highlights WHERE id = ?`,
      [hl.id],
    );
    expect(raw.rows).toHaveLength(1);
    expect(raw.rows[0]?.deleted_at).not.toBeNull();
  });

  it('stores structured 5Ws & H and 5-step Application notes and schedules a local checkup reminder', async () => {
    const obsBody = serializeInductive5Wh({
      who: 'Paul to believers in Rome',
      what: 'All things work together for good',
      when: 'Present suffering',
      where: 'Epistle to the Romans',
      why: 'Called according to His purpose',
      how: 'Through the Spirit interceding',
    });
    const obs = await repo.createNote({
      userId: USER_ID,
      startVerseId: 45008028,
      endVerseId: 45008028,
      noteType: 'INDUCTIVE_5WH',
      title: 'Romans 8:28 Observation',
      body: obsBody,
    });
    expect(parseInductive5Wh(obs.body)?.who).toBe('Paul to believers in Rome');

    const appBody = serializeApplication5Step({
      verse: 'Romans 8:28',
      truth: 'God sovereignly works every trial for our conformity to Christ.',
      need: 'Tendency to panic when schedules derail.',
      intent: 'Pause and thank God before reacting this week.',
      checkupNote: 'Review on Friday evening.',
    });
    const remindAt = '2026-12-04T19:00:00Z';
    const app = await repo.createNote({
      userId: USER_ID,
      startVerseId: 45008028,
      endVerseId: 45008028,
      noteType: 'APPLICATION',
      title: 'Trust in trials',
      body: appBody,
      checkupRemindAt: remindAt,
    });

    expect(parseApplication5Step(app.body)?.intent).toContain('thank God');
    expect(app.checkupRemindAt).toBe(remindAt);

    const reminders = await repo.listCheckupReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.noteId).toBe(app.id);
    expect(reminders[0]?.remindAt).toBe(remindAt);

    await repo.dismissCheckupReminder(app.id);
    expect(await repo.listCheckupReminders()).toHaveLength(0);
    expect(await repo.listCheckupReminders({ includeDismissed: true })).toHaveLength(1);

    await repo.deleteNote(app.id, USER_ID);
    expect(await repo.listCheckupReminders({ includeDismissed: true })).toHaveLength(0);
  });

  it('encrypts study_notes payloads when the vault is enabled and batch-encrypts pre-existing plaintext on initVault', async () => {
    const preVault = await repo.createNote({
      userId: USER_ID,
      startVerseId: 19023001,
      endVerseId: 19023006,
      noteType: 'PARAPHRASE',
      title: 'My Psalm 23 Paraphrase',
      body: 'The Lord personally shepherds me; I lack nothing I truly need.',
    });
    expect(preVault.isEncrypted).toBe(false);

    // Enable vault — B6 §4.2.1 batch-encrypts pre-existing study_notes too
    await vault.initVault(USER_ID, 'strong-study-passphrase');

    const rawPre = await userDb.query<{ title_payload: string; body_payload: string; is_encrypted: number }>(
      `SELECT title_payload, body_payload, is_encrypted FROM study_notes WHERE id = ?`,
      [preVault.id],
    );
    expect(rawPre.rows[0]?.is_encrypted).toBe(1);
    expect(isEncryptedEnvelope(rawPre.rows[0]!.title_payload)).toBe(true);
    expect(isEncryptedEnvelope(rawPre.rows[0]!.body_payload)).toBe(true);

    // Unlocked read decrypts transparently
    const decrypted = await repo.getNote(preVault.id, USER_ID);
    expect(decrypted?.title).toBe('My Psalm 23 Paraphrase');
    expect(decrypted?.body).toContain('personally shepherds');

    // Locked vault blocks new writes with CRYPTO_VAULT_LOCKED
    vault.lock();
    try {
      await repo.createNote({
        userId: USER_ID,
        startVerseId: 19023001,
        endVerseId: 19023001,
        noteType: 'GENERAL',
        body: 'Should fail while locked',
      });
      expect.unreachable('Expected CRYPTO_VAULT_LOCKED');
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) {
        expect(err.code).toBe('CRYPTO_VAULT_LOCKED');
      }
    }
  });
});
