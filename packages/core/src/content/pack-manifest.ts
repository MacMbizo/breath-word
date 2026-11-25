// B4 §4.6 — Content pack `manifest.json` contract (shared by the ETL producer and the
// on-device Content Pack Manager, FR-105).
//
// Hosted on Cloudflare R2 next to the `*.sqlite.gz` packs; the client downloads this
// once, then verifies each downloaded pack against the matching `ManifestPackEntry`.
// The shape is frozen at `manifestVersion = 1` to match `PACK_SCHEMA_VERSION`.

import type { PackType } from '../domain/types';

export const MANIFEST_VERSION = 1;

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
