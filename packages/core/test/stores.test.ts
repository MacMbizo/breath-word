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

import type { AudioEngineAdapter, CoreAdapters, SecureStorageAdapter } from '../src/adapters';
import type { ManifestPackEntry } from '../src/content/pack-manifest';
import { initCoreRuntime, type CoreRuntime } from '../src/runtime/core-runtime';
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
  async getItem() {
    return null;
  },
  async setItem() {},
  async deleteItem() {},
};

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

function makeAdapters(): CoreAdapters {
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
    secureStorage,
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
