// B3 §4.1 / §4.5 — the Tauri command layer over the `rusqlite` `ContentDb`.
//
// The WebView reaches these through `invoke(...)`; the TypeScript `ContentDbAdapter` in
// `apps/desktop/src/adapters` forwards to them so `packages/core` stays platform-agnostic.
// `query_content_db` is the Gate-1 Spike 2 command named in B3 §4.5.

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::content_db::{ContentDb, ContentDbError, SearchHit};
use crate::device_db::{DeviceDb, DeviceDbError};
use crate::pack_io::{self, PackInstallPaths, PackIoError};

/// The single read-only content connection the shell manages (B3 §4.3 `ContentDbAdapter`).
pub struct ContentDbState(pub Mutex<ContentDb>);

/// The writable `local_device.sqlite` connection (B4 §4.4, `LocalDeviceAdapter`).
pub struct LocalDeviceState(pub Mutex<DeviceDb>);

/// The writable `user_data.sqlite` connection (`UserDbAdapter`; pre-PowerSync desktop backing).
pub struct UserDataState(pub Mutex<DeviceDb>);

/// Serialisable failure envelope returned to the WebView. The TypeScript adapter maps `code`
/// onto the canonical `C3` `AppError` taxonomy; raw SQL text never crosses the boundary.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<ContentDbError> for CommandError {
    fn from(err: ContentDbError) -> Self {
        Self {
            code: "DB_OPERATION_FAILED",
            message: err.to_string(),
        }
    }
}

impl From<PackIoError> for CommandError {
    fn from(err: PackIoError) -> Self {
        Self {
            code: "PACK_INTEGRITY_FAILED",
            message: err.to_string(),
        }
    }
}

impl From<DeviceDbError> for CommandError {
    fn from(err: DeviceDbError) -> Self {
        Self {
            code: "DB_OPERATION_FAILED",
            message: err.to_string(),
        }
    }
}

fn locked() -> CommandError {
    CommandError {
        code: "DB_OPERATION_FAILED",
        message: "content DB lock poisoned".to_string(),
    }
}

fn locked_device(name: &str) -> CommandError {
    CommandError {
        code: "DB_OPERATION_FAILED",
        message: format!("{name} lock poisoned"),
    }
}

/// `ATTACH DATABASE` a validated, on-disk pack under its namespaced schema.
#[tauri::command]
pub fn attach_content_pack(
    state: State<'_, ContentDbState>,
    pack_id: String,
    absolute_path: String,
) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked())?;
    db.attach_pack(&pack_id, Path::new(&absolute_path))
        .map_err(CommandError::from)
}

/// `DETACH DATABASE` an attached pack.
#[tauri::command]
pub fn detach_content_pack(
    state: State<'_, ContentDbState>,
    pack_id: String,
) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked())?;
    db.detach_pack(&pack_id).map_err(CommandError::from)
}

/// The namespaced schemas currently attached (excludes `main` / `temp`).
#[tauri::command]
pub fn list_attached_packs(state: State<'_, ContentDbState>) -> Result<Vec<String>, CommandError> {
    let db = state.0.lock().map_err(|_| locked())?;
    db.attached_packs().map_err(CommandError::from)
}

/// `PRAGMA <pack>.integrity_check` — the Content Pack Manager's pre-commit gate.
#[tauri::command]
pub fn check_content_pack_integrity(
    state: State<'_, ContentDbState>,
    pack_id: String,
) -> Result<bool, CommandError> {
    let db = state.0.lock().map_err(|_| locked())?;
    db.integrity_check(&pack_id).map_err(CommandError::from)
}

/// FR-103 — offline FTS5 search ranked by relevance (Gate-1 Spike 2 `query_content_db`).
#[tauri::command]
pub fn query_content_db(
    state: State<'_, ContentDbState>,
    pack_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, CommandError> {
    let db = state.0.lock().map_err(|_| locked())?;
    db.search(&pack_id, &query, limit.unwrap_or(50))
        .map_err(CommandError::from)
}

/// Generic read-only parameterised query backing `ContentDbAdapter.query` (B3 §4.3).
///
/// The SQL originates in `packages/core`'s repositories (never in a screen), and the native
/// side refuses anything that is not a read-only statement.
#[tauri::command]
pub fn run_content_query(
    state: State<'_, ContentDbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, CommandError> {
    let db = state.0.lock().map_err(|_| locked())?;
    db.run_query(&sql, &params).map_err(CommandError::from)
}

// --- FR-105 pack file I/O (B3 §4.1 `pack_io`, B4 §4.6 atomic swap) ---------------------------
//
// The TypeScript `PackInstallerAdapter` in `apps/desktop/src/adapters` forwards here. Every
// path is absolute and supplied by the adapter; the app data directory is resolved natively.

/// Resolve (and create) the install paths for one pack version under the app data directory.
#[tauri::command]
pub fn resolve_pack_paths(
    app: AppHandle,
    pack_id: String,
    content_version: String,
) -> Result<PackInstallPaths, CommandError> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(path_error)?
        .join("packs");
    pack_io::resolve_pack_paths(&base, &pack_id, &content_version).map_err(CommandError::from)
}

/// Byte length of an installed (or staged) pack file.
#[tauri::command]
pub fn pack_file_size(path: String) -> Result<u64, CommandError> {
    pack_io::file_size_bytes(Path::new(&path)).map_err(CommandError::from)
}

