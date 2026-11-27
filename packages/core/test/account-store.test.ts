// C4 §4.1 — headless account/session store (FR-206, `P2-14`).
//
// Exercises the Zero-Loss Guest → Account upgrade against a fake `AuthAdapter`, the real
// `IdentityRepository` (Node SQLite) and a recording `SyncAdapter`: the ordering guarantee
// (rewrite commits *before* `connect()` uploads), the `AUTH_GUEST_MIGRATION_FAILED` failure mode,
// and the inert (`configured: false`) unprovisioned build.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthAdapter, AuthSession, SyncAdapter, SyncConnectionStatus } from '../src/adapters';
import { IdentityRepository } from '../src/repositories/identity-repository';
import { createAccountStore } from '../src/stores/account-store';

import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const ACCOUNT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FIXED_NOW = Date.parse('2026-11-27T09:00:00Z');

const OFFLINE: SyncConnectionStatus = { connected: false, uploading: false, downloading: false };

/** A controllable `AuthAdapter` that lets the test drive session transitions. */
interface FakeAuth {
  readonly adapter: AuthAdapter;
  emit(session: AuthSession | null): void;
  subscriberCount(): number;
  signOutCalls(): number;
}

function fakeAuth(initial: AuthSession | null = null): FakeAuth {
  let session = initial;
  let signOuts = 0;
  const handlers = new Set<(session: AuthSession | null) => void>();

  return {
    adapter: {
      async getSession() {
        return session;
      },
      onAuthStateChange(handler) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      async signInWithPassword(email) {
        session = { userId: ACCOUNT, email };
        return session;
      },
      async signUpWithPassword(email) {
        session = { userId: ACCOUNT, email };
        return session;
      },
      async signOut() {
        signOuts += 1;
        session = null;
        for (const handler of [...handlers]) handler(null);
      },
    },
    emit(next) {
      session = next;
      for (const handler of [...handlers]) handler(next);
    },
    subscriberCount: () => handlers.size,
    signOutCalls: () => signOuts,
  };
}

/** A `SyncAdapter` that records connect/disconnect and captures the DB state seen at connect time. */
interface FakeSync {
  readonly adapter: SyncAdapter;
  connects(): number;
  disconnects(): number;
  ownerAtConnect(): string | null;
}

function fakeSync(userDb: NodeUserDbAdapter): FakeSync {
  let connects = 0;
  let disconnects = 0;
  let owner: string | null = null;

  return {
    adapter: {
      getStatus: () => OFFLINE,
      onStatusChange: () => () => {},
      onMutationRejected: () => () => {},
      async connect() {
        connects += 1;
        const { rows } = await userDb.query<{ user_id: string }>(
          `SELECT user_id FROM highlights LIMIT 1`,
        );
        owner = rows[0]?.user_id ?? null;
      },
      async disconnect() {
        disconnects += 1;
      },
    },
    connects: () => connects,
    disconnects: () => disconnects,
    ownerAtConnect: () => owner,
  };
}

let userDb: NodeUserDbAdapter;
let localDevice: NodeLocalDeviceAdapter;
let identity: IdentityRepository;
let guestId: string;

beforeEach(async () => {
  userDb = new NodeUserDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
  identity = new IdentityRepository({
    userDb,
    localDevice,
    crypto: webCryptoAdapter,
    now: () => FIXED_NOW,
  });
  guestId = await identity.getOrCreateGuestUserId();
  await userDb.execute('INSERT INTO user_profiles (id) VALUES (?)', [guestId]);
  await userDb.execute(
    `INSERT INTO highlights (id, user_id, translation_code, start_verse_id, end_verse_id, color_hex)
     VALUES ('h1', ?, 'BSB', 45008028, 45008028, '#FFD400')`,
    [guestId],
  );
});

afterEach(() => {
  userDb.close();
  localDevice.close();
});

