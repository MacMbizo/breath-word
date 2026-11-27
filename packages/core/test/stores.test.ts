// B3 §4.1 `stores/` / §4.2 rule 2 — headless Zustand stores.
//
// The stores are the state seam UI screens subscribe to; they wrap the repositories,
// never throw (failures land in `error` as a canonical `AppError`, AGENTS.md rule 7),
// and mirror FR-105 download progress for the Library/Storage screens.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type {
  AudioEngineAdapter,
  CoreAdapters,
  PoolShareAdapter,
  SecureStorageAdapter,
  UserDbAdapter,
} from '../src/adapters';
import type { ManifestPackEntry } from '../src/content/pack-manifest';
import { PrayerPoolRepository } from '../src/repositories/prayer-pool-repository';
import { initCoreRuntime, type CoreRuntime } from '../src/runtime/core-runtime';
import { createPrayerStore } from '../src/stores/prayer-store';
import type { PackProgress } from '../src/stores/pack-store';

import { writeFixturePack, type FixturePackSpec } from './helpers/fixture-pack';
import { NodeContentDbAdapter } from './helpers/node-content-db';
import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodePackInstallerAdapter } from './helpers/node-pack-installer';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const PSALM_23_1 = 19_023_001;

const READER_PACK: FixturePackSpec = {
  packId: 'core_bsb',
  translationCode: 'BSB',
  translationName: 'Berean Standard Bible',
  books: [
    { number: 19, osis: 'Ps', name: 'Psalms', testament: 'OT', chapterCount: 150, genre: 'POETRY_WISDOM' },
  ],
  verses: [
    {
      book: 19,
      chapter: 23,
      verse: 1,
      plainText: 'The LORD is my shepherd; I shall not want.',
      spans: [{ type: 'text', text: 'The LORD is my shepherd; I shall not want.' }],
    },
    {
      book: 19,
      chapter: 23,
      verse: 2,
      plainText: 'He leads me beside quiet waters.',
      spans: [{ type: 'text', text: 'He leads me beside quiet waters.' }],
    },
  ],
};

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-stores-'));
const readerPackPath = join(tmpRoot, 'core_bsb.sqlite');
const r2Dir = join(tmpRoot, 'r2');

const secureStorage: SecureStorageAdapter = {
  supportsBiometric: false,
  async getItem() {
    return null;
  },
  async setItem() {},
  async deleteItem() {},
};

/** In-memory hardware-backed keystore double for the biometric fast-unlock tests (B6 §4.2.2). */
function makeBiometricStorage(): SecureStorageAdapter {
  const items = new Map<string, string>();
  return {
    supportsBiometric: true,
    async getItem(key) {
      return items.get(key) ?? null;
    },
    async setItem(key, value) {
      items.set(key, value);
    },
    async deleteItem(key) {
      items.delete(key);
    },
  };
}

const audio: AudioEngineAdapter = {
  async loadChapter() {},
  async play() {},
  async pause() {},
  async seekTo() {},
  async setPlaybackRate() {},
  async setAmbientTrack() {},
  async setNarrationVolume() {},
  async setSleepTimer() {},
  onPositionUpdate() {
    return () => {};
  },
};

interface PublishedPack {
  readonly entry: ManifestPackEntry;
  readonly gzPath: string;
}

/** Publish a fixture pack as a gzipped artifact with a signed manifest entry. */
async function publishPack(spec: FixturePackSpec): Promise<PublishedPack> {
  mkdirSync(r2Dir, { recursive: true });
  const contentVersion = spec.contentVersion ?? '1.0.0';
  const sqlitePath = join(r2Dir, `${spec.packId}-${contentVersion}.sqlite`);
  writeFixturePack(sqlitePath, spec);

  const uncompressed = readFileSync(sqlitePath);
  const compressed = gzipSync(uncompressed);
  const gzPath = `${sqlitePath}.gz`;
  writeFileSync(gzPath, compressed);

  return {
    gzPath,
    entry: {
      packId: spec.packId,
      packType: 'TRANSLATION',
      contentVersion,
      schemaVersion: 1,
      minAppVersion: '0.1.0',
      // The test installer fetches from a local path instead of the CDN.
      downloadUrl: gzPath,
      compressedBytes: compressed.byteLength,
      uncompressedBytes: uncompressed.byteLength,
      sha256Compressed: await webCryptoAdapter.sha256Hex(new Uint8Array(compressed)),
      sha256Uncompressed: await webCryptoAdapter.sha256Hex(new Uint8Array(uncompressed)),
      licenseSpdx: 'CC0-1.0',
    },
  };
}

