// B3 §4.1 — the desktop (Tauri v2) native pack file-I/O layer.
//
// Backs the file half of the `PackInstallerAdapter` contract (B3 §4.3) that
// `PackManagerRepository` drives for FR-105: resolve the on-disk install paths, gunzip the
// `.sqlite.gz`, verify the SHA-256 of the compressed and decompressed files, check free space,
// and perform the atomic `.tmp` -> installed swap (B4 §4.6). Doing these in Rust keeps the
// 30 MB pack off the WebView IPC bridge and lets the rename be a true same-filesystem atomic
// replace.
//
// The network transfer itself is NOT here: the current Tauri dependency tree builds `reqwest`
// without a TLS backend, so the WebView performs the HTTPS `fetch` into `tempDownload` and the
// Rust side owns everything from verification onwards.

use std::fmt;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

/// Resolved absolute paths for one pack install — the Rust mirror of the TypeScript
/// `PackInstallPaths` (B3 §4.3). Serialised `camelCase` so the WebView adapter reads it verbatim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInstallPaths {
    /// Directory holding installed `.sqlite` packs (created if missing).
    pub directory: String,
    /// Final installed `.sqlite` path for this pack version.
    pub installed: String,
    /// Scratch path for the in-flight `*.sqlite.gz` download (kept on failure for resume).
    pub temp_download: String,
    /// Scratch path for the decompressed staging `.sqlite`.
    pub temp_extract: String,
}

#[derive(Debug)]
pub enum PackIoError {
    Io(std::io::Error),
    InvalidPackId(String),
    InvalidContentVersion(String),
    /// The platform disk-space query failed (message carries the OS detail).
    DiskSpace(String),
}

impl fmt::Display for PackIoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PackIoError::Io(err) => write!(f, "pack I/O error: {err}"),
            PackIoError::InvalidPackId(pack_id) => write!(f, "invalid content pack id: {pack_id:?}"),
            PackIoError::InvalidContentVersion(version) => {
                write!(f, "invalid content version: {version:?}")
            }
            PackIoError::DiskSpace(detail) => write!(f, "disk-space query failed: {detail}"),
        }
    }
}

impl std::error::Error for PackIoError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            PackIoError::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for PackIoError {
    fn from(err: std::io::Error) -> Self {
        PackIoError::Io(err)
    }
}

/// A content version becomes part of a filename, so it must not carry path separators or `..`.
fn is_safe_content_version(version: &str) -> bool {
    !version.is_empty()
        && !version.starts_with('.')
        && !version.contains("..")
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

/// Resolve (and create) the install paths for one pack version (B3 §4.3 `resolvePaths`).
pub fn resolve_pack_paths(
    base_dir: &Path,
    pack_id: &str,
    content_version: &str,
) -> Result<PackInstallPaths, PackIoError> {
    if !crate::content_db::is_safe_pack_id(pack_id) {
        return Err(PackIoError::InvalidPackId(pack_id.to_string()));
    }
    if !is_safe_content_version(content_version) {
        return Err(PackIoError::InvalidContentVersion(content_version.to_string()));
    }

    std::fs::create_dir_all(base_dir)?;
    let stem = format!("{pack_id}-{content_version}");
    let as_str = |path: PathBuf| path.to_string_lossy().into_owned();

    Ok(PackInstallPaths {
        directory: as_str(base_dir.to_path_buf()),
        installed: as_str(base_dir.join(format!("{stem}.sqlite"))),
        temp_download: as_str(base_dir.join(format!("{stem}.sqlite.gz.partial"))),
        temp_extract: as_str(base_dir.join(format!("{stem}.sqlite.tmp"))),
    })
}

/// Byte length of an installed (or staged) pack file.
pub fn file_size_bytes(path: &Path) -> Result<u64, PackIoError> {
    Ok(std::fs::metadata(path)?.len())
}

/// Remove a scratch/installed file. A missing file is not an error (idempotent cleanup).
pub fn remove_file(path: &Path) -> Result<(), PackIoError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(PackIoError::Io(err)),
    }
}

