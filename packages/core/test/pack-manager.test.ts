// FR-105 Content Pack Manager — download / verify / atomic attach / update / remove
// (B4 §4.4 `installed_packs`, §4.6 atomic update protocol, C3 pack error codes).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ManifestPackEntry } from '../src/content/pack-manifest';
import { isAppError } from '../src/errors/AppError';
import { PackManagerRepository, type PackInstallPhase } from '../src/repositories/pack-manager-repository';
import { ReaderRepository } from '../src/repositories/reader-repository';

import { writeFixturePack, type FixturePackSpec } from './helpers/fixture-pack';
import { NodeContentDbAdapter } from './helpers/node-content-db';
import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodePackInstallerAdapter } from './helpers/node-pack-installer';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const ROMANS_8_28 = 45_008_028;

const BSB_BOOKS = [
  { number: 1, osis: 'Gen', name: 'Genesis', testament: 'OT' as const, chapterCount: 50, genre: 'LAW' },
  { number: 45, osis: 'Rom', name: 'Romans', testament: 'NT' as const, chapterCount: 16, genre: 'EPISTLE' },
];

const BSB_V1: FixturePackSpec = {
  packId: 'core_bsb',
  translationCode: 'BSB',
  translationName: 'Berean Standard Bible',
  contentVersion: '1.0.0',
  books: BSB_BOOKS,
  verses: [
    {
      book: 45,
      chapter: 8,
      verse: 28,
      plainText: 'And we know that God works all things together for the good of those who love Him.',
      spans: [{ type: 'text', text: 'And we know that God works all things together for the good of those who love Him.' }],
    },
  ],
};

const BSB_V2: FixturePackSpec = {
  ...BSB_V1,
  contentVersion: '1.1.0',
  verses: [
    {
      book: 45,
      chapter: 8,
      verse: 28,
      plainText: 'And we know that all things work together for good to those who love God.',
      spans: [{ type: 'text', text: 'And we know that all things work together for good to those who love God.' }],
    },
  ],
};

const WEB_V1: FixturePackSpec = {
  packId: 'trans_web',
  translationCode: 'WEB',
  translationName: 'World English Bible',
  contentVersion: '2.0.0',
  books: BSB_BOOKS,
  verses: [
    {
      book: 45,
      chapter: 8,
      verse: 28,
      plainText: 'We know that all things work together for good for those who love God.',
      spans: [{ type: 'text', text: 'We know that all things work together for good for those who love God.' }],
    },
  ],
};

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-packmgr-'));
const r2Dir = join(tmpRoot, 'r2');

interface PublishedPack {
  readonly entry: ManifestPackEntry;
  readonly gzPath: string;
}

/** Publish a fixture pack as a gzipped R2 artifact with a signed manifest entry. */
async function publishPack(spec: FixturePackSpec, baseUrl = 'https://packs.test/v1'): Promise<PublishedPack> {
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
      downloadUrl: `${baseUrl}/${spec.packId}-${contentVersion}.sqlite.gz`,
      compressedBytes: compressed.byteLength,
      uncompressedBytes: uncompressed.byteLength,
      sha256Compressed: await webCryptoAdapter.sha256Hex(new Uint8Array(compressed)),
      sha256Uncompressed: await webCryptoAdapter.sha256Hex(new Uint8Array(uncompressed)),
      licenseSpdx: 'CC0-1.0',
    },
  };
}

let bsbV1: PublishedPack;
let bsbV2: PublishedPack;
let webV1: PublishedPack;

beforeAll(async () => {
  bsbV1 = await publishPack(BSB_V1);
  bsbV2 = await publishPack(BSB_V2);
  webV1 = await publishPack(WEB_V1);
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let contentDb: NodeContentDbAdapter;
let localDevice: NodeLocalDeviceAdapter;
let installer: NodePackInstallerAdapter;
let packsDir: string;
let repo: PackManagerRepository;

beforeEach(() => {
  packsDir = mkdtempSync(join(tmpRoot, 'packs-'));
  contentDb = new NodeContentDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
  installer = new NodePackInstallerAdapter({ rootDir: packsDir });
  repo = new PackManagerRepository({ contentDb, localDevice, installer, crypto: webCryptoAdapter });
});

afterEach(() => {
  contentDb.close();
  localDevice.close();
  rmSync(packsDir, { recursive: true, force: true });
});

/** The test installer fetches from a local path instead of the CDN. */
function entryWithLocalDownload(entry: ManifestPackEntry, gzPath: string): ManifestPackEntry {
  return { ...entry, downloadUrl: gzPath };
}

describe('PackManagerRepository install (FR-105)', () => {
  it('downloads, verifies, attaches atomically, and records installed_packs', async () => {
    const entry = entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath);
    const phases: PackInstallPhase[] = [];
    let downloadedBytes = 0;

    const installed = await repo.install(entry, (phase, received) => {
      phases.push(phase);
      if (phase === 'downloading') downloadedBytes = received;
    });

    expect([...new Set(phases)]).toEqual(['downloading', 'verifying', 'extracting', 'attaching']);
    expect(downloadedBytes).toBe(entry.compressedBytes);

    expect(installed.packId).toBe('core_bsb');
    expect(installed.contentVersion).toBe('1.0.0');
    expect(installed.sha256).toBe(entry.sha256Uncompressed);
    expect(existsSync(installed.filePath)).toBe(true);
    expect(existsSync(`${installed.filePath}.gz.tmp`)).toBe(false);

    const record = await repo.getInstalled('core_bsb');
    expect(record).toEqual(installed);
    expect(await repo.storageUsageBytes()).toBe(installed.fileSizeBytes);
    expect(await contentDb.getAttachedPacks()).toContain('core_bsb');
  });

  it('makes the freshly attached pack immediately readable (FR-102/FR-103)', async () => {
    await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath));

    const reader = new ReaderRepository(contentDb);
    const verse = await reader.getVerse('core_bsb', 'BSB', ROMANS_8_28);
    expect(verse?.plainText).toBe(BSB_V1.verses[0]?.plainText);
  });

  it('lists all installed packs ordered by id', async () => {
    await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath));
    await repo.install(entryWithLocalDownload(webV1.entry, webV1.gzPath));

    const packs = await repo.listInstalled();
    expect(packs.map((pack) => pack.packId)).toEqual(['core_bsb', 'trans_web']);
  });
});

