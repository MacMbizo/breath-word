// B3 §4.3 — Core platform adapter contracts.
// packages/core depends ONLY on these interfaces; each app injects concrete
// platform implementations at boot via initCoreRuntime(adapters).

export interface SqlQueryResult<T = Record<string, unknown>> {
  rows: T[];
}

/** Read-only adapter for modular bible_content/*.sqlite packs (op-sqlite on Mobile; Rust rusqlite on Tauri) */
export interface ContentDbAdapter {
  attachPack(packId: string, absolutePath: string): Promise<void>;
  detachPack(packId: string): Promise<void>;
  getAttachedPacks(): Promise<string[]>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

/** Synced read/write adapter for user_data.sqlite (@powersync/react-native on Mobile; @powersync/web on Desktop/Web) */
export interface UserDbAdapter {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  writeTransaction<T>(fn: (tx: Pick<UserDbAdapter, 'execute' | 'query'>) => Promise<T>): Promise<T>;
  watch<T>(sql: string, params: unknown[], onChange: (rows: T[]) => void): () => void;
}

/** Local-only, never-synced device database (B4 §4.4 `local_device.sqlite`; node:sqlite / op-sqlite / rusqlite). */
export interface LocalDeviceAdapter {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

/** Resolved absolute paths for one pack install (B4 §4.6 atomic swap). */
export interface PackInstallPaths {
  /** Directory holding installed `.sqlite` packs (created if missing). */
  readonly directory: string;
  /** Final installed `.sqlite` path for this pack version. */
  readonly installed: string;
  /** Scratch path for the in-flight `*.sqlite.gz` download. */
  readonly tempDownload: string;
  /** Scratch path for the decompressed staging `.sqlite`. */
  readonly tempExtract: string;
}

/** Platform file/network primitives for the Content Pack Manager (FR-105, B4 §4.6). */
export interface PackInstallerAdapter {
  /** Resolve install paths for a pack version, ensuring `directory` exists. */
  resolvePaths(packId: string, contentVersion: string): Promise<PackInstallPaths>;
  /** Fetch `url` into `destPath`; keep the partial file on failure for HTTP `Range` resume. */
  download(url: string, destPath: string, onProgress?: (receivedBytes: number) => void): Promise<void>;
  readFileBytes(path: string): Promise<Uint8Array>;
  gunzip(srcGzPath: string, destPath: string): Promise<void>;
  fileSizeBytes(path: string): Promise<number>;
  removeFile(path: string): Promise<void>;
  /** Atomic replace on the same filesystem (used for the `.tmp` -> installed swap). */
  rename(fromPath: string, toPath: string): Promise<void>;
  /** Free device disk space in bytes; the 2x uncompressed headroom check (B4 §4.6). */
  availableDiskSpaceBytes(directory: string): Promise<number>;
}

/** Platform-native CSPRNG & WebCrypto primitives (react-native-quick-crypto / globalThis.crypto.subtle) */
export interface CryptoPrimitivesAdapter {
  randomBytes(length: number): Uint8Array;
  pbkdf2Sha256(
    passphrase: string,
    salt: Uint8Array,
    iterations: number,
    keyLengthBytes: number,
  ): Promise<Uint8Array>;
  aesGcmEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array>;
  aesGcmDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertextWithTag: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array>;
  sha256Hex(data: Uint8Array): Promise<string>;
}

/** Secure key storage for optional biometric vault unlock (expo-secure-store / OS Keychain via Tauri) */
export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/** Dual-track narration + ambient audio controller (TrackPlayer on Mobile; HTML5/WebAudio on Desktop) */
export interface AudioEngineAdapter {
  loadChapter(urlOrPath: string, title: string, subtitle: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(ms: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>; // 0.8 .. 2.0
  setAmbientTrack(trackId: 'none' | 'rain' | 'piano' | 'pad', volume: number): Promise<void>;
  setNarrationVolume(volume: number): Promise<void>;
  setSleepTimer(minutes: number | null): Promise<void>;
  onPositionUpdate(cb: (positionMs: number) => void): () => void;
}

/** All platform adapters injected into packages/core at boot. */
export interface CoreAdapters {
  contentDb: ContentDbAdapter;
  userDb: UserDbAdapter;
  localDevice: LocalDeviceAdapter;
  packInstaller: PackInstallerAdapter;
  crypto: CryptoPrimitivesAdapter;
  secureStorage: SecureStorageAdapter;
  audio: AudioEngineAdapter;
}