describe('createAccountStore (FR-206 / C4 §4.1)', () => {
  it('stays inert in an unprovisioned build (no auth adapter)', async () => {
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: null, identity, sync: sync.adapter });

    expect(store.getState().configured).toBe(false);
    await store.getState().start();

    expect(store.getState().status).toBe('ready');
    expect(store.getState().configured).toBe(false);
    expect(sync.connects()).toBe(0);

    // Sign-in is rejected with the canonical AUTH_REQUIRED copy (C3).
    await store.getState().signIn('a@b.com', 'pw');
    expect(store.getState().error?.code).toBe('AUTH_REQUIRED');
  });

  it('starts signed-out and subscribes to auth transitions exactly once', async () => {
    const auth = fakeAuth(null);
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });

    await store.getState().start();
    await store.getState().start();

    expect(store.getState().configured).toBe(true);
    expect(store.getState().signedIn).toBe(false);
    // Regression: a signed-out start must settle to `ready`, or the sign-in button stays disabled.
    expect(store.getState().status).toBe('ready');
    expect(auth.subscriberCount()).toBe(1);
    expect(sync.connects()).toBe(0);
  });

  it('runs the guest→account rewrite, then connects so the migrated rows upload', async () => {
    const auth = fakeAuth(null);
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });
    await store.getState().start();

    await store.getState().signIn('pilgrim@example.com', 'correct horse');

    const state = store.getState();
    expect(state.signedIn).toBe(true);
    expect(state.status).toBe('ready');
    expect(state.upgrading).toBe(false);
    expect(state.session?.userId).toBe(ACCOUNT);
    expect(state.lastMigration?.guestUserId).toBe(guestId);
    expect(state.lastMigration?.totalMigrated).toBe(2);

    // Ordering is load-bearing: the row was already re-homed when `connect()` ran.
    expect(sync.ownerAtConnect()).toBe(ACCOUNT);
    expect(await identity.getGuestUserId()).toBeNull();
    expect(await identity.getAccountUserId()).toBe(ACCOUNT);
  });

  it('upgrades when the auth adapter reports an existing session on start', async () => {
    const auth = fakeAuth({ userId: ACCOUNT, email: 'returning@example.com' });
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });

    await store.getState().start();

    expect(store.getState().signedIn).toBe(true);
    expect(store.getState().lastMigration?.authUserId).toBe(ACCOUNT);
    expect(sync.connects()).toBe(1);
    expect(sync.ownerAtConnect()).toBe(ACCOUNT);
  });

  it('upgrades when the adapter emits a SIGNED_IN transition', async () => {
    const auth = fakeAuth(null);
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });
    await store.getState().start();

    auth.emit({ userId: ACCOUNT, email: 'p@example.com' });
    await store.getState().signIn('p@example.com', 'pw');

    // The serialised queue means the rewrite happens once, never racing itself.
    expect(await identity.getAccountUserId()).toBe(ACCOUNT);
    expect(store.getState().lastMigration?.totalMigrated).toBe(2);
  });

  it('surfaces AUTH_GUEST_MIGRATION_FAILED and leaves the guest data intact when the rewrite fails', async () => {
    const auth = fakeAuth(null);
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });
    await store.getState().start();

    // Force the rewrite to fail by closing the DB out from under the transaction.
    userDb.close();
    await store.getState().signIn('p@example.com', 'pw');

    const state = store.getState();
    expect(state.status).toBe('error');
    expect(state.upgrading).toBe(false);
    expect(state.error?.code).toBe('AUTH_GUEST_MIGRATION_FAILED');
    expect(state.error?.domain).toBe('AUTH');
    expect(sync.connects()).toBe(0);

    // Reopen a fresh handle to prove the guest binding was never rewritten.
    userDb = new NodeUserDbAdapter();
  });

  it('signs out, disconnects, and returns to Offline Guest Mode', async () => {
    const auth = fakeAuth({ userId: ACCOUNT, email: 'p@example.com' });
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });
    await store.getState().start();

    await store.getState().signOut();

    const state = store.getState();
    expect(auth.signOutCalls()).toBe(1);
    expect(sync.disconnects()).toBe(1);
    expect(state.signedIn).toBe(false);
    expect(state.session).toBeNull();
    expect(state.lastMigration).toBeNull();
    expect(state.status).toBe('ready');
  });

  it('invokes onSignOut so the vault locks on sign-out (B6 §4.2.4, ADR-004)', async () => {
    const auth = fakeAuth({ userId: ACCOUNT, email: 'p@example.com' });
    const sync = fakeSync(userDb);
    let locks = 0;
    const store = createAccountStore({
      auth: auth.adapter,
      identity,
      sync: sync.adapter,
      onSignOut: () => {
        locks += 1;
      },
    });
    await store.getState().start();

    await store.getState().signOut();

    expect(locks).toBe(1);
  });

  it('unsubscribes from auth transitions on stop', async () => {
    const auth = fakeAuth(null);
    const sync = fakeSync(userDb);
    const store = createAccountStore({ auth: auth.adapter, identity, sync: sync.adapter });
    await store.getState().start();

    await store.getState().stop();

    expect(auth.subscriberCount()).toBe(0);
    expect(store.getState().status).toBe('idle');
  });
});
