// FR-305 Cross-Platform Stylus Ink Canvas (`ink_canvases`, ADR-003, B6 E2EE).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isEncryptedEnvelope } from '../src/crypto/envelope';
import {
  inkStrokeToSvgPath,
  normalizedToPixelPoint,
  pixelToNormalizedPoint,
} from '../src/ink/strokes';
import { InkCanvasRepository } from '../src/repositories/ink-canvas-repository';
import { VaultRepository } from '../src/repositories/vault-repository';

import { NodeUserDbAdapter } from './helpers/node-user-db';
import { webCryptoAdapter } from './helpers/webcrypto-adapter';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const FIXED_NOW = Date.parse('2026-11-27T10:00:00Z');

let userDb: NodeUserDbAdapter;
let vault: VaultRepository;
let repo: InkCanvasRepository;

beforeEach(() => {
  userDb = new NodeUserDbAdapter();
  vault = new VaultRepository({ userDb, crypto: webCryptoAdapter });
  repo = new InkCanvasRepository({
    userDb,
    crypto: webCryptoAdapter,
    cipher: vault.cipher(),
    now: () => FIXED_NOW,
  });
});

afterEach(() => {
  userDb.close();
});

describe('Portable Ink Geometry (ADR-003)', () => {
  it('normalizes iPad pixels to 0..1000 and projects identically onto Android & Desktop viewports', () => {
    // Center point drawn on an iPad 1024x768 surface
    const pt = pixelToNormalizedPoint(512, 384, 1024, 768, 0.75, 16);
    expect(pt).toEqual({ x: 500, y: 500, pressure: 0.75, t: 16 });

    // Re-projected onto a 400x300 Android/Windows viewport hits exact relative center
    const projected = normalizedToPixelPoint(pt, 400, 300);
    expect(projected).toEqual({ x: 200, y: 150 });
  });

  it('produces a deterministic SVG path usable identically by Skia and HTML5 SVG', () => {
    const path = inkStrokeToSvgPath(
      {
        id: 's1',
        colorHex: '#2B5B6C',
        width: 4,
        points: [
          { x: 0, y: 0, pressure: 0.5, t: 0 },
          { x: 500, y: 500, pressure: 0.6, t: 10 },
          { x: 1000, y: 1000, pressure: 0.4, t: 20 },
        ],
      },
      200,
      100,
    );
    expect(path).toBe('M 0 0 Q 0 0 50 25 Q 100 50 150 75 L 200 100');
  });
});

describe('InkCanvasRepository (FR-305)', () => {
  it('saves, clamps out-of-bounds points, updates, and soft-deletes ink canvases', async () => {
    const saved = await repo.saveCanvas({
      userId: USER_ID,
      canonicalVerseId: 45008028,
      strokes: [
        {
          id: 'stroke-1',
          colorHex: '#2B5B6C',
          width: 45, // clamped to 20
          points: [
            { x: -10, y: 1200, pressure: 1.8, t: -5 },
            { x: 500, y: 250, pressure: 0.6, t: 12 },
          ],
        },
      ],
    });

    expect(saved.strokes[0]?.width).toBe(20);
    expect(saved.strokes[0]?.points[0]).toEqual({ x: 0, y: 1000, pressure: 1, t: 0 });

    const listed = await repo.listCanvasesForVerse(USER_ID, 45008028);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);

    await repo.deleteCanvas(saved.id, USER_ID);
    expect(await repo.listCanvasesForVerse(USER_ID, 45008028)).toHaveLength(0);

    // Tombstone preserved (soft delete only)
    const raw = await userDb.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM ink_canvases WHERE id = ?`,
      [saved.id],
    );
    expect(raw.rows[0]?.deleted_at).not.toBeNull();
  });

  it('encrypts strokes_payload via e2ee:v1 when the Private Vault is enabled', async () => {
    const pre = await repo.saveCanvas({
      userId: USER_ID,
      canonicalVerseId: 19023001,
      strokes: [
        {
          id: 's-enc',
          colorHex: '#7C4D2B',
          width: 3,
          points: [{ x: 100, y: 200, pressure: 0.5, t: 0 }],
        },
      ],
    });
    expect(pre.isEncrypted).toBe(false);

    await vault.initVault(USER_ID, 'ink-vault-passphrase');

    const raw = await userDb.query<{ strokes_payload: string; is_encrypted: number }>(
      `SELECT strokes_payload, is_encrypted FROM ink_canvases WHERE id = ?`,
      [pre.id],
    );
    expect(raw.rows[0]?.is_encrypted).toBe(1);
    expect(isEncryptedEnvelope(raw.rows[0]!.strokes_payload)).toBe(true);

    const hydrated = await repo.getCanvas(pre.id, USER_ID);
    expect(hydrated?.strokes).toHaveLength(1);
    expect(hydrated?.strokes[0]?.id).toBe('s-enc');
  });
});
