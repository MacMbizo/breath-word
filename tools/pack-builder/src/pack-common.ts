// tools/pack-builder — pieces shared by every pack type (B4 §4.2/§4.6, B5 §4.3).
//
// Every pack — TRANSLATION, EXEGESIS, STUDY_REFS — goes through the same three gates:
//   1. `assertPackMetadata` before anything is written (B5 §4.3: empty `license_spdx` /
//      `attribution_text` fails the build; CC BY / BY-SA packs must link their licence).
//   2. `verifyPackDatabase` after the bulk insert (`PRAGMA integrity_check`,
//      `foreign_key_check`, and the persisted `pack_metadata` row re-checked).
//   3. `packageArtifacts` — gzip + SHA-256 into a `ManifestPackEntry`.

import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { DatabaseSync } from './node-sqlite';

import {
  AppError,
  PACK_SCHEMA_VERSION,
  fromCanonicalVerseId,
  isValidCanonicalVerseId,
  type ManifestPackEntry,
  type PackType,
} from '@breath-and-word/core';

export interface PackMetadataInput {
  packId: string;
  packType: PackType;
  contentVersion: string;
  displayName: string;
  licenseSpdx: string;
  attributionText: string;
  /** ISO-8601 UTC. */
  builtAt: string;
}

export interface PackBuildOptions {
  /** Base URL the `*.sqlite.gz` files are hosted under (Cloudflare R2 prefix). */
  baseUrl: string;
  minAppVersion: string;
}

export interface PackBuildArtifacts {
  sqlitePath: string;
  gzPath: string;
  entry: ManifestPackEntry;
}

/** Same shape the runtime accepts as a pack id / attach schema name. */
const SAFE_PACK_ID = /^[a-z][a-z0-9_]*$/;

/**
 * Creative Commons Attribution licences (CC BY / BY-SA / BY-NC …) require a link to the
 * licence next to the credit (B5: "Mandatory visible attribution … + link to CC BY 4.0").
 */
const CC_ATTRIBUTION_LICENCE = /^CC-BY(?:-[A-Z]+)*-\d/i;
const CC_LICENCE_LINK = /creativecommons\.org\/licenses\//i;

/** Build-time source error: the input cannot become a valid pack (C3 `PACK_PARSE_FAILED`). */
export function packSourceInvalid(internalDetail: string): AppError {
  return new AppError({
    code: 'PACK_PARSE_FAILED',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'This content pack source could not be built.',
    internalDetail,
  });
}