/// Atomic same-filesystem replace for the `.tmp` -> installed swap (B4 §4.6).
///
/// `std::fs::rename` maps to `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` on Windows and `rename(2)`
/// on Unix, so an existing destination is replaced without a visible gap. The caller must have
/// detached the previous pack first so no SQLite handle is open on the destination.
pub fn rename(from: &Path, to: &Path) -> Result<(), PackIoError> {
    std::fs::rename(from, to)?;
    Ok(())
}

/// Read a whole pack file into memory — used when the core hashes a downloaded/staged pack.
pub fn read_file_bytes(path: &Path) -> Result<Vec<u8>, PackIoError> {
    Ok(std::fs::read(path)?)
}

/// Create (or truncate) the scratch `.gz` download file so a fresh download starts clean.
///
/// A resumed download reuses the existing partial file and skips this, appending instead.
pub fn create_file(path: &Path) -> Result<(), PackIoError> {
    std::fs::File::create(path)?;
    Ok(())
}

/// Append one downloaded chunk to the scratch `.gz`; returns the new total size.
///
/// The WebView streams the HTTPS body here (`fetch`), so the compressed pack is written
/// incrementally and a failed transfer leaves a partial file to resume with HTTP `Range` (C3).
pub fn append_bytes(path: &Path, bytes: &[u8]) -> Result<u64, PackIoError> {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    file.write_all(bytes)?;
    Ok(file.metadata()?.len())
}

/// Decompress a `.sqlite.gz` into `dest`; returns the number of uncompressed bytes written.
pub fn gunzip(src_gz: &Path, dest: &Path) -> Result<u64, PackIoError> {
    let input = std::io::BufReader::new(std::fs::File::open(src_gz)?);
    let mut decoder = flate2::read::GzDecoder::new(input);
    let mut writer = std::io::BufWriter::new(std::fs::File::create(dest)?);
    let written = std::io::copy(&mut decoder, &mut writer)?;
    std::io::Write::flush(&mut writer)?;
    Ok(written)
}

/// Lowercase hex SHA-256 of a file — the verification step for both the compressed and the
/// decompressed pack (B4 §4.6). Computed natively so the bytes never cross the IPC bridge.
pub fn sha256_file(path: &Path) -> Result<String, PackIoError> {
    let mut reader = std::io::BufReader::new(std::fs::File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Free bytes available on the filesystem holding `directory` — the B4 §4.6 2x headroom check.
#[cfg(windows)]
pub fn available_disk_space(directory: &Path) -> Result<u64, PackIoError> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut wide: Vec<u16> = directory.as_os_str().encode_wide().collect();
    if wide.last() != Some(&0) {
        wide.push(0);
    }

    let mut free_to_caller: u64 = 0;
    // SAFETY: `wide` is a NUL-terminated UTF-16 path and the out-pointer is a valid `u64`.
    unsafe {
        GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free_to_caller), None, None)
            .map_err(|err| PackIoError::DiskSpace(err.to_string()))?;
    }
    Ok(free_to_caller)
}

/// Free bytes available on the filesystem holding `directory` — the B4 §4.6 2x headroom check.
#[cfg(unix)]
pub fn available_disk_space(directory: &Path) -> Result<u64, PackIoError> {
    use std::os::unix::ffi::OsStrExt;

    let path = std::ffi::CString::new(directory.as_os_str().as_bytes())
        .map_err(|err| PackIoError::DiskSpace(err.to_string()))?;
    // SAFETY: `path` is a valid NUL-terminated C string and `stats` is a valid out-pointer.
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(path.as_ptr(), &mut stats) } != 0 {
        return Err(PackIoError::Io(std::io::Error::last_os_error()));
    }
    Ok((stats.f_bavail as u64).saturating_mul(stats.f_frsize as u64))
}
