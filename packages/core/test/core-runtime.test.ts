// B3 §4.2 rule 2 — `initCoreRuntime(adapters)` composes the headless core from
// platform-injected adapters; UI screens consume the wired repositories.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AudioEngineAdapter, CoreAdapters, SecureStorageAdapter } from '../src/adapters';
import { initCoreRuntime } from '../src/runtime/core-runtime';

import { writeFixturePack } from './helpers/fixture-pack';
import { writeStudyRefsPack } from './helpers/fixture-study-refs-pack';
import { NodeContentDbAdapter } from './helpers/node-content-db';
import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodePackInstallerAdapter } from './helpers/node-pack-installer';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_GOSPELS = 'plan_manna_gospels_3';
const FIXED_NOW = Date.parse('2026-11-25T08:30:00Z');

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-core-runtime-'));
const bsbPath = join(tmpRoot, 'core_bsb.sqlite');
const studyRefsPath = join(tmpRoot, 'study_refs.sqlite');

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

beforeAll(() => {
  writeFixturePack(bsbPath, {
    packId: 'core_bsb',
    translationCode: 'BSB',
    translationName: 'Berean Standard Bible',
    books: [{ number: 19, osis: 'Ps', name: 'Psalms', testament: 'OT', chapterCount: 150, genre: 'Wisdom' }],
    verses: [
      {
        book: 19,
        chapter: 23,
        verse: 1,
        plainText: 'The LORD is my shepherd; I shall not want.',
        spans: [{ type: 'text', text: 'The LORD is my shepherd; I shall not want.' }],
      },
    ],
  });

  writeStudyRefsPack(studyRefsPath, {
    plans: [
      {
        planId: PLAN_GOSPELS,
        title: 'Gospels in 3 Days',
        description: 'A short walk through the Gospels.',
        totalDays: 3,
        category: 'NEW_TESTAMENT',
      },
    ],
    days: {
      [PLAN_GOSPELS]: [
        { dayNumber: 1, startVerseId: 19023001, endVerseId: 19023006, label: 'Psalm 23' },
      ],
    },
  });
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let contentDb: NodeContentDbAdapter;
let userDb: NodeUserDbAdapter;
let localDevice: NodeLocalDeviceAdapter;

afterEach(() => {
  contentDb.close();
  userDb.close();
  localDevice.close();
});

async function buildAdapters(): Promise<CoreAdapters> {
  contentDb = new NodeContentDbAdapter();
  await contentDb.attachPack('core_bsb', bsbPath);
  await contentDb.attachPack('study_refs', studyRefsPath);
  userDb = new NodeUserDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
  return {
    contentDb,
    userDb,
    localDevice,
    packInstaller: new NodePackInstallerAdapter({ rootDir: join(tmpRoot, 'installed') }),
    crypto: webCryptoAdapter,
    secureStorage,
    audio,
  };
}

describe('initCoreRuntime (B3 §4.2 rule 2)', () => {
  it('wires every Phase-1 repository from the injected adapters', async () => {
    const adapters = await buildAdapters();
    const runtime = initCoreRuntime({ adapters });

    expect(runtime.adapters).toBe(adapters);
    expect(runtime.repositories.reader).toBeInstanceOf(Object);
    expect(runtime.repositories.packs).toBeInstanceOf(Object);
    expect(runtime.repositories.readingPlans).toBeInstanceOf(Object);
  });

  it('exposes a working offline reader (FR-101)', async () => {
    const adapters = await buildAdapters();
    const runtime = initCoreRuntime({ adapters });

    const chapter = await runtime.repositories.reader.getChapter('core_bsb', 'BSB', 19, 23);
    expect(chapter.verses.map((verse) => verse.canonicalVerseId)).toEqual([19023001]);
  });

  it('exposes pack storage totals (FR-105)', async () => {
    const adapters = await buildAdapters();
    const runtime = initCoreRuntime({ adapters });

    expect(await runtime.repositories.packs.listInstalled()).toEqual([]);
    expect(await runtime.repositories.packs.storageUsageBytes()).toBe(0);
  });

  it('exposes reading plans and forwards the injected clock (FR-104)', async () => {
    const adapters = await buildAdapters();
    const runtime = initCoreRuntime({ adapters, now: () => FIXED_NOW });

    expect((await runtime.repositories.readingPlans.listPlans()).map((plan) => plan.planId)).toEqual([
      PLAN_GOSPELS,
    ]);

    const enrollment = await runtime.repositories.readingPlans.enroll(USER_ID, PLAN_GOSPELS);
    expect(enrollment.startedAt).toBe('2026-11-25T08:30:00.000Z');
  });

  it('honours a custom study_refs pack id', async () => {
    contentDb = new NodeContentDbAdapter();
    await contentDb.attachPack('my_refs', studyRefsPath);
    userDb = new NodeUserDbAdapter();
    localDevice = new NodeLocalDeviceAdapter();

    const runtime = initCoreRuntime({
      adapters: {
        contentDb,
        userDb,
        localDevice,
        packInstaller: new NodePackInstallerAdapter({ rootDir: join(tmpRoot, 'installed') }),
        crypto: webCryptoAdapter,
        secureStorage,
        audio,
      },
      studyRefsPackId: 'my_refs',
    });

    expect((await runtime.repositories.readingPlans.listPlans()).map((plan) => plan.planId)).toEqual([
      PLAN_GOSPELS,
    ]);
  });
});
