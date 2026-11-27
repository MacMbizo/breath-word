// FR-201/202/203 — Prayer Pools, capture, per-user E2EE state, rotation & testimonies.
//
// Exercises the exact synced-table SQL the platform adapters run against an in-memory
// `UserDbAdapter` (B4 §4.3): soft-delete only, shared-pool privacy split (per-user state
// lives strictly in `prayer_item_user_states`), and `e2ee:v1` field encryption when the
// vault is enabled (B6 §4.2, C3 `CRYPTO_VAULT_LOCKED` / `CRYPTO_DECRYPT_FAILED`).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFieldCipher, type FieldCipher } from '../src/crypto/field-cipher';
import { isAppError } from '../src/errors/AppError';
import { PrayerPoolRepository } from '../src/repositories/prayer-pool-repository';

import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';

const START = Date.parse('2026-11-25T08:30:00Z');

/** Deterministic, strictly-increasing clock so `created_at` ordering is stable in tests. */
let tick = 0;
const now = (): number => START + tick++ * 1000;

let userDb: NodeUserDbAdapter;

function makeRepo(cipher?: FieldCipher): PrayerPoolRepository {
  const options: ConstructorParameters<typeof PrayerPoolRepository>[0] = {
    userDb,
    crypto: webCryptoAdapter,
    now,
  };
  return new PrayerPoolRepository(cipher === undefined ? options : { ...options, cipher });
}

beforeEach(() => {
  tick = 0;
  userDb = new NodeUserDbAdapter();
});

afterEach(() => {
  userDb.close();
});

async function countRows(table: string): Promise<number> {
  const result = await userDb.query<{ c: number }>(`SELECT count(*) AS c FROM ${table}`);
  return result.rows[0]?.c ?? -1;
}

async function rawNote(itemId: string): Promise<string | null> {
  const result = await userDb.query<{ user_notes_payload: string | null }>(
    'SELECT user_notes_payload FROM prayer_item_user_states WHERE item_id = ?',
    [itemId],
  );
  return result.rows[0]?.user_notes_payload ?? null;
}

async function rawTestimony(itemId: string): Promise<string | null> {
  const result = await userDb.query<{ testimony_payload: string | null }>(
    'SELECT testimony_payload FROM prayer_item_user_states WHERE item_id = ?',
    [itemId],
  );
  return result.rows[0]?.testimony_payload ?? null;
}

describe('PrayerPoolRepository pools & membership (FR-202)', () => {
  it('creates a pool; the OWNER membership is provisioned server-side (B2 §4.2)', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Morning Watch', category: 'GUIDANCE' });

    expect(pool.visibility).toBe('PRIVATE');
    expect(pool.allowMemberContributions).toBe(false);
    expect(pool.deletedAt).toBeUndefined();

    // The client writes no membership row: `prayer_pool_members` grants no INSERT policy (C4 §4.3),
    // and the server trigger `trg_add_pool_owner_member` owns the OWNER row, which arrives on sync.
    expect(await countRows('prayer_pools')).toBe(1);
    expect(await countRows('prayer_pool_members')).toBe(0);

    // The owner still sees the pool immediately — `listPoolsForUser` treats `owner_user_id` as an
    // implicit OWNER membership, so no optimistic membership row is needed for offline-first.
    const [view] = await repo.listPoolsForUser(OWNER);
    expect(view).toMatchObject({ id: pool.id, userRole: 'OWNER', memberCount: 1 });
  });

  it('round-trips a pool record and returns null for an unknown id', async () => {
    const repo = makeRepo();
    const created = await repo.createPool({
      ownerUserId: OWNER,
      title: 'Anxiety',
      category: 'ANXIETY',
      description: 'Cast all your anxiety on Him.',
      colorHex: '#EF4444',
      visibility: 'SHARED',
    });

    expect(await repo.getPool(created.id)).toEqual(created);
    expect(await repo.getPool('pool_does_not_exist')).toBeNull();
  });

  it('lists owned and joined pools with derived counts and the caller role', async () => {
    const repo = makeRepo();
    const shared = await repo.createPool({
      ownerUserId: OWNER,
      title: 'Church',
      category: 'FAMILY',
      visibility: 'SHARED',
    });
    await repo.addMember(shared.id, MEMBER, 'MEMBER');
    await repo.addItem({
      poolId: shared.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_006,
      translationCode: 'BSB',
      capturedText: 'The LORD is my shepherd.',
    });

    const ownerPools = await repo.listPoolsForUser(OWNER);
    expect(ownerPools).toHaveLength(1);
    expect(ownerPools[0]).toMatchObject({
      id: shared.id,
      userRole: 'OWNER',
      activeItemsCount: 1,
      answeredItemsCount: 0,
      memberCount: 2,
    });

    const memberPools = await repo.listPoolsForUser(MEMBER);
    expect(memberPools).toHaveLength(1);
    expect(memberPools[0]).toMatchObject({ id: shared.id, userRole: 'MEMBER', memberCount: 2 });
  });

  it('updates only the supplied fields and bumps updated_at', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Old', category: 'CUSTOM' });

    await repo.updatePool(pool.id, { title: 'New', colorHex: '#10B981' });

    const updated = await repo.getPool(pool.id);
    expect(updated).toMatchObject({ id: pool.id, title: 'New', colorHex: '#10B981', category: 'CUSTOM' });
    expect((updated?.updatedAt ?? '') > pool.updatedAt).toBe(true);
  });

  it('revives a soft-removed membership instead of inserting a duplicate', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Family', category: 'FAMILY' });
    // The OWNER row is provisioned server-side (`trg_add_pool_owner_member`); model it arriving.
    await repo.addMember(pool.id, OWNER, 'OWNER');

    await repo.addMember(pool.id, MEMBER);
    await repo.removeMember(pool.id, MEMBER);
    expect(await repo.listMembers(pool.id)).toHaveLength(1);

    await repo.addMember(pool.id, MEMBER, 'LEADER');

    const members = await repo.listMembers(pool.id);
    expect(members).toHaveLength(2);
    expect(members.find((member) => member.userId === MEMBER)?.role).toBe('LEADER');
    // One physical row per (pool, user) — the UNIQUE key was reused, not duplicated.
    expect(await countRows('prayer_pool_members')).toBe(2);
  });
});