let publishedPack: PublishedPack;

beforeAll(async () => {
  writeFixturePack(readerPackPath, READER_PACK);
  publishedPack = await publishPack(READER_PACK);
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let contentDb: NodeContentDbAdapter;
let userDb: NodeUserDbAdapter;
let localDevice: NodeLocalDeviceAdapter;
let installer: NodePackInstallerAdapter;
let packsDir: string;

function makeAdapters(secure: SecureStorageAdapter = secureStorage): CoreAdapters {
  contentDb = new NodeContentDbAdapter();
  userDb = new NodeUserDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
  packsDir = mkdtempSync(join(tmpRoot, 'packs-'));
  installer = new NodePackInstallerAdapter({ rootDir: packsDir });
  return {
    contentDb,
    userDb,
    localDevice,
    packInstaller: installer,
    crypto: webCryptoAdapter,
    secureStorage: secure,
    audio,
  };
}

/** A runtime whose content DB already serves the fixture pack (FR-101..103). */
async function buildReaderRuntime(): Promise<CoreRuntime> {
  const adapters = makeAdapters();
  await adapters.contentDb.attachPack('core_bsb', readerPackPath);
  return initCoreRuntime({ adapters });
}

afterEach(() => {
  contentDb.close();
  userDb.close();
  localDevice.close();
  rmSync(packsDir, { recursive: true, force: true });
});

describe('createReaderStore (FR-101..103)', () => {
  it('loads a chapter and exposes it as ready state', async () => {
    const { stores } = await buildReaderRuntime();
    expect(stores.reader.getState().status).toBe('idle');

    await stores.reader.getState().openChapter({
      packId: 'core_bsb',
      translationCode: 'BSB',
      bookNumber: 19,
      chapter: 23,
    });

    const state = stores.reader.getState();
    expect(state.status).toBe('ready');
    expect(state.error).toBeNull();
    expect(state.location).toEqual({
      packId: 'core_bsb',
      translationCode: 'BSB',
      bookNumber: 19,
      chapter: 23,
    });
    expect(state.chapter?.verses.map((verse) => verse.canonicalVerseId)).toEqual([PSALM_23_1, 19_023_002]);
  });

  it('lists the translation’s navigable books for canon-wide navigation (FR-101)', async () => {
    const { stores } = await buildReaderRuntime();

    const books = await stores.reader.getState().loadBooks('core_bsb', 'BSB');

    expect(books).toEqual([
      { bookNumber: 19, name: 'Psalms', testament: 'OT', chapterCount: 150 },
    ]);
    expect(stores.reader.getState().booksStatus).toBe('ready');
  });

  it('surfaces a canonical AppError instead of throwing when the pack is missing', async () => {
    const { stores } = await buildReaderRuntime();

    await stores.reader.getState().openChapter({
      packId: 'trans_kjv',
      translationCode: 'KJV',
      bookNumber: 19,
      chapter: 23,
    });

    const state = stores.reader.getState();
    expect(state.status).toBe('error');
    expect(state.chapter).toBeNull();
    expect(state.error?.code).toBe('DB_CONTENT_PACK_NOT_ATTACHED');
    expect(state.error?.domain).toBe('DB');
  });

  it('compares a chapter across translations and reports a failed compare', async () => {
    const { stores } = await buildReaderRuntime();

    const rows = await stores.reader
      .getState()
      .compareChapters([{ packId: 'core_bsb', translationCode: 'BSB' }], 19, 23);
    expect(rows.map((row) => row.canonicalVerseId)).toEqual([PSALM_23_1, 19_023_002]);
    expect(stores.reader.getState().comparisonStatus).toBe('ready');

    const empty = await stores.reader
      .getState()
      .compareChapters([{ packId: 'trans_kjv', translationCode: 'KJV' }], 19, 23);
    expect(empty).toEqual([]);
    expect(stores.reader.getState().comparisonStatus).toBe('error');
  });

  it('runs a search, keeps the query, and clears it', async () => {
    const { stores } = await buildReaderRuntime();

    const hits = await stores.reader.getState().search({ packId: 'core_bsb', text: 'shepherd' });
    expect(hits[0]?.canonicalVerseId).toBe(PSALM_23_1);
    expect(stores.reader.getState().searchQuery).toBe('shepherd');
    expect(stores.reader.getState().searchStatus).toBe('ready');

    stores.reader.getState().clearSearch();
    const cleared = stores.reader.getState();
    expect(cleared.searchQuery).toBe('');
    expect(cleared.searchResults).toEqual([]);
    expect(cleared.searchStatus).toBe('idle');
  });

  it('records a canonical AppError on a failed search', async () => {
    const { stores } = await buildReaderRuntime();

    const hits = await stores.reader.getState().search({ packId: 'trans_kjv', text: 'grace' });
    expect(hits).toEqual([]);
    expect(stores.reader.getState().searchStatus).toBe('error');
    expect(stores.reader.getState().searchError?.code).toBe('DB_CONTENT_PACK_NOT_ATTACHED');
  });
});

describe('createPackStore (FR-105)', () => {
  it('refreshes an empty device to a ready state', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });

    await stores.packs.getState().refresh();

    const state = stores.packs.getState();
    expect(state.status).toBe('ready');
    expect(state.installed).toEqual([]);
    expect(state.storageBytes).toBe(0);
  });

  it('installs a pack, mirrors download progress, and updates storage totals', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });

    const progress: PackProgress[] = [];
    const unsubscribe = stores.packs.subscribe((state) => {
      if (state.progress !== null) {
        progress.push(state.progress);
      }
    });

    const installed = await stores.packs.getState().install(publishedPack.entry);
    unsubscribe();

    expect(installed?.packId).toBe('core_bsb');
    expect([...new Set(progress.map((p) => p.phase))]).toEqual([
      'downloading',
      'verifying',
      'extracting',
      'attaching',
    ]);
    expect(progress.every((p) => p.packId === 'core_bsb')).toBe(true);

    const state = stores.packs.getState();
    expect(state.status).toBe('ready');
    expect(state.progress).toBeNull();
    expect(state.installed.map((pack) => pack.packId)).toEqual(['core_bsb']);
    expect(state.storageBytes).toBe(installed?.fileSizeBytes);
  });

  it('surfaces a canonical AppError and keeps the device unchanged on failure', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });

    const tampered = { ...publishedPack.entry, sha256Compressed: '0'.repeat(64) };
    const result = await stores.packs.getState().install(tampered);

    expect(result).toBeNull();
    const state = stores.packs.getState();
    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('PACK_CHECKSUM_MISMATCH');
    expect(state.progress).toBeNull();
    expect(state.installed).toEqual([]);
  });

  it('removes an installed pack and resets storage totals', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });

    await stores.packs.getState().install(publishedPack.entry);
    await stores.packs.getState().remove('core_bsb');

    const state = stores.packs.getState();
    expect(state.status).toBe('ready');
    expect(state.installed).toEqual([]);
    expect(state.storageBytes).toBe(0);
  });

  it('re-attaches installed packs after a cold start', async () => {
    const adapters = makeAdapters();
    const runtime = initCoreRuntime({ adapters });
    await runtime.stores.packs.getState().install(publishedPack.entry);

    // Simulate a relaunch: a fresh content connection sharing the same local-device DB.
    const restartedContentDb = new NodeContentDbAdapter();
    try {
      const restarted = initCoreRuntime({
        adapters: { ...adapters, contentDb: restartedContentDb },
      });
      expect(await restartedContentDb.getAttachedPacks()).not.toContain('core_bsb');
      expect(await restarted.stores.packs.getState().restoreAttached()).toEqual(['core_bsb']);
    } finally {
      restartedContentDb.close();
    }
  });
});

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** A `UserDbAdapter` whose every call throws, to exercise the store error seam. */
function throwingUserDb(): UserDbAdapter {
  const boom = (): never => {
    throw new Error('sqlite unavailable');
  };
  return {
    async execute() {
      boom();
    },
    async query<T>(): Promise<{ rows: T[] }> {
      return boom();
    },
    async writeTransaction<T>(): Promise<T> {
      return boom();
    },
    watch() {
      return () => {};
    },
  };
}

