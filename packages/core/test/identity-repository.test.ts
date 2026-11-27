// C4 §4.1 — Offline Guest → Account identity & the Zero-Loss upgrade rewrite (FR-206).
// Verifies the atomic local `user_id` re-homing across all 11 synced tables plus the
// `local_device.workspace_state` guest/account binding, and the C3 failure mode.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isAppError } from '../src/errors/AppError';
import {
  ACCOUNT_USER_ID_KEY,
  IdentityRepository,
} from '../src/repositories/identity-repository';

import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const GUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FIXED_NOW = Date.parse('2026-11-27T09:00:00Z');

let userDb: NodeUserDbAdapter;
let localDevice: NodeLocalDeviceAdapter;
let repo: IdentityRepository;

beforeEach(() => {
  userDb = new NodeUserDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
  repo = new IdentityRepository({
    userDb,
    localDevice,
    crypto: webCryptoAdapter,
    now: () => FIXED_NOW,
  });
});

afterEach(() => {
  userDb.close();
  localDevice.close();
});

/** Seed one non-deleted row owned by `userId` in every synced table (B4 §4.3). */
async function seedAllTables(userId: string): Promise<void> {
  await userDb.execute('INSERT INTO user_profiles (id) VALUES (?)', [userId]);
  await userDb.execute(
    `INSERT INTO highlights (id, user_id, translation_code, start_verse_id, end_verse_id, color_hex)
     VALUES ('h1', ?, 'BSB', 45008028, 45008028, '#FFD400')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO study_notes (id, user_id, start_verse_id, end_verse_id, body_payload)
     VALUES ('n1', ?, 45008028, 45008028, '{}')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO ink_canvases (id, user_id, canonical_verse_id, strokes_payload)
     VALUES ('ink1', ?, 45008028, '[]')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO prayer_pools (id, owner_user_id, title, category)
     VALUES ('p1', ?, 'Family', 'FAMILY')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO prayer_pool_members (id, pool_id, user_id) VALUES ('m1', 'p1', ?)`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO prayer_pool_items
       (id, pool_id, created_by_user_id, start_verse_id, end_verse_id, translation_code, captured_text)
     VALUES ('i1', 'p1', ?, 45008028, 45008028, 'BSB', 'All things work together')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO prayer_item_user_states (id, item_id, pool_id, user_id)
     VALUES ('s1', 'i1', 'p1', ?)`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO prayer_session_logs (id, user_id, framework, completed_at)
     VALUES ('log1', ?, 'ACTS', '2026-11-27T09:00:00Z')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO reading_plan_enrollments (id, user_id, plan_id, started_at)
     VALUES ('e1', ?, 'plan_manna_gospels_3', '2026-11-27T09:00:00Z')`,
    [userId],
  );
  await userDb.execute(
    `INSERT INTO reading_progress (id, user_id, enrollment_id, plan_id, day_number)
     VALUES ('r1', ?, 'e1', 'plan_manna_gospels_3', 1)`,
    [userId],
  );
}

