// Node implementation of the Core `PackInstallerAdapter` contract (B3 §4.3).
//
// Stands in for the on-device file + R2 download primitives used by the Content Pack
// Manager (FR-105). `download` treats the URL as a local file path (a test-only R2 stand-in)
// and `availableDiskSpaceBytes` is settable so the `PACK_STORAGE_FULL` path is reproducible.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import type { PackInstallPaths, PackInstallerAdapter } from '../../src/adapters';

export interface NodePackInstallerOptions {
  /** Directory installed packs live in (created on demand). */
  rootDir: string;
  /** Injected free-space figure, default 1 GiB. */
  availableBytes?: number;
  /** When set, `download` rejects with this error (network-drop simulation). */
  downloadError?: Error;
}

export class NodePackInstallerAdapter implements PackInstallerAdapter {
  private readonly rootDir: string;
  private availableBytes: number;
  private downloadError: Error | undefined;

  constructor(options: NodePackInstallerOptions) {
    this.rootDir = options.rootDir;
    this.availableBytes = options.availableBytes ?? 1024 * 1024 * 1024;
    this.downloadError = options.downloadError;
  }

  setAvailableBytes(bytes: number): void {
    this.availableBytes = bytes;
  }

  setDownloadError(error: Error | undefined): void {
    this.downloadError = error;
  }

  async resolvePaths(packId: string, contentVersion: string): Promise<PackInstallPaths> {
    mkdirSync(this.rootDir, { recursive: true });
    const installed = `${this.rootDir}/${packId}-${contentVersion}.sqlite`;
    return {
      directory: this.rootDir,
      installed,
      tempDownload: `${installed}.gz.tmp`,
      tempExtract: `${installed}.tmp`,
    };
  }

  async download(url: string, destPath: string, onProgress?: (receivedBytes: number) => void): Promise<void> {
    if (this.downloadError !== undefined) {
      throw this.downloadError;
    }
    const bytes = readFileSync(url);
    writeFileSync(destPath, bytes);
    onProgress?.(bytes.byteLength);
  }

  async sha256HexFile(path: string): Promise<string> {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  async gunzip(srcGzPath: string, destPath: string): Promise<void> {
    writeFileSync(destPath, gunzipSync(readFileSync(srcGzPath)));
  }

  async fileSizeBytes(path: string): Promise<number> {
    return statSync(path).size;
  }

  async removeFile(path: string): Promise<void> {
    rmSync(path, { force: true });
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    renameSync(fromPath, toPath);
  }

  async availableDiskSpaceBytes(): Promise<number> {
    return this.availableBytes;
  }
}