describe('createPrayerStore (FR-201..203)', () => {
  it('loads an empty pool list to a ready state', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    expect(stores.prayer.getState().poolsStatus).toBe('idle');

    await stores.prayer.getState().loadPools(USER_ID);

    const state = stores.prayer.getState();
    expect(state.poolsStatus).toBe('ready');
    expect(state.pools).toEqual([]);
    expect(state.poolsError).toBeNull();
  });

  it('creates a pool, captures a passage and drives the per-user prayer state', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    const prayer = () => stores.prayer.getState();

    const created = await prayer().createPool({
      ownerUserId: USER_ID,
      title: 'Morning Watch',
      category: 'GUIDANCE',
    });
    expect(created).not.toBeNull();
    expect(created?.userRole).toBe('OWNER');
    expect(prayer().pools.map((pool) => pool.title)).toEqual(['Morning Watch']);

    await prayer().openPool(USER_ID, created!.id);
    const item = await prayer().capture(USER_ID, {
      poolId: created!.id,
      createdByUserId: USER_ID,
      startVerseId: PSALM_23_1,
      endVerseId: PSALM_23_1,
      translationCode: 'BSB',
      capturedText: 'The LORD is my shepherd.',
    });
    expect(item?.passageReference).toContain('23:1');
    expect(prayer().items).toHaveLength(1);

    await prayer().setNote(USER_ID, item!.itemId, created!.id, 'my private note');
    expect(prayer().items[0]?.userNotes).toBe('my private note');

    await prayer().recordPray(USER_ID, item!.itemId, created!.id);
    await prayer().recordPray(USER_ID, item!.itemId, created!.id);
    expect(prayer().items[0]?.prayCount).toBe(2);

    await prayer().markAnswered(USER_ID, item!.itemId, created!.id, 'He answered');
    expect(prayer().items[0]?.answeredAt).toBeTruthy();
    expect(prayer().items[0]?.testimony).toBe('He answered');

    const queue = await prayer().loadRotationQueue(USER_ID, created!.id);
    expect(queue).toHaveLength(1);
    expect(prayer().rotationStatus).toBe('ready');
  });

  it('soft-deletes a pool and drops it from state', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    const created = await stores.prayer
      .getState()
      .createPool({ ownerUserId: USER_ID, title: 'Temporary', category: 'CUSTOM' });

    await stores.prayer.getState().deletePool(created!.id);

    expect(stores.prayer.getState().pools).toEqual([]);
  });

  it('surfaces a canonical AppError instead of throwing when the DB fails', async () => {
    makeAdapters(); // keep the shared teardown DB handles valid
    const store = createPrayerStore(
      new PrayerPoolRepository({ userDb: throwingUserDb(), crypto: webCryptoAdapter }),
    );

    await store.getState().loadPools(USER_ID);

    const state = store.getState();
    expect(state.poolsStatus).toBe('error');
    expect(state.pools).toEqual([]);
    expect(state.poolsError?.code).toBe('DB_OPERATION_FAILED');
  });
});

