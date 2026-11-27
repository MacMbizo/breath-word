// FR-205 — Guided Prayer Engines session logging (`prayer_session_logs`, B4 §4.3).
//
// One soft-deletable row per completed engine run; the optional `journal_payload` is encrypted
// with the vault's `FieldCipher` when the vault is enabled, and degrades (never crashes a history
// list) when the vault is locked (C3 `CRYPTO_VAULT_LOCKED` / `CRYPTO_DECRYPT_FAILED`).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFieldCipher, type FieldCipher } from '../src/crypto/field-cipher';
import { PrayerEngineRepository } from '../src/repositories/prayer-engine-repository';

import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const START = Date.parse('2026-11-25T08:30:00Z');

let tick = 0;
const now = (): number => START + tick++ * 1000;

let userDb: NodeUserDbAdapter;

function makeRepo(cipher?: FieldCipher): PrayerEngineRepository {
  const options: ConstructorParameters<typeof PrayerEngineRepository>[0] = {
    userDb,
    crypto: webCryptoAdapter,
    now,
  };
  return new PrayerEngineRepository(cipher === undefined ? options : { ...options, cipher });
}

beforeEach(() => {
  tick = 0;
  userDb = new NodeUserDbAdapter();
});

afterEach(() => {
  userDb.close();
});

async function countRows(): Promise<number> {
  const result = await userDb.query<{ c: number }>('SELECT count(*) AS c FROM prayer_session_logs');
  return result.rows[0]?.c ?? -1;
}

describe('PrayerEngineRepository.logSession (FR-205)', () => {
  it('records a completed session without a journal', async () => {
    const repo = makeRepo();
    const log = await repo.logSession({
      userId: USER_ID,
      framework: 'LECTIO_DIVINA',
      durationSeconds: 300,
      poolId: 'pool-1',
      itemId: 'item-1',
    });

    expect(log.framework).toBe('LECTIO_DIVINA');
    expect(log.durationSeconds).toBe(300);
    expect(log.isEncrypted).toBe(false);
    expect(log.journal).toBeUndefined();
    expect(log.completedAt).toBeTruthy();
    expect(await countRows()).toBe(1);

    const [stored] = await repo.listRecentSessions(USER_ID);
    expect(stored).toMatchObject({ id: log.id, poolId: 'pool-1', itemId: 'item-1' });
    expect(stored?.journal).toBeUndefined();
  });

  it('stores an unencrypted journal verbatim when the vault is disabled', async () => {
    const repo = makeRepo();
    await repo.logSession({
      userId: USER_ID,
      framework: 'ACTS',
      durationSeconds: 120,
      journal: 'Adoration, Confession, Thanksgiving, Supplication.',
    });

    const [stored] = await repo.listRecentSessions(USER_ID);
    expect(stored?.isEncrypted).toBe(false);
    expect(stored?.journal).toBe('Adoration, Confession, Thanksgiving, Supplication.');
  });

  it('returns recent sessions newest first and honours the limit', async () => {
    const repo = makeRepo();
    await repo.logSession({ userId: USER_ID, framework: 'BREATH', durationSeconds: 60 });
    await repo.logSession({ userId: USER_ID, framework: 'THREE_RS', durationSeconds: 90 });
    await repo.logSession({ userId: USER_ID, framework: 'DECK', durationSeconds: 45 });

    const sessions = await repo.listRecentSessions(USER_ID);
    expect(sessions.map((session) => session.framework)).toEqual(['DECK', 'THREE_RS', 'BREATH']);

    expect(await repo.listRecentSessions(USER_ID, 2)).toHaveLength(2);
  });

  it('soft-deletes a session without a hard DELETE', async () => {
    const repo = makeRepo();
    const log = await repo.logSession({ userId: USER_ID, framework: 'BREATH', durationSeconds: 60 });

    await repo.softDeleteSession(log.id);

    expect(await repo.listRecentSessions(USER_ID)).toEqual([]);
    expect(await countRows()).toBe(1);
    const tombstone = await userDb.query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM prayer_session_logs WHERE id = ?',
      [log.id],
    );
    expect(tombstone.rows[0]?.deleted_at).toBeTruthy();
  });
});

describe('PrayerEngineRepository journal E2EE (FR-205 / FR-206)', () => {
  let dek: Uint8Array | null;
  let enabled: boolean;

  beforeEach(() => {
    dek = webCryptoAdapter.randomBytes(32);
    enabled = true;
  });

  const cipher = (): FieldCipher => createFieldCipher(webCryptoAdapter, () => enabled, () => dek);

  it('encrypts the journal as an e2ee:v1 envelope and decrypts it on read', async () => {
    const repo = makeRepo(cipher());
    await repo.logSession({
      userId: USER_ID,
      framework: 'LECTIO_DIVINA',
      durationSeconds: 300,
      journal: 'What is God saying to me?',
    });

    const raw = await userDb.query<{ journal_payload: string | null; is_encrypted: number }>(
      'SELECT journal_payload, is_encrypted FROM prayer_session_logs',
    );
    expect(raw.rows[0]?.is_encrypted).toBe(1);
    expect(raw.rows[0]?.journal_payload?.startsWith('e2ee:v1:')).toBe(true);
    expect(raw.rows[0]?.journal_payload).not.toContain('God saying');

    const [stored] = await repo.listRecentSessions(USER_ID);
    expect(stored?.isEncrypted).toBe(true);
    expect(stored?.journal).toBe('What is God saying to me?');
  });

  it('degrades the journal to undefined when the vault is locked', async () => {
    const repo = makeRepo(cipher());
    await repo.logSession({
      userId: USER_ID,
      framework: 'ACTS',
      durationSeconds: 120,
      journal: 'sealed reflection',
    });

    dek = null; // lock

    const [stored] = await repo.listRecentSessions(USER_ID);
    expect(stored?.isEncrypted).toBe(true);
    expect(stored?.journal).toBeUndefined();
  });
});