async function count(table: string, column: string, value: string): Promise<number> {
  const { rows } = await userDb.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`,
    [value],
  );
  return rows[0]?.n ?? 0;
}

describe('IdentityRepository guest identity (C4 §4.1)', () => {
  it('generates and persists a guest id on first use, then reuses it', async () => {
    expect(await repo.getGuestUserId()).toBeNull();

    const created = await repo.getOrCreateGuestUserId();
    expect(created).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await repo.getGuestUserId()).toBe(created);
    expect(await repo.getOrCreateGuestUserId()).toBe(created);
  });

  it('reports the guest id as the current identity while signed out', async () => {
    const guest = await repo.getOrCreateGuestUserId();
    expect(await repo.getCurrentUserId()).toBe(guest);
    expect(await repo.getAccountUserId()).toBeNull();
  });

  it('resolves the writing identity to a generated guest id while signed out', async () => {
    const id = await repo.getOrCreateCurrentUserId();
    expect(await repo.getGuestUserId()).toBe(id);
    expect(await repo.getOrCreateCurrentUserId()).toBe(id);
  });
});

describe('IdentityRepository.migrateGuestToAccount (C4 §4.1 step 1, FR-206)', () => {
  it('re-homes every synced table from the guest id to the account id', async () => {
    await seedAllTables(GUEST);

    const report = await repo.migrateGuestToAccount(GUEST, ACCOUNT);

    expect(report.guestUserId).toBe(GUEST);
    expect(report.authUserId).toBe(ACCOUNT);
    expect(report.migratedAt).toBe(new Date(FIXED_NOW).toISOString());
    expect(report.totalMigrated).toBe(11);

    for (const [table, column] of [
      ['user_profiles', 'id'],
      ['highlights', 'user_id'],
      ['study_notes', 'user_id'],
      ['ink_canvases', 'user_id'],
      ['prayer_pools', 'owner_user_id'],
      ['prayer_pool_members', 'user_id'],
      ['prayer_pool_items', 'created_by_user_id'],
      ['prayer_item_user_states', 'user_id'],
      ['prayer_session_logs', 'user_id'],
      ['reading_plan_enrollments', 'user_id'],
      ['reading_progress', 'user_id'],
    ] as const) {
      expect(await count(table, column, ACCOUNT), `${table}.${column}`).toBe(1);
      expect(await count(table, column, GUEST), `${table}.${column} (leftover)`).toBe(0);
    }
  });

  it('binds the device to the account and clears the guest id', async () => {
    await seedAllTables(GUEST);
    await repo.migrateGuestToAccount(GUEST, ACCOUNT);

    expect(await repo.getGuestUserId()).toBeNull();
    expect(await repo.getAccountUserId()).toBe(ACCOUNT);
    expect(await repo.getCurrentUserId()).toBe(ACCOUNT);

    const { rows } = await localDevice.query<{ value_json: string }>(
      'SELECT value_json FROM workspace_state WHERE key = ?',
      [ACCOUNT_USER_ID_KEY],
    );
    expect(rows[0]?.value_json).toBe(JSON.stringify(ACCOUNT));
  });

  it('resolves the writing identity to the bound account and never mints a guest id', async () => {
    await repo.migrateGuestToAccount(GUEST, ACCOUNT);

    // Regression: resolving the writing identity while signed in must return the account id.
    // `getOrCreateGuestUserId()` minted a fresh device id here instead, so every synced write
    // carried an owner `auth.uid()` did not match, RLS rejected the upload (C4 §4.3), and the
    // row was pruned at the next PowerSync checkpoint.
    expect(await repo.getOrCreateCurrentUserId()).toBe(ACCOUNT);
    expect(await repo.getGuestUserId()).toBeNull();
  });

  it('carries soft-deleted rows too, so nothing stays orphaned under the guest id', async () => {
    await userDb.execute(
      `INSERT INTO study_notes (id, user_id, start_verse_id, end_verse_id, body_payload, deleted_at)
       VALUES ('n-del', ?, 45008028, 45008028, '{}', '2026-11-20T00:00:00Z')`,
      [GUEST],
    );

    const report = await repo.migrateGuestToAccount(GUEST, ACCOUNT);

    expect(report.migratedCounts.study_notes).toBe(1);
    expect(await count('study_notes', 'user_id', ACCOUNT)).toBe(1);
    expect(await count('study_notes', 'user_id', GUEST)).toBe(0);
  });

  it('is a clean no-op when nothing belongs to the guest', async () => {
    const report = await repo.migrateGuestToAccount(GUEST, ACCOUNT);
    expect(report.totalMigrated).toBe(0);
    expect(await repo.getAccountUserId()).toBe(ACCOUNT);
  });

  it('rolls back atomically and throws AUTH_GUEST_MIGRATION_FAILED on a conflict', async () => {
    await seedAllTables(GUEST);
    // A pre-existing membership for the account in the same pool collides with UNIQUE(pool_id, user_id).
    await userDb.execute(
      `INSERT INTO prayer_pool_members (id, pool_id, user_id) VALUES ('m-account', 'p1', ?)`,
      [ACCOUNT],
    );

    const error = await repo.migrateGuestToAccount(GUEST, ACCOUNT).catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe('AUTH_GUEST_MIGRATION_FAILED');

    // Rolled back: the guest still owns their rows and the device stays in guest mode.
    expect(await count('study_notes', 'user_id', GUEST)).toBe(1);
    expect(await count('study_notes', 'user_id', ACCOUNT)).toBe(0);
    expect(await repo.getAccountUserId()).toBeNull();
  });

  it('rejects a mismatched or empty pair', async () => {
    const sameError = await repo.migrateGuestToAccount(GUEST, GUEST).catch((e: unknown) => e);
    expect(isAppError(sameError) && sameError.retryPolicy).toBe('USER_ACTION');

    const emptyError = await repo.migrateGuestToAccount('', ACCOUNT).catch((e: unknown) => e);
    expect(isAppError(emptyError) && emptyError.code).toBe('AUTH_GUEST_MIGRATION_FAILED');
  });
});
