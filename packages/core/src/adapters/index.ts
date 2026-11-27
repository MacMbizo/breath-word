// B3 §4.3 — Core platform adapter contracts.
// packages/core depends ONLY on these interfaces; each app injects concrete
// platform implementations at boot via initCoreRuntime(adapters).

import type { PoolRole } from '../domain/types';

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
  /**
   * Lowercase hex SHA-256 of a file's contents, streamed natively (never buffering the whole
   * file into JS — a pack is ~19 MB uncompressed and a full-buffer copy stalls the JS bridge).
   */
  sha256HexFile(path: string): Promise<string>;
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

/** Options for `SecureStorageAdapter.setItem` (B6 §4.2.2). */
export interface SecureStorageSetOptions {
  /**
   * Ask the OS to gate this value behind a user-presence check (FaceID / TouchID / Windows Hello)
   * before it may be read back. Mobile's `expo-secure-store` honours it via `requireAuthentication`;
   * stores without a hardware gate ignore it.
   */
  readonly requireAuthentication?: boolean;
}

/** Secure key storage for optional biometric vault unlock (expo-secure-store / OS Keychain via Tauri) */
export interface SecureStorageAdapter {
  /**
   * Whether this store is a hardware-backed keystore safe to hold the raw vault DEK (B6 §4.2.2).
   * The desktop `localStorage` placeholder is `false`, so biometric fast-unlock stays unavailable
   * until its OS-Keychain implementation lands (B3 §4.1) — a raw DEK must never sit in plaintext.
   */
  readonly supportsBiometric: boolean;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string, options?: SecureStorageSetOptions): Promise<void>;
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

/** Snapshot of the PowerSync connection state surfaced to the offline pill (C2 §4.3). */
export interface SyncConnectionStatus {
  readonly connected: boolean;
  readonly uploading: boolean;
  readonly downloading: boolean;
  readonly lastSyncedAt?: string;
}

/** A synced-table write the upload connector dead-lettered on a fatal 400/403 (C2 §4.2). */
export interface RejectedMutation {
  readonly table: string;
  readonly rowId: string;
  readonly errorCode: string;
}

/** The signed-in identity surfaced to the core (C4 §4.1). Transport-free. */
export interface AuthSession {
  /** Supabase `auth.users.id` (uuid) that owns every migrated row after the upgrade. */
  readonly userId: string;
  readonly email: string | null;
}

/**
 * Auth transport seam (FR-206 / C4 §4.1). `packages/core` stays transport-free; each app injects a
 * concrete adapter over `@supabase/supabase-js` (`P2-14`). When omitted the device stays in
 * permanent Offline Guest Mode with no sign-in surface — an unprovisioned build never regresses.
 */
export interface AuthAdapter {
  /** The current session, or `null` while signed out (Offline Guest Mode). */
  getSession(): Promise<AuthSession | null>;
  /** Subscribe to sign-in / sign-out / token-refresh transitions; returns an unsubscribe. */
  onAuthStateChange(handler: (session: AuthSession | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<AuthSession>;
  signUpWithPassword(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
}

/**
 * Sync transport seam (FR-206). `packages/core` stays transport-free; each app injects a
 * concrete adapter over `@powersync/react-native` / `@powersync/web` (`P2-13`). The real
 * `connect()` is only ever reached once Supabase + PowerSync are provisioned (Plan §6), so
 * omitting this adapter leaves the app fully local with no regression.
 */
export interface SyncAdapter {
  getStatus(): SyncConnectionStatus;
  onStatusChange(handler: (status: SyncConnectionStatus) => void): () => void;
  /** Fatal upload errors (HTTP 400/403 RLS) the connector discarded so the queue never jams. */
  onMutationRejected(handler: (mutation: RejectedMutation) => void): () => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/** Result of joining a shared pool by its 8-char Crockford Base32 code (C4 §4.3). */
export interface JoinedPool {
  readonly poolId: string;
  readonly title: string;
  readonly role: PoolRole;
}

/**
 * Shared-pool transport seam (FR-202 / C4 §4.3–§4.4). `packages/core` stays transport-free; each
 * app injects a concrete adapter over the Supabase PostgREST RPCs `join_shared_pool_by_code` and
 * `rotate_pool_share_code`. When omitted the “Join by code” / share-code surfaces stay unavailable
 * (unprovisioned build — Plan §6) and the prayer store reports it candidly instead of throwing.
 */
export interface PoolShareAdapter {
  joinSharedPoolByCode(code: string): Promise<JoinedPool>;
  /**
   * Owner-only: mint a fresh 8-char Crockford Base32 share code server-side and flip the pool to
   * `SHARED`, returning the new code. The code is server-authoritative — the synced `share_code`
   * column only updates on the next checkpoint, so the caller surfaces the return value directly.
   */
  rotatePoolShareCode(poolId: string): Promise<string>;
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
  /**
   * Optional until WS4 provisioning lands (Plan §6); when absent, `initCoreRuntime` wires a
   * local-only stub so the sync store reports the offline state without any network calls.
   */
  sync?: SyncAdapter;
  /**
   * Optional sign-in transport (C4 §4.1). When absent the device stays in permanent Offline Guest
   * Mode — the account store reports `configured: false` and surfaces no sign-in actions.
   */
  auth?: AuthAdapter;
  /**
   * Optional shared-pool join transport (FR-202 / C4 §4.3). When absent the prayer store reports
   * `joinAvailable: false` and its `joinPool` action refuses without a network call (Plan §6).
   */
  poolShare?: PoolShareAdapter;
}
