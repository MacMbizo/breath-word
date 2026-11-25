// PackInstallerAdapter — FR-105 download/verify file primitives (B3 §4.3, B4 §4.6).
//
// The HTTPS transfer runs on the WebView `fetch` (the Tauri dependency tree builds `reqwest`
// without a TLS backend), streaming into the scratch `.gz` through `pack_create_file` /
// `pack_append_bytes`. Everything from verification onwards is native: `pack_gunzip`,
// `pack_sha256`/`pack_read_file`, `pack_rename` (the atomic swap) and `pack_available_disk_space`.

import { AppError, type AppErrorFallback, type PackInstallPaths, type PackInstallerAdapter } from '@breath-and-word/core';
import { callCommand, toAppError } from './invoke';

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

export function createPackInstallerAdapter(): PackInstallerAdapter {
  return {
    resolvePaths(packId, contentVersion): Promise<PackInstallPaths> {
      return callCommand<PackInstallPaths>(
        'resolve_pack_paths',
        { packId, contentVersion },
        FALLBACK,
      );
    },

    async download(url, destPath, onProgress): Promise<void> {
      // Start from a clean scratch file so a fresh attempt never appends to a stale partial.
      await callCommand('pack_create_file', { path: destPath }, FALLBACK);

      let response: Response;
      try {
        response = await fetch(url);
      } catch (cause) {
        throw toAppError(cause, DOWNLOAD_FALLBACK);
      }
      if (!response.ok) {
        throw new AppError({
          code: 'PACK_DOWNLOAD_INTERRUPTED',
          domain: 'PACK',
          retryPolicy: 'EXPONENTIAL_BACKOFF',
          userMessage: DOWNLOAD_FALLBACK.userMessage,
          internalDetail: `Pack download returned HTTP ${response.status}.`,
        });
      }

      const body = response.body;
      if (body === null) {
        // Streaming unsupported: buffer the whole body in one write.
        const bytes = new Uint8Array(await response.arrayBuffer());
        await callCommand('pack_append_bytes', { path: destPath, bytes: Array.from(bytes) }, FALLBACK);
        onProgress?.(bytes.byteLength);
        return;
      }

      const reader = body.getReader();
      let received = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value === undefined) continue;
          received += value.byteLength;
          // The path + chunk travel together as JSON; `Vec<u8>` accepts the number array.
          await callCommand('pack_append_bytes', { path: destPath, bytes: Array.from(value) }, FALLBACK);
          onProgress?.(received);
        }
      } finally {
        reader.releaseLock();
      }
    },

    async readFileBytes(path): Promise<Uint8Array> {
      // `pack_read_file` returns a raw `ArrayBuffer` (`tauri::ipc::Response`), no JSON inflation.
      const buffer = await callCommand<ArrayBuffer>('pack_read_file', { path }, FALLBACK);
      return new Uint8Array(buffer);
    },

    async gunzip(srcGzPath, destPath): Promise<void> {
      await callCommand<number>('pack_gunzip', { srcPath: srcGzPath, destPath }, FALLBACK);
    },

    fileSizeBytes(path): Promise<number> {
      return callCommand<number>('pack_file_size', { path }, FALLBACK);
    },

    async removeFile(path): Promise<void> {
      await callCommand('pack_remove_file', { path }, FALLBACK);
    },

    async rename(fromPath, toPath): Promise<void> {
      await callCommand('pack_rename', { fromPath, toPath }, FALLBACK);
    },

    availableDiskSpaceBytes(directory): Promise<number> {
      return callCommand<number>('pack_available_disk_space', { directory }, FALLBACK);
    },
  };
}
