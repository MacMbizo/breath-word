// B4 §4.6 — Content pack `manifest.json` contract (shared by the ETL producer and the
// on-device Content Pack Manager, FR-105).
//
// Hosted on Cloudflare R2 next to the `*.sqlite.gz` packs; the client downloads this
// once, then verifies each downloaded pack against the matching `ManifestPackEntry`.
// The shape is frozen at `manifestVersion = 1` to match `PACK_SCHEMA_VERSION`.

import type { PackType } from '../domain/types';
import { AppError } from '../errors/AppError';

export const MANIFEST_VERSION = 1;

const PACK_TYPES: readonly PackType[] = ['TRANSLATION', 'EXEGESIS', 'STUDY_REFS', 'COMMENTARY'];

/** One downloadable pack version, as published in `manifest.json`. */
export interface ManifestPackEntry {
  readonly packId: string;
  readonly packType: PackType;
  readonly contentVersion: string;
  readonly schemaVersion: number;
  readonly minAppVersion: string;
  readonly downloadUrl: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly sha256Compressed: string;
  readonly sha256Uncompressed: string;
  readonly licenseSpdx: string;
}

export interface PackManifest {
  readonly manifestVersion: number;
  readonly generatedAt: string;
  readonly packs: readonly ManifestPackEntry[];
}

function manifestInvalid(detail: string): AppError {
  return new AppError({
    code: 'PACK_MANIFEST_INVALID',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'The content pack catalogue could not be read. Please try again later.',
    internalDetail: `manifest.json: ${detail}`,
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isManifestPackEntry(value: unknown): value is ManifestPackEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const pack = value as Record<string, unknown>;
  return (
    isNonEmptyString(pack.packId) &&
    isNonEmptyString(pack.packType) &&
    PACK_TYPES.includes(pack.packType as PackType) &&
    isNonEmptyString(pack.contentVersion) &&
    typeof pack.schemaVersion === 'number' &&
    isNonEmptyString(pack.minAppVersion) &&
    isNonEmptyString(pack.downloadUrl) &&
    typeof pack.compressedBytes === 'number' &&
    typeof pack.uncompressedBytes === 'number' &&
    isNonEmptyString(pack.sha256Compressed) &&
    isNonEmptyString(pack.sha256Uncompressed) &&
    isNonEmptyString(pack.licenseSpdx)
  );
}

/**
 * Validate a fetched `manifest.json` into a typed `PackManifest` (FR-105 catalogue). The remote
 * catalogue is untrusted input, so every field is checked before the Content Pack Manager acts on
 * it; a malformed body throws a canonical `PACK_MANIFEST_INVALID` `AppError` rather than corrupting
 * install state.
 */
export function parsePackManifest(value: unknown): PackManifest {
  if (typeof value !== 'object' || value === null) {
    throw manifestInvalid('body is not a JSON object');
  }
  const record = value as Record<string, unknown>;
  if (record.manifestVersion !== MANIFEST_VERSION) {
    throw manifestInvalid(`unsupported manifestVersion "${String(record.manifestVersion)}"`);
  }
  if (typeof record.generatedAt !== 'string') {
    throw manifestInvalid('missing "generatedAt"');
  }
  if (!Array.isArray(record.packs)) {
    throw manifestInvalid('"packs" is not an array');
  }
  record.packs.forEach((pack, index) => {
    if (!isManifestPackEntry(pack)) {
      throw manifestInvalid(`packs[${index}] is not a valid pack entry`);
    }
  });

  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: record.generatedAt,
    packs: record.packs as ManifestPackEntry[],
  };
}