/** Post-build verification failure (C3 `PACK_INTEGRITY_FAILED`): never publish the file. */
export function packIntegrityFailed(packId: string, internalDetail: string): AppError {
  return new AppError({
    code: 'PACK_INTEGRITY_FAILED',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'The downloaded Bible pack could not be verified.',
    internalDetail: `${packId}: ${internalDetail}`,
  });
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Validate pack metadata before any row is written (B5 §4.3). Throws `PACK_PARSE_FAILED` when
 * a required field is blank, the pack type is not the one this builder produces, or a
 * Creative Commons Attribution licence is credited without a link to the licence.
 */
export function assertPackMetadata(metadata: PackMetadataInput, expectedType: PackType): void {
  const id = typeof metadata.packId === 'string' ? metadata.packId : String(metadata.packId);
  if (!SAFE_PACK_ID.test(id)) {
    throw packSourceInvalid(`pack_metadata.pack_id "${id}" must match ${SAFE_PACK_ID.source}.`);
  }
  if (metadata.packType !== expectedType) {
    throw packSourceInvalid(
      `${id}: pack_metadata.pack_type is "${String(metadata.packType)}", expected "${expectedType}".`,
    );
  }
  for (const field of ['contentVersion', 'displayName', 'licenseSpdx', 'attributionText', 'builtAt'] as const) {
    if (isBlank(metadata[field])) {
      throw packSourceInvalid(`${id}: pack_metadata.${field} must be a non-empty string (B5 §4.3).`);
    }
  }
  if (CC_ATTRIBUTION_LICENCE.test(metadata.licenseSpdx.trim()) && !CC_LICENCE_LINK.test(metadata.attributionText)) {
    throw packSourceInvalid(
      `${id}: ${metadata.licenseSpdx} requires attribution_text to link the licence (creativecommons.org/licenses/…) (B5).`,
    );
  }
}

/** Insert the single `pack_metadata` row every pack carries (B4 §4.2). */
export function insertPackMetadata(db: DatabaseSync, metadata: PackMetadataInput): void {
  db.prepare(
    `INSERT INTO pack_metadata
       (pack_id, pack_type, schema_version, content_version, display_name, license_spdx, attribution_text, built_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metadata.packId,
    metadata.packType,
    PACK_SCHEMA_VERSION,
    metadata.contentVersion.trim(),
    metadata.displayName.trim(),
    metadata.licenseSpdx.trim(),
    metadata.attributionText.trim(),
    metadata.builtAt.trim(),
  );
}

/** True for a well-formed Protestant BBCCCVVV id with non-zero book, chapter and verse. */
export function isStrictCanonicalVerseId(id: unknown): id is number {
  if (typeof id !== 'number' || !isValidCanonicalVerseId(id)) return false;
  const { book, chapter, verse } = fromCanonicalVerseId(id);
  return book >= 1 && book <= 66 && chapter >= 1 && verse >= 1;
}

/**
 * Optimize and verify a freshly written pack (B4 §4.6). Runs after `COMMIT`:
 * `ANALYZE` + `VACUUM`, then `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and a re-read
 * of `pack_metadata` so a pack can never ship without exactly one fully-populated header row.
 */
export function verifyPackDatabase(db: DatabaseSync, metadata: PackMetadataInput): void {
  db.exec('ANALYZE;');
  db.exec('VACUUM;');

  const integrity = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
  if (integrity.integrity_check !== 'ok') {
    throw packIntegrityFailed(metadata.packId, `PRAGMA integrity_check returned "${integrity.integrity_check}".`);
  }

  const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
  if (fkViolations.length > 0) {
    throw packIntegrityFailed(
      metadata.packId,
      `PRAGMA foreign_key_check reported ${fkViolations.length} violation(s), first: ${JSON.stringify(fkViolations[0])}.`,
    );
  }

  const rows = db
    .prepare('SELECT pack_id, pack_type, license_spdx, attribution_text FROM pack_metadata')
    .all() as { pack_id: string; pack_type: string; license_spdx: string; attribution_text: string }[];
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw packIntegrityFailed(metadata.packId, `pack_metadata must hold exactly one row (found ${rows.length}).`);
  }
  if (row.pack_id !== metadata.packId || row.pack_type !== metadata.packType) {
    throw packIntegrityFailed(metadata.packId, `pack_metadata header is "${row.pack_id}"/"${row.pack_type}".`);
  }
  if (isBlank(row.license_spdx) || isBlank(row.attribution_text)) {
    throw packIntegrityFailed(metadata.packId, 'pack_metadata license_spdx / attribution_text is empty (B5 §4.3).');
  }
}

/** Close a database, ignoring "already closed". */
export function closeQuietly(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}

/** Roll back any open transaction, close, and delete a pack that failed to build or verify. */
export function closeAndDiscard(db: DatabaseSync, sqlitePath: string): void {
  try {
    db.exec('ROLLBACK');
  } catch {
    // No transaction was open.
  }
  closeQuietly(db);
  rmSync(sqlitePath, { force: true });
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Gzip a built `.sqlite` and describe it as a manifest entry (B4 §4.6). */
export function packageArtifacts(
  sqlitePath: string,
  metadata: PackMetadataInput,
  options: PackBuildOptions,
): PackBuildArtifacts {
  const uncompressed = readFileSync(sqlitePath);
  const compressed = gzipSync(uncompressed);
  const gzPath = `${sqlitePath}.gz`;
  writeFileSync(gzPath, compressed);

  return {
    sqlitePath,
    gzPath,
    entry: {
      packId: metadata.packId,
      packType: metadata.packType,
      contentVersion: metadata.contentVersion.trim(),
      schemaVersion: PACK_SCHEMA_VERSION,
      minAppVersion: options.minAppVersion,
      downloadUrl: `${options.baseUrl.replace(/\/$/, '')}/${basename(gzPath)}`,
      compressedBytes: compressed.byteLength,
      uncompressedBytes: uncompressed.byteLength,
      sha256Compressed: sha256Hex(compressed),
      sha256Uncompressed: sha256Hex(uncompressed),
      licenseSpdx: metadata.licenseSpdx.trim(),
    },
  };
}
