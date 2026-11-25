// FR-105 Content Pack Manager (B4 §4.4 / §4.6, C3 pack error codes).
//
// Owns the download -> verify -> atomic-attach lifecycle for modular content packs and
// the `installed_packs` bookkeeping in `local_device.sqlite`. Per AGENTS.md rule 1 this
// is the only place content-pack + installed-pack SQL may live; UI apps never write SQL.
//
// Atomic update protocol (B4 §4.6):
//   download *.tmp -> verify SHA-256 (compressed) -> gunzip -> verify SHA-256 (uncompressed)
//   -> PRAGMA integrity_check on a staging attach -> DETACH old -> rename staging into place
//   -> ATTACH new -> upsert installed_packs -> drop the superseded file.

import type {
  ContentDbAdapter,
  CryptoPrimitivesAdapter,
  LocalDeviceAdapter,
  PackInstallerAdapter,
} from '../adapters';
import type { ManifestPackEntry } from '../content/pack-manifest';
import { PACK_SCHEMA_VERSION } from '../content/pack-schema';
import type { PackType } from '../domain/types';
import { AppError } from '../errors/AppError';

/** Scratch SQLite schema used to integrity-check a pack before it is attached for real. */
const STAGING_SCHEMA = 'pack_staging';

/** B4 §4.6 — require 2x the uncompressed size free before installing. */
const STORAGE_HEADROOM_MULTIPLIER = 2;

export interface InstalledPack {
  readonly packId: string;
  readonly packType: PackType;
  readonly contentVersion: string;
  readonly schemaVersion: number;
  readonly filePath: string;
  readonly sha256: string;
  readonly fileSizeBytes: number;
  readonly installedAt: string;
}

export type PackInstallPhase = 'downloading' | 'verifying' | 'extracting' | 'attaching';

/** Progress callback for FR-105 progress bars (`totalBytes` is the manifest's expected size). */
export type PackInstallProgress = (
  phase: PackInstallPhase,
  receivedBytes: number,
  totalBytes: number,
) => void;

export interface PackManagerOptions {
  readonly contentDb: ContentDbAdapter;
  readonly localDevice: LocalDeviceAdapter;
  readonly installer: PackInstallerAdapter;
  readonly crypto: Pick<CryptoPrimitivesAdapter, 'sha256Hex'>;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

interface InstalledPackRow {
  pack_id: string;
  pack_type: string;
  content_version: string;
  schema_version: number;
  file_path: string;
  sha256: string;
  file_size_bytes: number;
  installed_at: string;
}

/**
 * FR-105 — download, verify, attach, update and remove modular content packs.
 * One instance is reused for the whole session.
 */
export class PackManagerRepository {
  private readonly contentDb: ContentDbAdapter;
  private readonly localDevice: LocalDeviceAdapter;
  private readonly installer: PackInstallerAdapter;
  private readonly crypto: Pick<CryptoPrimitivesAdapter, 'sha256Hex'>;
  private readonly now: () => number;

  constructor(options: PackManagerOptions) {
    this.contentDb = options.contentDb;
    this.localDevice = options.localDevice;
    this.installer = options.installer;
    this.crypto = options.crypto;
    this.now = options.now ?? Date.now;
  }

  /** Every installed pack, ordered by id (FR-105 storage totals / version switcher). */
  async listInstalled(): Promise<InstalledPack[]> {
    const { rows } = await this.localDevice.query<InstalledPackRow>(
      `SELECT pack_id, pack_type, content_version, schema_version, file_path, sha256, file_size_bytes, installed_at
         FROM installed_packs
        ORDER BY pack_id ASC`,
    );
    return rows.map(toInstalledPack);
  }

  async getInstalled(packId: string): Promise<InstalledPack | null> {
    const { rows } = await this.localDevice.query<InstalledPackRow>(
      `SELECT pack_id, pack_type, content_version, schema_version, file_path, sha256, file_size_bytes, installed_at
         FROM installed_packs
        WHERE pack_id = ?`,
      [packId],
    );
    const row = rows[0];
    return row === undefined ? null : toInstalledPack(row);
  }

