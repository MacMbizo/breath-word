//! Breath & Word desktop (Tauri v2) native layer.
//!
//! B3 §4.1 places the Rust primitives the Tauri commands expose to the WebView in
//! `src-tauri/src/`. `packages/core` stays platform-agnostic and reaches these through the
//! injected `ContentDbAdapter` / `PackInstallerAdapter` (B3 §4.3).
//!
//! Landing status: the `rusqlite` content-DB module (`content_db`), the native pack file-I/O
//! layer (`pack_io`), the writable device-DB layer (`device_db`) and the Tauri command layer
//! (`commands`) are implemented. `content_db` is exercised by `tests/content_db.rs` (Gate-1
//! Spike 2 evidence), `pack_io` by `tests/pack_io.rs` and `device_db` by `tests/device_db.rs`.
//! The Vite + React frontend lands with the desktop UI milestone.

pub mod commands;
pub mod content_db;
pub mod device_db;
pub mod pack_io;
pub mod sql_json;

pub use content_db::{ContentDb, ContentDbError, SearchHit};
pub use device_db::{DeviceDb, DeviceDbError};
pub use pack_io::{PackInstallPaths, PackIoError};
