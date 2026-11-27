// C2 §4.3 — `CoreEvent` union + typed emitter (`P2-09`).
//
// The emitter is the fan-out seam the Phase-2 sync/vault/pack subsystems publish
// state changes through. It is pure, synchronous and transport-free, so every
// assertion here runs with no I/O and no clock.

import { describe, expect, it } from 'vitest';

import { createCoreEventEmitter } from '../src/events/emitter';
import type { CoreEvent, CoreEventOf } from '../src/events/types';

describe('CoreEventEmitter (C2 §4.3)', () => {
  it('delivers an event only to listeners of that type, with a narrowed payload', () => {
    const bus = createCoreEventEmitter();
    const locked: CoreEventOf<'VAULT_LOCKED'>[] = [];
    const packs: CoreEvent[] = [];

    bus.on('VAULT_LOCKED', (event) => locked.push(event));
    bus.on('PACK_INSTALLED', (event) => packs.push(event));

    bus.emit({ type: 'VAULT_LOCKED', reason: 'TIMEOUT' });

    expect(locked).toEqual([{ type: 'VAULT_LOCKED', reason: 'TIMEOUT' }]);
    expect(packs).toEqual([]);
  });

  it('delivers every event, in order, to onAny listeners', () => {
    const bus = createCoreEventEmitter();
    const seen: string[] = [];
    bus.onAny((event) => seen.push(event.type));

    bus.emit({ type: 'PACK_INSTALLED', packId: 'core_bsb', contentVersion: '1.0.0' });
    bus.emit({ type: 'AUDIO_VERSE_CHANGED', canonicalVerseId: 45008028, editionId: 'bsb_audio' });

    expect(seen).toEqual(['PACK_INSTALLED', 'AUDIO_VERSE_CHANGED']);
  });

  it('calls all listeners of a type in registration order', () => {
    const bus = createCoreEventEmitter();
    const order: number[] = [];
    bus.on('VAULT_UNLOCKED', () => order.push(1));
    bus.on('VAULT_UNLOCKED', () => order.push(2));

    bus.emit({ type: 'VAULT_UNLOCKED', indexedNoteCount: 12 });

    expect(order).toEqual([1, 2]);
  });

  it('stops delivery after the returned unsubscribe function runs', () => {
    const bus = createCoreEventEmitter();
    const specific: CoreEvent[] = [];
    const any: CoreEvent[] = [];

    const offSpecific = bus.on('PACK_INSTALL_FAILED', (event) => specific.push(event));
    const offAny = bus.onAny((event) => any.push(event));

    bus.emit({ type: 'PACK_INSTALL_FAILED', packId: 'core_bsb', errorCode: 'DB_OPERATION_FAILED' });
    offSpecific();
    offAny();
    bus.emit({ type: 'PACK_INSTALL_FAILED', packId: 'core_bsb', errorCode: 'DB_OPERATION_FAILED' });

    expect(specific).toHaveLength(1);
    expect(any).toHaveLength(1);
  });

  it('removes every listener via offAll', () => {
    const bus = createCoreEventEmitter();
    let count = 0;
    bus.on('POOL_SHARED_JOINED', () => (count += 1));
    bus.onAny(() => (count += 1));

    bus.offAll();
    bus.emit({ type: 'POOL_SHARED_JOINED', poolId: 'p1', title: 'Morning Watch' });

    expect(count).toBe(0);
  });

  it('keeps the current dispatch intact when a listener unsubscribes mid-emit', () => {
    const bus = createCoreEventEmitter();
    const order: string[] = [];
    const offSecond = bus.on('SYNC_MUTATION_REJECTED', () => {
      order.push('first');
      offSecond();
    });
    bus.on('SYNC_MUTATION_REJECTED', () => order.push('second'));

    bus.emit({ type: 'SYNC_MUTATION_REJECTED', table: 'prayer_pool_items', rowId: 'r1', errorCode: 'SYNC_MUTATION_REJECTED' });

    expect(order).toEqual(['first', 'second']);
  });

  it('passes through optional fields like lastSyncedAt', () => {
    const bus = createCoreEventEmitter();
    let captured: CoreEventOf<'SYNC_STATUS_CHANGED'> | undefined;
    bus.on('SYNC_STATUS_CHANGED', (event) => (captured = event));

    bus.emit({ type: 'SYNC_STATUS_CHANGED', connected: true, uploading: false, downloading: true });
    expect(captured?.lastSyncedAt).toBeUndefined();

    bus.emit({
      type: 'SYNC_STATUS_CHANGED',
      connected: true,
      uploading: false,
      downloading: false,
      lastSyncedAt: '2026-11-27T10:00:00.000Z',
    });
    expect(captured?.lastSyncedAt).toBe('2026-11-27T10:00:00.000Z');
  });
});