describe('PrayerPoolRepository capture (FR-201)', () => {
  it('captures a passage with a derived canonical reference', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Isaiah', category: 'CUSTOM' });

    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 23_052_013,
      endVerseId: 23_053_012,
      translationCode: 'BSB',
      capturedText: 'See, my servant will act wisely.',
      sharedPromptText: 'Consider the suffering servant.',
    });

    expect(item.passageReference).toBe('Isaiah 52:13-53:12');
    expect(item.isEncrypted).toBe(false);
    expect(item.prayCount).toBe(0);
    expect(item.isArchived).toBe(false);
    expect(item.stateId).toBeUndefined();

    const items = await repo.listItems(OWNER, pool.id);
    expect(items.map((row) => row.itemId)).toEqual([item.itemId]);
  });

  it('soft-deletes a captured item without a hard DELETE', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'T', category: 'CUSTOM' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });

    await repo.softDeleteItem(item.itemId);

    expect(await repo.listItems(OWNER, pool.id)).toEqual([]);
    expect(await countRows('prayer_pool_items')).toBe(1);
  });
});

describe('PrayerPoolRepository per-user state & rotation (FR-203)', () => {
  it('lazily creates one state row per user and increments pray_count monotonically', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Rotate', category: 'CUSTOM' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });

    await repo.recordPray(OWNER, item.itemId, pool.id);
    await repo.recordPray(OWNER, item.itemId, pool.id);

    const [state] = await repo.listItems(OWNER, pool.id);
    expect(state?.prayCount).toBe(2);
    expect(state?.lastPrayedAt).toBeTruthy();
    expect(await countRows('prayer_item_user_states')).toBe(1);

    // The state row is per-user: another member sees their own zeroed state.
    const [memberView] = await repo.listItems(MEMBER, pool.id);
    expect(memberView?.prayCount).toBe(0);
    expect(memberView?.stateId).toBeUndefined();
  });

  it('rotates a freshly-prayed card to the back of the queue', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Deck', category: 'CUSTOM' });
    const a = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'A',
    });
    const b = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'B',
    });
    await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'C',
    });

    const before = await repo.getRotationQueue(OWNER, pool.id);
    expect(before.map((row) => row.capturedText)).toEqual(['A', 'B', 'C']);

    await repo.recordPray(OWNER, a.itemId, pool.id);

    const after = await repo.getRotationQueue(OWNER, pool.id);
    expect(after.map((row) => row.capturedText)).toEqual(['B', 'C', 'A']);

    // Archived cards drop out of the queue entirely.
    await repo.setArchived(OWNER, b.itemId, pool.id, true);
    const archived = await repo.getRotationQueue(OWNER, pool.id);
    expect(archived.map((row) => row.capturedText)).toEqual(['C', 'A']);
  });

  it('marks an item answered with an optional testimony and hides it from the queue on archive', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Answers', category: 'HEALING' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 24_030_005,
      endVerseId: 24_030_005,
      translationCode: 'BSB',
      capturedText: 'Trust in the LORD.',
    });

    await repo.markAnswered(OWNER, item.itemId, pool.id, 'He answered on the 3rd day.');

    const [view] = await repo.listItems(OWNER, pool.id);
    expect(view?.answeredAt).toBeTruthy();
    expect(view?.testimony).toBe('He answered on the 3rd day.');

    const [poolView] = await repo.listPoolsForUser(OWNER);
    expect(poolView?.answeredItemsCount).toBe(1);
  });
});

