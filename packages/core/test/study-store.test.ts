// FR-301..305 — Headless `createStudyStore` integration test (never throws, surfaces AppError,
// exercises highlights, notes, reminders, ink canvases, and DB_CONTENT_PACK_NOT_ATTACHED).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExegesisRepository } from '../src/repositories/exegesis-repository';
import { InductiveStudyRepository } from '../src/repositories/inductive-study-repository';
import { InkCanvasRepository } from '../src/repositories/ink-canvas-repository';
import { StudyRefsRepository } from '../src/repositories/study-refs-repository';
import { createStudyStore } from '../src/stores/study-store';

import { NodeContentDbAdapter } from './helpers/node-content-db';
import { NodeLocalDeviceAdapter } from './helpers/node-local-device';
import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '44444444-4444-4444-8444-444444444444';

let contentDb: NodeContentDbAdapter;
let userDb: NodeUserDbAdapter;
let localDevice: NodeLocalDeviceAdapter;

beforeEach(() => {
  contentDb = new NodeContentDbAdapter();
  userDb = new NodeUserDbAdapter();
  localDevice = new NodeLocalDeviceAdapter();
});

afterEach(() => {
  contentDb.close();
  userDb.close();
  localDevice.close();
});

describe('createStudyStore (FR-301..305)', () => {
  it('captures DB_CONTENT_PACK_NOT_ATTACHED into store.error instead of throwing when exegesis pack is missing', async () => {
    const store = createStudyStore({
      exegesis: new ExegesisRepository({ contentDb }),
      studyRefs: new StudyRefsRepository({ contentDb }),
      inductive: new InductiveStudyRepository({ userDb, localDevice, crypto: webCryptoAdapter }),
      ink: new InkCanvasRepository({ userDb, crypto: webCryptoAdapter }),
    });

    await store.getState().openLexicon('G26');
    expect(store.getState().status).toBe('error');
    expect(store.getState().error?.code).toBe('DB_CONTENT_PACK_NOT_ATTACHED');
  });

  it('manages highlights, application notes with reminders, and ink canvases end-to-end', async () => {
    const store = createStudyStore({
      exegesis: new ExegesisRepository({ contentDb }),
      studyRefs: new StudyRefsRepository({ contentDb }),
      inductive: new InductiveStudyRepository({ userDb, localDevice, crypto: webCryptoAdapter }),
      ink: new InkCanvasRepository({ userDb, crypto: webCryptoAdapter }),
    });

    const hl = await store.getState().addHighlight({
      userId: USER_ID,
      translationCode: 'BSB',
      startVerseId: 45008028,
      endVerseId: 45008028,
      colorHex: '#BAE6FD',
      symbolTag: 'PROMISE',
    });
    expect(hl).not.toBeNull();
    expect(store.getState().highlights).toHaveLength(1);

    const note = await store.getState().createNote({
      userId: USER_ID,
      startVerseId: 45008028,
      endVerseId: 45008028,
      noteType: 'APPLICATION',
      title: 'Weekly Checkup',
      body: 'Trust God in uncertainty',
      checkupRemindAt: '2026-12-01T08:00:00Z',
    });
    expect(note).not.toBeNull();
    expect(store.getState().notes).toHaveLength(1);
    expect(store.getState().checkupReminders).toHaveLength(1);

    const canvas = await store.getState().saveInkCanvas({
      userId: USER_ID,
      canonicalVerseId: 45008028,
      noteId: note!.id,
      strokes: [
        {
          id: 'st-1',
          colorHex: '#2B5B6C',
          width: 4,
          points: [
            { x: 100, y: 100, pressure: 0.5, t: 0 },
            { x: 300, y: 300, pressure: 0.6, t: 10 },
          ],
        },
      ],
    });
    expect(canvas).not.toBeNull();
    expect(store.getState().inkCanvases).toHaveLength(1);

    await store.getState().dismissReminder(note!.id);
    expect(store.getState().checkupReminders).toHaveLength(0);
  });
});