describe('createPrayerStore.joinPool (FR-202 / C4 §4.3)', () => {
  function storeWith(poolShare: PoolShareAdapter | null) {
    const adapters = makeAdapters(); // keep the shared teardown DB handles valid
    return createPrayerStore(
      new PrayerPoolRepository({ userDb: adapters.userDb, crypto: webCryptoAdapter }),
      poolShare,
    );
  }

  it('reports the join surface as unavailable when no transport is injected', async () => {
    const store = storeWith(null);

    expect(store.getState().joinAvailable).toBe(false);
    const joined = await store.getState().joinPool(USER_ID, 'K9P4M2X7');

    expect(joined).toBeNull();
    expect(store.getState().joinStatus).toBe('error');
    expect(store.getState().joinError?.code).toBe('AUTH_REQUIRED');
  });

  it('joins a shared pool by code and refreshes the list', async () => {
    const seen: string[] = [];
    const store = storeWith({
      async joinSharedPoolByCode(code) {
        seen.push(code);
        return { poolId: 'pool-1', title: 'Evening Watch', role: 'MEMBER' };
      },
      async rotatePoolShareCode() {
        return 'K9P4M2X7';
      },
    });

    expect(store.getState().joinAvailable).toBe(true);
    const joined = await store.getState().joinPool(USER_ID, '  k9p4m2x7  ');

    expect(seen).toEqual(['k9p4m2x7']); // trimmed before the RPC
    expect(joined).toEqual({ poolId: 'pool-1', title: 'Evening Watch', role: 'MEMBER' });
    expect(store.getState().joinStatus).toBe('ready');
    expect(store.getState().joinError).toBeNull();
  });

  it('maps an invalid code to POOL_SHARE_CODE_INVALID', async () => {
    const store = storeWith({
      async joinSharedPoolByCode() {
        throw new Error('POOL_SHARE_CODE_INVALID');
      },
      async rotatePoolShareCode() {
        return 'K9P4M2X7';
      },
    });

    await store.getState().joinPool(USER_ID, 'BADCODE1');

    expect(store.getState().joinStatus).toBe('error');
    expect(store.getState().joinError?.code).toBe('POOL_SHARE_CODE_INVALID');
    expect(store.getState().joinError?.domain).toBe('POOL');
  });

  it('maps the brute-force guard to POOL_JOIN_RATE_LIMITED', async () => {
    const store = storeWith({
      async joinSharedPoolByCode() {
        throw new Error('POOL_JOIN_RATE_LIMITED');
      },
      async rotatePoolShareCode() {
        return 'K9P4M2X7';
      },
    });

    await store.getState().joinPool(USER_ID, 'K9P4M2X7');

    expect(store.getState().joinError?.code).toBe('POOL_JOIN_RATE_LIMITED');
    expect(store.getState().joinError?.retryPolicy).toBe('USER_ACTION');
  });
});

