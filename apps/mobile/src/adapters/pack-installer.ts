// PackInstallerAdapter — FR-105 download/verify file primitives over expo-file-system
// (B3 §4.3, B4 §4.6).
//
// The HTTPS transfer runs on the native URL session (`File.downloadFileAsync`), streaming into the
// scratch `.gz`; decompression uses `fflate` (a pure-JS inflate — the device has no zlib), the
// atomic swap / integrity / disk-space probes are `File`/`Directory` primitives, and SHA-256 runs
// through the native streaming `File.digest` (so the ~19 MB pack never lands in the JS heap).

import { Directory, File, Paths } from 'expo-file-system';
import { gunzipSync } from 'fflate';
import {
  asAppError,
  type AppErrorFallback,
  type PackInstallPaths,
  type PackInstallerAdapter,
} from '@breath-and-word/core';

const FALLBACK: AppErrorFallback = {
  code: 'PACK_INTEGRITY_FAILED',
  domain: 'PACK',
  retryPolicy: 'USER_ACTION',
  userMessage: 'The content pack could not be installed.',
};

const DOWNLOAD_FALLBACK: AppErrorFallback = {
  code: 'PACK_DOWNLOAD_INTERRUPTED',
  domain: 'PACK',
  retryPolicy: 'EXPONENTIAL_BACKOFF',
  userMessage: 'The download was interrupted. It will resume when you are back online.',
};

/** Map any filesystem failure onto the canonical `AppError` taxonomy (AGENTS.md rule 7). */
function wrap<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    throw asAppError(error, FALLBACK);
  });
}

/** Make sure the file's containing directory exists before any write/move into it. */
function ensureParent(file: File): void {
  const parent = file.parentDirectory;
  if (!parent.exists) {
    parent.create({ intermediates: true, idempotent: true });
  }
}

export function createPackInstallerAdapter(): PackInstallerAdapter {
  return {
    async resolvePaths(packId, contentVersion): Promise<PackInstallPaths> {
      const packsDir = new Directory(Paths.document, 'packs');
      // The installed-pack directory MUST exist before install: the core atomic swap moves the
      // staging file into it, and `File.move` throws `DestinationDoesNotExistException` when the
      // destination's parent directory is missing. `Directory.create` is idempotent.
      if (!packsDir.exists) {
        packsDir.create({ intermediates: true, idempotent: true });
      }
      const stagingDir = new Directory(Paths.cache, 'pack-install');
      const fileName = `${packId}-${contentVersion}.sqlite`;
      return {
        directory: packsDir.uri,
        installed: new File(packsDir, fileName).uri,
        tempDownload: new File(stagingDir, `${fileName}.gz`).uri,
        tempExtract: new File(stagingDir, fileName).uri,
      };
    },

    async download(url, destPath, onProgress): Promise<void> {
      const dest = new File(destPath);
      try {
        ensureParent(dest);
        // Start from a clean scratch file so a fresh attempt never resumes a stale partial.
        if (dest.exists) dest.delete();
        await File.downloadFileAsync(url, dest, {
          idempotent: true,
          onProgress: (progress) => onProgress?.(progress.bytesWritten),
        });
      } catch (cause) {
        throw asAppError(cause, DOWNLOAD_FALLBACK);
      }
    },

    async sha256HexFile(path): Promise<string> {
      // Native streaming digest (64 KB buffer, `MessageDigest`) — the ~19 MB uncompressed pack
      // never crosses the JS bridge, so verification cannot stall the way a full-file `bytes()` +
      // JS hash did.
      return wrap(() => new File(path).digest('SHA-256'));
    },

    async gunzip(srcGzPath, destPath): Promise<void> {
      await wrap(async () => {
        const bytes = await new File(srcGzPath).bytes();
        const out = gunzipSync(bytes);
        const dest = new File(destPath);
        ensureParent(dest);
        if (dest.exists) dest.delete();
        await dest.write(out);
      });
    },

    async fileSizeBytes(path): Promise<number> {
      return wrap(async () => new File(path).size);
    },

    async removeFile(path): Promise<void> {
      await wrap(async () => {
        const file = new File(path);
        if (file.exists) file.delete();
      });
    },

    async rename(fromPath, toPath): Promise<void> {
      await wrap(async () => {
        await new File(fromPath).move(new File(toPath), { overwrite: true });
      });
    },

    async availableDiskSpaceBytes(): Promise<number> {
      // expo-file-system reports the device's free space, not a per-directory quota.
      return wrap(async () => Paths.availableDiskSpace);
    },
  };
}