  /** Sum of installed pack sizes in bytes — the "offline storage total" in FR-105. */
  async storageUsageBytes(): Promise<number> {
    const { rows } = await this.localDevice.query<{ total: number | null }>(
      `SELECT COALESCE(SUM(file_size_bytes), 0) AS total FROM installed_packs`,
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Boot step — re-attach every pack recorded in `installed_packs` to the content DB
   * (B4 §4.6). `ATTACH DATABASE` is per-connection, so a cold start has to restore the
   * previously downloaded packs before the reader can serve them (B7 cold-start-to-readable).
   * Packs already attached are left untouched; returns the ids attached by this call.
   */
  async attachInstalledPacks(): Promise<string[]> {
    const installed = await this.listInstalled();
    const attached = new Set(await this.contentDb.getAttachedPacks());
    const reattached: string[] = [];
    for (const pack of installed) {
      if (attached.has(pack.packId)) {
        continue;
      }
      await this.contentDb.attachPack(pack.packId, pack.filePath);
      reattached.push(pack.packId);
    }
    return reattached;
  }

  /** FR-105 — install a pack that is not on the device yet. */
  async install(entry: ManifestPackEntry, onProgress?: PackInstallProgress): Promise<InstalledPack> {
    return this.applyPack(entry, onProgress);
  }

  /**
   * FR-105 — install a newer version over an existing pack. Same atomic swap as `install`;
   * the previous `.sqlite` is only removed once the new pack is attached.
   */
  async update(entry: ManifestPackEntry, onProgress?: PackInstallProgress): Promise<InstalledPack> {
    return this.applyPack(entry, onProgress);
  }

  /** FR-105 — detach, delete the pack file, and forget its `installed_packs` row. */
  async remove(packId: string): Promise<void> {
    const installed = await this.getInstalled(packId);
    if (installed === null) {
      return;
    }

    const attached = await this.contentDb.getAttachedPacks();
    if (attached.includes(packId)) {
      await this.contentDb.detachPack(packId);
    }
    await this.safeRemove(installed.filePath);
    // `installed_packs` lives in the local-only, never-synced DB, so a hard DELETE is correct here.
    await this.localDevice.execute('DELETE FROM installed_packs WHERE pack_id = ?', [packId]);
  }

  private async applyPack(
    entry: ManifestPackEntry,
    onProgress?: PackInstallProgress,
  ): Promise<InstalledPack> {
    this.assertSchemaCompatible(entry);

    const paths = await this.installer.resolvePaths(entry.packId, entry.contentVersion);
    const freeBytes = await this.installer.availableDiskSpaceBytes(paths.directory);
    if (freeBytes < entry.uncompressedBytes * STORAGE_HEADROOM_MULTIPLIER) {
      throw storageFull(entry, freeBytes);
    }

    onProgress?.('downloading', 0, entry.compressedBytes);
    try {
      await this.installer.download(entry.downloadUrl, paths.tempDownload, (received) =>
        onProgress?.('downloading', received, entry.compressedBytes),
      );
    } catch (cause) {
      // Keep the partial `.tmp` so the next attempt can resume via HTTP Range (C3).
      throw downloadInterrupted(entry, cause);
    }

    onProgress?.('verifying', 0, entry.compressedBytes);
    const compressedHash = await this.crypto.sha256Hex(
      await this.installer.readFileBytes(paths.tempDownload),
    );
    if (compressedHash !== entry.sha256Compressed) {
      await this.safeRemove(paths.tempDownload);
      throw checksumMismatch(entry, 'compressed');
    }

    onProgress?.('extracting', 0, entry.uncompressedBytes);
    try {
      await this.installer.gunzip(paths.tempDownload, paths.tempExtract);
    } catch (cause) {
      await this.safeRemove(paths.tempExtract);
      throw integrityFailed(entry, 'gzip stream could not be decompressed', cause);
    }

    const uncompressedHash = await this.crypto.sha256Hex(
      await this.installer.readFileBytes(paths.tempExtract),
    );
    if (uncompressedHash !== entry.sha256Uncompressed) {
      await this.safeRemove(paths.tempExtract);
      throw checksumMismatch(entry, 'uncompressed');
    }

    await this.assertStagedPack(entry, paths.tempExtract);

    onProgress?.('attaching', 0, entry.uncompressedBytes);
    const previous = await this.getInstalled(entry.packId);
    await this.swapIn(entry, paths.installed, paths.tempExtract, previous);

    const fileSizeBytes = await this.installer.fileSizeBytes(paths.installed);
    const installedAt = new Date(this.now()).toISOString();
    await this.upsertInstalled({
      pack_id: entry.packId,
      pack_type: entry.packType,
      content_version: entry.contentVersion,
      schema_version: entry.schemaVersion,
      file_path: paths.installed,
      sha256: entry.sha256Uncompressed,
      file_size_bytes: fileSizeBytes,
      installed_at: installedAt,
    });

    await this.safeRemove(paths.tempDownload);
    if (previous !== null && previous.filePath !== paths.installed) {
      await this.safeRemove(previous.filePath);
    }

    return {
      packId: entry.packId,
      packType: entry.packType,
      contentVersion: entry.contentVersion,
      schemaVersion: entry.schemaVersion,
      filePath: paths.installed,
      sha256: entry.sha256Uncompressed,
      fileSizeBytes,
      installedAt,
    };
  }

  private assertSchemaCompatible(entry: ManifestPackEntry): void {
    if (entry.schemaVersion > PACK_SCHEMA_VERSION) {
      throw new AppError({
        code: 'PACK_SCHEMA_INCOMPATIBLE',
        domain: 'PACK',
        retryPolicy: 'USER_ACTION',
        userMessage: 'Please update Breath & Word to install this pack update.',
        internalDetail: `Pack "${entry.packId}" needs schema v${entry.schemaVersion}, app supports v${PACK_SCHEMA_VERSION}.`,
      });
    }
  }

  /** Attach the staging file under a scratch schema and verify it before committing. */
  private async assertStagedPack(entry: ManifestPackEntry, stagingPath: string): Promise<void> {
    try {
      await this.contentDb.attachPack(STAGING_SCHEMA, stagingPath);
    } catch (cause) {
      await this.safeRemove(stagingPath);
      throw integrityFailed(entry, 'staged pack could not be opened', cause);
    }

    let failure: unknown = null;
    try {
      const check = await this.contentDb.query<Record<string, unknown>>(
        `PRAGMA ${STAGING_SCHEMA}.integrity_check`,
      );
      const verdict = Object.values(check.rows[0] ?? {})[0];
      if (verdict !== 'ok') {
        throw integrityFailed(entry, `integrity_check returned "${String(verdict)}"`);
      }

      const meta = await this.contentDb.query<{ pack_id: string; schema_version: number }>(
        `SELECT pack_id, schema_version FROM ${STAGING_SCHEMA}.pack_metadata`,
      );
      const row = meta.rows[0];
      if (row === undefined) {
        throw integrityFailed(entry, 'pack_metadata missing');
      }
      if (row.pack_id !== entry.packId) {
        throw integrityFailed(entry, `pack_metadata.pack_id "${row.pack_id}" != manifest "${entry.packId}"`);
      }
      if (row.schema_version !== entry.schemaVersion) {
        throw integrityFailed(entry, `schema_version ${row.schema_version} != manifest ${entry.schemaVersion}`);
      }
    } catch (cause) {
      failure = cause;
    }

    // Always detach before touching the staging file on disk.
    await this.contentDb.detachPack(STAGING_SCHEMA);
    if (failure !== null) {
      await this.safeRemove(stagingPath);
      throw failure;
    }
  }

  /** DETACH old -> atomic rename -> ATTACH new, with rollback to the previous file on failure. */
  private async swapIn(
    entry: ManifestPackEntry,
    installedPath: string,
    stagingPath: string,
    previous: InstalledPack | null,
  ): Promise<void> {
    const attached = await this.contentDb.getAttachedPacks();
    if (attached.includes(entry.packId)) {
      await this.contentDb.detachPack(entry.packId);
    }

    try {
      await this.installer.rename(stagingPath, installedPath);
      await this.contentDb.attachPack(entry.packId, installedPath);
    } catch (cause) {
      await this.safeRemove(installedPath);
      await this.safeRemove(stagingPath);
      if (previous !== null) {
        try {
          await this.contentDb.attachPack(entry.packId, previous.filePath);
        } catch {
          // Best-effort rollback; the installed_packs row still points at the previous file.
        }
      }
      throw integrityFailed(entry, 'atomic pack swap failed', cause);
    }
  }

  private async upsertInstalled(row: InstalledPackRow): Promise<void> {
    await this.localDevice.execute(
      `INSERT INTO installed_packs
         (pack_id, pack_type, content_version, schema_version, file_path, sha256, file_size_bytes, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pack_id) DO UPDATE SET
         pack_type = excluded.pack_type,
         content_version = excluded.content_version,
         schema_version = excluded.schema_version,
         file_path = excluded.file_path,
         sha256 = excluded.sha256,
         file_size_bytes = excluded.file_size_bytes,
         installed_at = excluded.installed_at`,
      [
        row.pack_id,
        row.pack_type,
        row.content_version,
        row.schema_version,
        row.file_path,
        row.sha256,
        row.file_size_bytes,
        row.installed_at,
      ],
    );
  }

  private async safeRemove(path: string): Promise<void> {
    try {
      await this.installer.removeFile(path);
    } catch {
      // Cleanup is best-effort; a leftover scratch file is harmless.
    }
  }
}

function toInstalledPack(row: InstalledPackRow): InstalledPack {
  return {
    packId: row.pack_id,
    packType: row.pack_type as PackType,
    contentVersion: row.content_version,
    schemaVersion: row.schema_version,
    filePath: row.file_path,
    sha256: row.sha256,
    fileSizeBytes: row.file_size_bytes,
    installedAt: row.installed_at,
  };
}

function storageFull(entry: ManifestPackEntry, freeBytes: number): AppError {
  const requiredBytes = entry.uncompressedBytes * STORAGE_HEADROOM_MULTIPLIER;
  return new AppError({
    code: 'PACK_STORAGE_FULL',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'There is not enough free space to install this pack.',
    internalDetail: `Pack "${entry.packId}" needs ${requiredBytes} bytes free, device has ${freeBytes}.`,
  });
}

function downloadInterrupted(entry: ManifestPackEntry, cause: unknown): AppError {
  return new AppError({
    code: 'PACK_DOWNLOAD_INTERRUPTED',
    domain: 'PACK',
    retryPolicy: 'EXPONENTIAL_BACKOFF',
    userMessage: 'The download was interrupted. It will resume when you are back online.',
    internalDetail: `Download of "${entry.packId}" from ${entry.downloadUrl} failed.`,
    cause,
  });
}

function checksumMismatch(entry: ManifestPackEntry, stage: 'compressed' | 'uncompressed'): AppError {
  return new AppError({
    code: 'PACK_CHECKSUM_MISMATCH',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'The downloaded pack was corrupted in transit. Please retry the download.',
    internalDetail: `SHA-256 mismatch on the ${stage} pack for "${entry.packId}".`,
  });
}

function integrityFailed(entry: ManifestPackEntry, detail: string, cause?: unknown): AppError {
  return new AppError({
    code: 'PACK_INTEGRITY_FAILED',
    domain: 'PACK',
    retryPolicy: 'USER_ACTION',
    userMessage: 'The downloaded pack could not be verified.',
    internalDetail: `Pack "${entry.packId}": ${detail}.`,
    cause,
  });
}
