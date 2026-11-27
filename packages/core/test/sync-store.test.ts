// C2 §4.2 / C3 §4.3 — headless sync-status store (`P2-10`).
//
// Exercises the store against a fake `SyncAdapter`: connection flags, the offline pill
// (`SYNC_OFFLINE`), the rejected-mutation dead-letter (`SYNC_MUTATION_REJECTED`), and the
// `CoreEvent` fan-out — all with zero network or provisioning.

import { describe, expect, it } from 'vitest';

import type { RejectedMutation, SyncAdapter, SyncConnectionStatus } from '../src/adapters';
import { createCoreEventEmitter } from '../src/events/emitter';
import type { CoreEvent } from '../src/events/types';
import { createSyncStore } from '../src/stores/sync-store';

const OFFLINE: SyncConnectionStatus = { connected: false, uploading: false, downloading: false };

interface FakeSyncAdapter {
  readonly adapter: SyncAdapter;
  emitStatus(status: SyncConnectionStatus): void;
  emitRejected(mutation: RejectedMutation): void;
  statusListenerCount(): number;
  rejectListenerCount(): number;
}

function fakeSyncAdapter(connectImpl?: () => Promise<void>): FakeSyncAdapter {
  let status: SyncConnectionStatus = OFFLINE;
  const statusHandlers = new Set<(status: SyncConnectionStatus) => void>();
  const rejectHandlers = new Set<(mutation: RejectedMutation) => void>();

  return {
    adapter: {
      getStatus: () => status,
      onStatusChange(handler) {
        statusHandlers.add(handler);
        return () => statusHandlers.delete(handler);
      },
      onMutationRejected(handler) {
        rejectHandlers.add(handler);
        return () => rejectHandlers.delete(handler);
      },
      connect: connectImpl ?? (async () => {}),
      async disconnect() {},
    },
    emitStatus(next) {
      status = next;
      for (const handler of [...statusHandlers]) handler(next);
    },
    emitRejected(mutation) {
      for (const handler of [...rejectHandlers]) handler(mutation);
    },
    statusListenerCount: () => statusHandlers.size,
    rejectListenerCount: () => rejectHandlers.size,
  };
}