describe('createPrayerStore.rotateShareCode (FR-202 / C4 §4.4)', () => {
  function storeWith(poolShare: PoolShareAdapter | null) {
    const adapters = makeAdapters(); // keep the shared teardown DB handles valid
    return createPrayerStore(
      new PrayerPoolRepository({ userDb: adapters.userDb, crypto: webCryptoAdapter }),
      poolShare,
    );
  }

  it('reports an error when no transport is injected', async () => {
    const store = storeWith(null);

    const code = await store.getState().rotateShareCode(USER_ID, 'pool-1');

    expect(code).toBeNull();
    expect(store.getState().shareCodeStatus).toBe('error');
    expect(store.getState().shareCodeError?.code).toBe('AUTH_REQUIRED');
  });

  it('mints a share code and returns it to the caller', async () => {
    const seen: string[] = [];
    const store = storeWith({
      async joinSharedPoolByCode() {
        return { poolId: 'pool-1', title: 'Evening Watch', role: 'MEMBER' };
      },
      async rotatePoolShareCode(poolId) {
        seen.push(poolId);
        return 'K9P4M2X7';
      },
    });

    const code = await store.getState().rotateShareCode(USER_ID, 'pool-1');

    expect(seen).toEqual(['pool-1']);
    expect(code).toBe('K9P4M2X7');
    expect(store.getState().shareCodeStatus).toBe('ready');
    expect(store.getState().shareCodeError).toBeNull();
  });

  it('maps POOL_PERMISSION_DENIED when the caller is not the owner', async () => {
    const store = storeWith({
      async joinSharedPoolByCode() {
        return { poolId: 'pool-1', title: 'Evening Watch', role: 'MEMBER' };
      },
      async rotatePoolShareCode() {
        throw new Error('POOL_PERMISSION_DENIED');
      },
    });

    const code = await store.getState().rotateShareCode(USER_ID, 'pool-1');

    expect(code).toBeNull();
    expect(store.getState().shareCodeStatus).toBe('error');
    expect(store.getState().shareCodeError?.code).toBe('POOL_PERMISSION_DENIED');
    expect(store.getState().shareCodeError?.domain).toBe('POOL');
    expect(store.getState().shareCodeError?.retryPolicy).toBe('NONE');
  });
});