describe('PrayerPoolRepository E2EE private fields (FR-202 / FR-206)', () => {
  let dek: Uint8Array | null;
  let enabled: boolean;

  beforeEach(() => {
    dek = webCryptoAdapter.randomBytes(32);
    enabled = true;
  });

  const cipher = (): FieldCipher => createFieldCipher(webCryptoAdapter, () => enabled, () => dek);

  it('stores a private note as an e2ee:v1 envelope and decrypts it on read', async () => {
    const repo = makeRepo(cipher());
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Private', category: 'CUSTOM' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });

    await repo.setUserNote(OWNER, item.itemId, pool.id, 'secret before God');

    const stored = await rawNote(item.itemId);
    expect(stored?.startsWith('e2ee:v1:')).toBe(true);
    expect(stored).not.toContain('secret before God');

    const [view] = await repo.listItems(OWNER, pool.id);
    expect(view?.isEncrypted).toBe(true);
    expect(view?.userNotes).toBe('secret before God');
  });

  it('rejects a locked-vault write with CRYPTO_VAULT_LOCKED', async () => {
    const repo = makeRepo(cipher());
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Locked', category: 'CUSTOM' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });

    dek = null; // vault locks between rows

    const error = await repo.setUserNote(OWNER, item.itemId, pool.id, 'cannot save').catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('CRYPTO_VAULT_LOCKED');
  });

  it('degrades a list read when the vault is locked (no crash, notes withheld)', async () => {
    const repo = makeRepo(cipher());
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Locked read', category: 'CUSTOM' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });
    await repo.setUserNote(OWNER, item.itemId, pool.id, 'held in the vault');

    dek = null; // lock

    const [view] = await repo.listItems(OWNER, pool.id);
    expect(view?.isEncrypted).toBe(true);
    expect(view?.userNotes).toBeUndefined();
  });

  it('withholds a row whose ciphertext was swapped across rows (AAD mismatch, CRYPTO_DECRYPT_FAILED)', async () => {
    const repo = makeRepo(cipher());
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'AAD', category: 'CUSTOM' });
    const a = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'A',
    });
    const b = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_002,
      endVerseId: 19_023_002,
      translationCode: 'BSB',
      capturedText: 'B',
    });
    await repo.setUserNote(OWNER, a.itemId, pool.id, 'note-a');
    await repo.setUserNote(OWNER, b.itemId, pool.id, 'note-b');

    // Copy B's ciphertext onto A's row: the row-bound AAD no longer matches.
    const noteB = await rawNote(b.itemId);
    await userDb.execute('UPDATE prayer_item_user_states SET user_notes_payload = ? WHERE item_id = ?', [
      noteB,
      a.itemId,
    ]);

    const items = await repo.listItems(OWNER, pool.id);
    expect(items.find((row) => row.itemId === a.itemId)?.userNotes).toBeUndefined();
    expect(items.find((row) => row.itemId === b.itemId)?.userNotes).toBe('note-b');
  });

  it('encrypts a testimony when one is recorded', async () => {
    const repo = makeRepo(cipher());
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Testimony', category: 'HEALING' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 24_030_005,
      endVerseId: 24_030_005,
      translationCode: 'BSB',
      capturedText: 'v5',
    });

    await repo.markAnswered(OWNER, item.itemId, pool.id, 'God provided.');

    expect((await rawTestimony(item.itemId))?.startsWith('e2ee:v1:')).toBe(true);
    const [view] = await repo.listItems(OWNER, pool.id);
    expect(view?.testimony).toBe('God provided.');
  });

  it('stores plaintext when the vault is disabled (enabled=false)', async () => {
    enabled = false;
    const repo = makeRepo(cipher());
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Plain', category: 'CUSTOM' });
    const item = await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });

    await repo.setUserNote(OWNER, item.itemId, pool.id, 'visible');

    expect(await rawNote(item.itemId)).toBe('visible');
    const [view] = await repo.listItems(OWNER, pool.id);
    expect(view?.isEncrypted).toBe(false);
    expect(view?.userNotes).toBe('visible');
  });
});

describe('PrayerPoolRepository soft delete (B4 §4.3 rule 3)', () => {
  it('tombstones a pool, its items and its memberships without hard DELETEs', async () => {
    const repo = makeRepo();
    const pool = await repo.createPool({ ownerUserId: OWNER, title: 'Doomed', category: 'CUSTOM' });
    await repo.addMember(pool.id, OWNER, 'OWNER'); // server-provisioned OWNER row
    await repo.addMember(pool.id, MEMBER);
    await repo.addItem({
      poolId: pool.id,
      createdByUserId: OWNER,
      startVerseId: 19_023_001,
      endVerseId: 19_023_001,
      translationCode: 'BSB',
      capturedText: 'v1',
    });

    await repo.softDeletePool(pool.id);

    expect(await repo.getPool(pool.id)).toBeNull();
    expect(await repo.listPoolsForUser(OWNER)).toEqual([]);
    expect(await repo.listItems(OWNER, pool.id)).toEqual([]);

    // Rows remain on disk (soft delete), never physically removed.
    expect(await countRows('prayer_pools')).toBe(1);
    expect(await countRows('prayer_pool_items')).toBe(1);
    expect(await countRows('prayer_pool_members')).toBe(2);

    const tombstoned = await userDb.query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM prayer_pools WHERE id = ?',
      [pool.id],
    );
    expect(tombstoned.rows[0]?.deleted_at).toBeTruthy();
  });
});