describe('createSyncStore (FR-206)', () => {
  it('starts offline with the canonical SYNC_OFFLINE copy', () => {
    const { adapter } = fakeSyncAdapter();
    const store = createSyncStore({ adapter });

    const state = store.getState();
    expect(state.status).toBe('idle');
    expect(state.connected).toBe(false);
    expect(state.offline).toBe(true);
    expect(state.offlineError?.code).toBe('SYNC_OFFLINE');
    expect(state.rejectedMutations).toEqual([]);
  });

  it('subscribes, connects, and mirrors adapter status updates', async () => {
    const fake = fakeSyncAdapter();
    const store = createSyncStore({ adapter: fake.adapter });

    await store.getState().start();

    expect(store.getState().status).toBe('ready');
    expect(fake.statusListenerCount()).toBe(1);
    expect(fake.rejectListenerCount()).toBe(1);

    fake.emitStatus({ connected: true, uploading: true, downloading: false, lastSyncedAt: '2026-11-27T09:00:00.000Z' });

    const state = store.getState();
    expect(state.connected).toBe(true);
    expect(state.uploading).toBe(true);
    expect(state.offline).toBe(false);
    expect(state.offlineError).toBeNull();
    expect(state.lastSyncedAt).toBe('2026-11-27T09:00:00.000Z');
  });

  it('raises the offline pill again when the transport drops', async () => {
    const fake = fakeSyncAdapter();
    const store = createSyncStore({ adapter: fake.adapter });
    await store.getState().start();

    fake.emitStatus({ connected: true, uploading: false, downloading: false });
    expect(store.getState().offline).toBe(false);

    fake.emitStatus({ connected: false, uploading: false, downloading: false });
    expect(store.getState().offline).toBe(true);
    expect(store.getState().offlineError?.code).toBe('SYNC_OFFLINE');
  });

  it('dead-letters rejected mutations newest-first and caps the list', async () => {
    const fake = fakeSyncAdapter();
    const store = createSyncStore({ adapter: fake.adapter, maxRejected: 2 });
    await store.getState().start();

    fake.emitRejected({ table: 'prayer_pool_items', rowId: 'a', errorCode: 'SYNC_MUTATION_REJECTED' });
    fake.emitRejected({ table: 'prayer_pools', rowId: 'b', errorCode: 'SYNC_MUTATION_REJECTED' });
    fake.emitRejected({ table: 'study_notes', rowId: 'c', errorCode: 'SYNC_MUTATION_REJECTED' });

    expect(store.getState().rejectedMutations.map((m) => m.rowId)).toEqual(['c', 'b']);
  });

  it('acknowledges one rejection and clears the rest', async () => {
    const fake = fakeSyncAdapter();
    const store = createSyncStore({ adapter: fake.adapter });
    await store.getState().start();

    fake.emitRejected({ table: 'prayer_pools', rowId: 'b', errorCode: 'SYNC_MUTATION_REJECTED' });
    fake.emitRejected({ table: 'study_notes', rowId: 'c', errorCode: 'SYNC_MUTATION_REJECTED' });

    store.getState().dismissRejected('prayer_pools', 'b');
    expect(store.getState().rejectedMutations.map((m) => m.rowId)).toEqual(['c']);

    store.getState().clearRejected();
    expect(store.getState().rejectedMutations).toEqual([]);
  });

  it('unsubscribes and returns to the offline state on stop', async () => {
    const fake = fakeSyncAdapter();
    const store = createSyncStore({ adapter: fake.adapter });
    await store.getState().start();
    fake.emitStatus({ connected: true, uploading: false, downloading: false });

    await store.getState().stop();

    expect(fake.statusListenerCount()).toBe(0);
    expect(fake.rejectListenerCount()).toBe(0);
    expect(store.getState().status).toBe('idle');
    expect(store.getState().offline).toBe(true);
  });

  it('does not double-subscribe when start is called twice', async () => {
    const fake = fakeSyncAdapter();
    const store = createSyncStore({ adapter: fake.adapter });

    await store.getState().start();
    await store.getState().start();

    expect(fake.statusListenerCount()).toBe(1);
    expect(fake.rejectListenerCount()).toBe(1);
  });

  it('records a canonical SYNC_OFFLINE AppError when connect fails', async () => {
    const fake = fakeSyncAdapter(async () => {
      throw new Error('network down');
    });
    const store = createSyncStore({ adapter: fake.adapter });

    await store.getState().start();

    const state = store.getState();
    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('SYNC_OFFLINE');
    expect(state.error?.domain).toBe('SYNC');
    expect(state.offline).toBe(true);
  });

  it('fans out SYNC_STATUS_CHANGED and SYNC_MUTATION_REJECTED through the emitter', async () => {
    const fake = fakeSyncAdapter();
    const emitter = createCoreEventEmitter();
    const store = createSyncStore({ adapter: fake.adapter, emitter });
    const seen: CoreEvent[] = [];
    emitter.onAny((event) => seen.push(event));

    await store.getState().start();
    fake.emitStatus({ connected: true, uploading: false, downloading: false });
    fake.emitRejected({ table: 'prayer_pools', rowId: 'b', errorCode: 'SYNC_MUTATION_REJECTED' });

    expect(seen.map((event) => event.type)).toEqual([
      'SYNC_STATUS_CHANGED',
      'SYNC_STATUS_CHANGED',
      'SYNC_MUTATION_REJECTED',
    ]);
    expect(seen[2]).toEqual({
      type: 'SYNC_MUTATION_REJECTED',
      table: 'prayer_pools',
      rowId: 'b',
      errorCode: 'SYNC_MUTATION_REJECTED',
    });
  });
});