/// Remove a scratch/installed pack file (idempotent — a missing file is not an error).
#[tauri::command]
pub fn pack_remove_file(path: String) -> Result<(), CommandError> {
    pack_io::remove_file(Path::new(&path)).map_err(CommandError::from)
}

/// Atomic same-filesystem replace for the `.tmp` -> installed swap.
#[tauri::command]
pub fn pack_rename(from_path: String, to_path: String) -> Result<(), CommandError> {
    pack_io::rename(Path::new(&from_path), Path::new(&to_path)).map_err(CommandError::from)
}

/// Decompress a `.sqlite.gz` pack; returns the uncompressed byte count.
#[tauri::command]
pub fn pack_gunzip(src_path: String, dest_path: String) -> Result<u64, CommandError> {
    pack_io::gunzip(Path::new(&src_path), Path::new(&dest_path)).map_err(CommandError::from)
}

/// Lowercase hex SHA-256 of a file (compressed or decompressed pack verification).
#[tauri::command]
pub fn pack_sha256(path: String) -> Result<String, CommandError> {
    pack_io::sha256_file(Path::new(&path)).map_err(CommandError::from)
}

/// Free bytes on the filesystem holding `directory` (B4 §4.6 2x headroom check).
#[tauri::command]
pub fn pack_available_disk_space(directory: String) -> Result<u64, CommandError> {
    pack_io::available_disk_space(Path::new(&directory)).map_err(CommandError::from)
}

/// Read a whole pack file into memory; the response is a raw `ArrayBuffer`, not JSON.
///
/// Kept as a general binary file-read primitive for the pack tooling; the pack verify path uses
/// the streaming `pack_sha256` instead so a ~19 MB pack never crosses the IPC bridge.
#[tauri::command]
pub fn pack_read_file(path: String) -> Result<tauri::ipc::Response, CommandError> {
    pack_io::read_file_bytes(Path::new(&path))
        .map(tauri::ipc::Response::new)
        .map_err(CommandError::from)
}

/// Create (or truncate) the scratch `.gz` so a fresh download starts clean.
#[tauri::command]
pub fn pack_create_file(path: String) -> Result<(), CommandError> {
    pack_io::create_file(Path::new(&path)).map_err(CommandError::from)
}

/// Append one WebView-downloaded chunk to the scratch `.gz`; returns the new total size.
#[tauri::command]
pub fn pack_append_bytes(path: String, bytes: Vec<u8>) -> Result<u64, CommandError> {
    pack_io::append_bytes(Path::new(&path), &bytes).map_err(CommandError::from)
}

// --- local_device.sqlite (B4 §4.4 `LocalDeviceAdapter`) --------------------------------------
//
// The local-only, never-synced device DB: installed packs, audio LRU cache, ESV ephemeral cache
// and workspace layout. The WebView `LocalDeviceAdapter` forwards here; `packages/core` owns the
// DDL (`LOCAL_DEVICE_DDL`) and every query.

#[tauri::command]
pub fn local_device_execute(
    state: State<'_, LocalDeviceState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<u64, CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("local device DB"))?;
    db.execute(&sql, &params).map_err(CommandError::from)
}

#[tauri::command]
pub fn local_device_query(
    state: State<'_, LocalDeviceState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("local device DB"))?;
    db.query(&sql, &params).map_err(CommandError::from)
}

/// Multi-statement script (no parameters) — the one-time `LOCAL_DEVICE_DDL` bootstrap.
#[tauri::command]
pub fn local_device_execute_batch(
    state: State<'_, LocalDeviceState>,
    sql: String,
) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("local device DB"))?;
    db.execute_batch(&sql).map_err(CommandError::from)
}

// --- user_data.sqlite (B4 §4.3 `UserDbAdapter`, pre-PowerSync desktop backing) ---------------

#[tauri::command]
pub fn user_data_execute(
    state: State<'_, UserDataState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<u64, CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("user data DB"))?;
    db.execute(&sql, &params).map_err(CommandError::from)
}

#[tauri::command]
pub fn user_data_query(
    state: State<'_, UserDataState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("user data DB"))?;
    db.query(&sql, &params).map_err(CommandError::from)
}

/// Multi-statement script (no parameters) — the one-time `USER_DATA_DDL` bootstrap.
#[tauri::command]
pub fn user_data_execute_batch(
    state: State<'_, UserDataState>,
    sql: String,
) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("user data DB"))?;
    db.execute_batch(&sql).map_err(CommandError::from)
}

/// `BEGIN IMMEDIATE` for `UserDbAdapter.writeTransaction` (B3 §4.3).
#[tauri::command]
pub fn user_data_begin(state: State<'_, UserDataState>) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("user data DB"))?;
    db.begin().map_err(CommandError::from)
}

#[tauri::command]
pub fn user_data_commit(state: State<'_, UserDataState>) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("user data DB"))?;
    db.commit().map_err(CommandError::from)
}

#[tauri::command]
pub fn user_data_rollback(state: State<'_, UserDataState>) -> Result<(), CommandError> {
    let db = state.0.lock().map_err(|_| locked_device("user data DB"))?;
    db.rollback().map_err(CommandError::from)
}

fn path_error(err: tauri::Error) -> CommandError {
    CommandError {
        code: "PACK_INTEGRITY_FAILED",
        message: err.to_string(),
    }
}
