// B4 §4.6 — `manifest.json` contract validation (FR-105 catalogue).
//
// The remote catalogue is untrusted input: `parsePackManifest` must accept the exact body the
// `tools/pack-builder` ETL publishes and reject anything malformed with a canonical
// `PACK_MANIFEST_INVALID` `AppError` (C3) rather than corrupting install state.

import { describe, expect, it } from 'vitest';

import { MANIFEST_VERSION, parsePackManifest, type ManifestPackEntry } from '../src/content/pack-manifest';
import { isAppError } from '../src/errors/AppError';

/** A manifest entry identical in shape to the one emitted by the real `pack-builder` ETL. */
const VALID_ENTRY: ManifestPackEntry = {
  packId: 'core_bsb',
  packType: 'TRANSLATION',
  contentVersion: '1.0.0',
  schemaVersion: 1,
  minAppVersion: '0.1.0',
  downloadUrl: 'https://packs.breathandword.app/v1/core_bsb-1.0.0.sqlite.gz',
  compressedBytes: 4_432_599,
  uncompressedBytes: 16_076_800,
  sha256Compressed: 'afa77287c4cd4063ecc5441b12155a55d25d1c95e31f730df69d60f1b1d1d2ba',
  sha256Uncompressed: '2c7b327462d04ddb9fadfadc13235c6ba765699ecd68c2206b9e7f8c2650df4c',
  licenseSpdx: 'CC0-1.0',
};

function validManifest(): Record<string, unknown> {
  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: '2026-11-25T19:09:09.058Z',
    packs: [VALID_ENTRY],
  };
}

/** Assert that parsing `value` throws a canonical `PACK_MANIFEST_INVALID` `AppError`. */
function expectManifestInvalid(value: unknown): void {
  const error = (() => {
    try {
      parsePackManifest(value);
      return undefined;
    } catch (thrown: unknown) {
      return thrown;
    }
  })();
  expect(isAppError(error) && error.code).toBe('PACK_MANIFEST_INVALID');
  expect(isAppError(error) && error.domain).toBe('PACK');
}

describe('parsePackManifest (B4 §4.6)', () => {
  it('accepts the body the pack-builder ETL publishes', () => {
    const manifest = parsePackManifest(validManifest());

    expect(manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect(manifest.generatedAt).toBe('2026-11-25T19:09:09.058Z');
    expect(manifest.packs).toEqual([VALID_ENTRY]);
  });

  it('accepts an empty catalogue', () => {
    const manifest = parsePackManifest({ ...validManifest(), packs: [] });
    expect(manifest.packs).toEqual([]);
  });

  it('rejects a non-object body', () => {
    expectManifestInvalid('not json');
    expectManifestInvalid(null);
    expectManifestInvalid(undefined);
  });

  it('rejects an unsupported manifestVersion', () => {
    expectManifestInvalid({ ...validManifest(), manifestVersion: 2 });
    expectManifestInvalid({ ...validManifest(), manifestVersion: undefined });
  });

  it('rejects a missing generatedAt', () => {
    const body = validManifest();
    delete body.generatedAt;
    expectManifestInvalid(body);
  });

  it('rejects a non-array packs field', () => {
    expectManifestInvalid({ ...validManifest(), packs: {} });
  });

  it('rejects a pack entry missing a required field', () => {
    const withoutUrl = { ...VALID_ENTRY } as Record<string, unknown>;
    delete withoutUrl.downloadUrl;
    expectManifestInvalid({ ...validManifest(), packs: [withoutUrl] });
  });

  it('rejects a pack entry with an unknown packType', () => {
    expectManifestInvalid({ ...validManifest(), packs: [{ ...VALID_ENTRY, packType: 'AUDIO' }] });
  });

  it('rejects a pack entry with a non-numeric byte count', () => {
    expectManifestInvalid({ ...validManifest(), packs: [{ ...VALID_ENTRY, compressedBytes: '4432599' }] });
  });
});