describe('PackManagerRepository update (FR-105)', () => {
  it('atomically swaps to the new version and drops the superseded file', async () => {
    const first = await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath));

    const updated = await repo.update(entryWithLocalDownload(bsbV2.entry, bsbV2.gzPath));

    expect(updated.contentVersion).toBe('1.1.0');
    expect(updated.filePath).not.toBe(first.filePath);
    expect(existsSync(first.filePath)).toBe(false);
    expect(existsSync(updated.filePath)).toBe(true);

    const record = await repo.getInstalled('core_bsb');
    expect(record?.contentVersion).toBe('1.1.0');

    const reader = new ReaderRepository(contentDb);
    const verse = await reader.getVerse('core_bsb', 'BSB', ROMANS_8_28);
    expect(verse?.plainText).toBe(BSB_V2.verses[0]?.plainText);
  });
});

describe('PackManagerRepository remove (FR-105)', () => {
  it('detaches, deletes the file, and forgets the row', async () => {
    const installed = await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath));

    await repo.remove('core_bsb');

    expect(await repo.getInstalled('core_bsb')).toBeNull();
    expect(await repo.storageUsageBytes()).toBe(0);
    expect(await contentDb.getAttachedPacks()).not.toContain('core_bsb');
    expect(existsSync(installed.filePath)).toBe(false);
  });

  it('is a no-op when the pack is not installed', async () => {
    await expect(repo.remove('trans_kjv')).resolves.toBeUndefined();
  });
});

describe('PackManagerRepository boot restore (FR-105, B4 §4.6)', () => {
  it('re-attaches installed packs on a cold start and is then readable', async () => {
    await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath));

    // Simulate a fresh app launch: a new content connection, the same local_device DB.
    const restartedContentDb = new NodeContentDbAdapter();
    try {
      const bootRepo = new PackManagerRepository({
        contentDb: restartedContentDb,
        localDevice,
        installer,
        crypto: webCryptoAdapter,
      });
      expect(await restartedContentDb.getAttachedPacks()).not.toContain('core_bsb');

      expect(await bootRepo.attachInstalledPacks()).toEqual(['core_bsb']);

      const reader = new ReaderRepository(restartedContentDb);
      const verse = await reader.getVerse('core_bsb', 'BSB', ROMANS_8_28);
      expect(verse?.plainText).toBe(BSB_V1.verses[0]?.plainText);

      // Idempotent: a second boot with packs already attached re-attaches nothing.
      expect(await bootRepo.attachInstalledPacks()).toEqual([]);
    } finally {
      restartedContentDb.close();
    }
  });

  it('is a no-op when nothing has been installed yet', async () => {
    expect(await repo.attachInstalledPacks()).toEqual([]);
  });
});

describe('PackManagerRepository failure modes (C3)', () => {
  it('rejects a checksum mismatch and keeps nothing installed', async () => {
    const tampered = { ...bsbV1.entry, sha256Compressed: '0'.repeat(64) };

    const error = await repo.install(entryWithLocalDownload(tampered, bsbV1.gzPath)).catch((e: unknown) => e);

    expect(isAppError(error) && error.code).toBe('PACK_CHECKSUM_MISMATCH');
    expect(await repo.getInstalled('core_bsb')).toBeNull();
    expect(await contentDb.getAttachedPacks()).not.toContain('core_bsb');
  });

  it('rejects a staged pack whose metadata does not match the manifest', async () => {
    // Same bytes (correct hashes) but the pack declares a different pack_id than the manifest.
    const mismatched = { ...bsbV1.entry, packId: 'trans_web' };

    const error = await repo.install(entryWithLocalDownload(mismatched, bsbV1.gzPath)).catch((e: unknown) => e);

    expect(isAppError(error) && error.code).toBe('PACK_INTEGRITY_FAILED');
    expect(await contentDb.getAttachedPacks()).not.toContain('trans_web');
  });

  it('refuses a pack that needs a newer schema', async () => {
    const future = { ...bsbV1.entry, schemaVersion: 99 };

    const error = await repo.install(entryWithLocalDownload(future, bsbV1.gzPath)).catch((e: unknown) => e);

    expect(isAppError(error) && error.code).toBe('PACK_SCHEMA_INCOMPATIBLE');
  });

  it('refuses to install when free space is below 2x the uncompressed size', async () => {
    installer.setAvailableBytes(bsbV1.entry.uncompressedBytes);

    const error = await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath)).catch((e: unknown) => e);

    expect(isAppError(error) && error.code).toBe('PACK_STORAGE_FULL');
  });

  it('surfaces an interrupted download with an exponential-backoff policy', async () => {
    installer.setDownloadError(new Error('socket closed'));

    const error = await repo.install(entryWithLocalDownload(bsbV1.entry, bsbV1.gzPath)).catch((e: unknown) => e);

    expect(isAppError(error) && error.code).toBe('PACK_DOWNLOAD_INTERRUPTED');
    expect(isAppError(error) && error.retryPolicy).toBe('EXPONENTIAL_BACKOFF');
  });
});