describe('createVaultStore (FR-206)', () => {
  it('loads a disabled vault without unlocking', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    expect(stores.vault.getState().status).toBe('idle');

    await stores.vault.getState().load(USER_ID);

    const state = stores.vault.getState();
    expect(state.status).toBe('ready');
    expect(state.enabled).toBe(false);
    expect(state.unlocked).toBe(false);
  });

  it('initializes the vault and exposes only the Recovery Key — never the DEK', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });

    const display = await stores.vault.getState().init(USER_ID, 'a-strong-passphrase');

    const state = stores.vault.getState();
    expect(display).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){12}$/);
    expect(state.recoveryKeyDisplay).toBe(display);
    expect(state.enabled).toBe(true);
    expect(state.unlocked).toBe(true);
    expect(Object.keys(state)).not.toContain('dek');
  });

  it('locks and re-unlocks with the passphrase', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    await stores.vault.getState().init(USER_ID, 'a-strong-passphrase');

    stores.vault.getState().lock();
    expect(stores.vault.getState().unlocked).toBe(false);

    await stores.vault.getState().unlockWithPassphrase(USER_ID, 'a-strong-passphrase');
    expect(stores.vault.getState().unlocked).toBe(true);
  });

  it('destroys the volatile note-search index on lock (ADR-004, B6 §4.2.4)', async () => {
    const runtime = initCoreRuntime({ adapters: makeAdapters() });
    await runtime.stores.vault.getState().init(USER_ID, 'a-strong-passphrase');

    runtime.noteSearch.rebuild([{ id: 's1', source: 'note', text: 'a private plea for healing' }]);
    expect(runtime.noteSearch.search('healing')).toHaveLength(1);

    runtime.stores.vault.getState().lock();

    expect(runtime.noteSearch.active).toBe(false);
    expect(runtime.noteSearch.search('healing')).toEqual([]);
  });

  it('parks the DEK for biometric fast unlock and re-unlocks after lock (B6 §4.2.2)', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters(makeBiometricStorage()) });
    await stores.vault.getState().init(USER_ID, 'a-strong-passphrase');

    await stores.vault.getState().enableBiometric();
    expect(stores.vault.getState().biometricEnabled).toBe(true);

    stores.vault.getState().lock();
    expect(stores.vault.getState().unlocked).toBe(false);

    const ok = await stores.vault.getState().unlockWithBiometric(USER_ID);
    expect(ok).toBe(true);
    expect(stores.vault.getState().unlocked).toBe(true);

    await stores.vault.getState().disableBiometric();
    expect(stores.vault.getState().biometricEnabled).toBe(false);
  });

  it('refuses biometric unlock when the store is not hardware-backed (B6 §4.2.2)', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    await stores.vault.getState().init(USER_ID, 'a-strong-passphrase');

    await stores.vault.getState().enableBiometric();

    expect(stores.vault.getState().error?.code).toBe('CRYPTO_VAULT_LOCKED');
    expect(stores.vault.getState().biometricEnabled).toBe(false);
  });

  it('records CRYPTO_INVALID_PASSPHRASE and stays locked on a bad passphrase', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    await stores.vault.getState().init(USER_ID, 'a-strong-passphrase');
    stores.vault.getState().lock();

    const ok = await stores.vault.getState().unlockWithPassphrase(USER_ID, 'wrong');

    expect(ok).toBe(false);
    expect(stores.vault.getState().error?.code).toBe('CRYPTO_INVALID_PASSPHRASE');
    expect(stores.vault.getState().unlocked).toBe(false);
  });

  it('still unlocks with the original Recovery Key after a passphrase rewrap', async () => {
    const { stores } = initCoreRuntime({ adapters: makeAdapters() });
    const display = await stores.vault.getState().init(USER_ID, 'a-strong-passphrase');

    await stores.vault.getState().rewrap('a-new-passphrase');
    stores.vault.getState().lock();

    await stores.vault.getState().unlockWithPassphrase(USER_ID, 'a-new-passphrase');
    expect(stores.vault.getState().unlocked).toBe(true);

    stores.vault.getState().lock();
    const ok = await stores.vault.getState().unlockWithRecoveryKey(USER_ID, display!);
    expect(ok).toBe(true);
    expect(stores.vault.getState().unlocked).toBe(true);
  });
});
