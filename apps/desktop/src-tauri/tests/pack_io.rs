// Gate-1 / FR-105 evidence (B3 §4.1 `pack_io`, B4 §4.6) — exercises the native pack file-I/O
// layer exactly as the desktop `PackInstallerAdapter` will: resolve the install paths, gunzip a
// `.sqlite.gz`, verify the uncompressed SHA-256, atomically swap the staging file into place, and
// query free space. Runs entirely offline against a scratch temp directory.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use breath_and_word_desktop::pack_io::{self, PackIoError};
use flate2::write::GzEncoder;
use flate2::Compression;

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// A fresh, empty scratch directory per test.
fn scratch_dir(label: &str) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "bw-pack-io-{}-{}-{}",
        std::process::id(),
        label,
        unique
    ));
    std::fs::create_dir_all(&dir).expect("create scratch dir");
    dir
}

#[test]
fn resolve_pack_paths_creates_directory_and_names_paths() {
    // Nested under the scratch dir so `create_dir_all` has real work to do.
    let packs_dir = scratch_dir("resolve").join("packs");
    let paths = pack_io::resolve_pack_paths(&packs_dir, "core_bsb", "1.0.0").expect("resolve");

    assert!(packs_dir.is_dir(), "install directory should be created");
    assert_eq!(paths.directory, packs_dir.to_string_lossy());
    assert!(paths.installed.ends_with("core_bsb-1.0.0.sqlite"));
    assert!(paths.temp_download.ends_with("core_bsb-1.0.0.sqlite.gz.partial"));
    assert!(paths.temp_extract.ends_with("core_bsb-1.0.0.sqlite.tmp"));

    // The staging file and the installed file must share a directory (same filesystem), so the
    // final rename is a genuine atomic replace (B4 §4.6).
    let installed_parent = Path::new(&paths.installed).parent();
    assert_eq!(installed_parent, Path::new(&paths.temp_extract).parent());
    assert_eq!(installed_parent, Path::new(&paths.temp_download).parent());
}

#[test]
fn resolve_pack_paths_rejects_unsafe_ids_and_versions() {
    let base = scratch_dir("reject");

    assert!(matches!(
        pack_io::resolve_pack_paths(&base, "Core BSB", "1.0.0"),
        Err(PackIoError::InvalidPackId(_))
    ));
    // Must start with a lowercase ascii letter (mirrors the core `SAFE_PACK_ID`).
    assert!(matches!(
        pack_io::resolve_pack_paths(&base, "Core", "1.0.0"),
        Err(PackIoError::InvalidPackId(_))
    ));
    // Path traversal / separators in the content version are rejected.
    assert!(matches!(
        pack_io::resolve_pack_paths(&base, "core_bsb", "../etc/passwd"),
        Err(PackIoError::InvalidContentVersion(_))
    ));
    assert!(matches!(
        pack_io::resolve_pack_paths(&base, "core_bsb", ".."),
        Err(PackIoError::InvalidContentVersion(_))
    ));
}

#[test]
fn gunzip_then_sha256_matches_plaintext_hash() {
    let dir = scratch_dir("gunzip");

    // A blob large enough to span multiple read buffers in `sha256_file`.
    let plaintext: Vec<u8> = (0..150_000u32).map(|n| (n % 251) as u8).collect();
    let plain_path = dir.join("plain.sqlite");
    std::fs::write(&plain_path, &plaintext).expect("write plaintext");

    let gz_path = dir.join("plain.sqlite.gz");
    let mut encoder = GzEncoder::new(
        std::fs::File::create(&gz_path).expect("create gz"),
        Compression::default(),
    );
    encoder.write_all(&plaintext).expect("compress");
    encoder.finish().expect("finish gz");

    let out_path = dir.join("out.sqlite");
    let written = pack_io::gunzip(&gz_path, &out_path).expect("gunzip");
    assert_eq!(written, plaintext.len() as u64);
    assert_eq!(
        pack_io::file_size_bytes(&out_path).expect("size"),
        plaintext.len() as u64
    );

    // The native SHA-256 of the decompressed pack must equal that of the original bytes — the
    // exact check `PackManagerRepository` performs against `sha256Uncompressed` (B4 §4.6).
    let decompressed_hash = pack_io::sha256_file(&out_path).expect("hash out");
    let plaintext_hash = pack_io::sha256_file(&plain_path).expect("hash plain");
    assert_eq!(decompressed_hash, plaintext_hash);
    assert_eq!(decompressed_hash.len(), 64, "lowercase hex sha256");
}

#[test]
fn rename_replaces_existing_destination_atomically() {
    let dir = scratch_dir("rename");
    let from = dir.join("pack.sqlite.tmp");
    let to = dir.join("pack.sqlite");

    std::fs::write(&from, b"new pack contents").expect("write staging");
    std::fs::write(&to, b"superseded pack").expect("write installed");

    pack_io::rename(&from, &to).expect("atomic swap");

    assert_eq!(std::fs::read(&to).expect("read"), b"new pack contents");
    assert!(!from.exists(), "staging file should be gone after the swap");
}

#[test]
fn remove_file_is_idempotent() {
    let dir = scratch_dir("remove");
    let file = dir.join("scratch.tmp");
    std::fs::write(&file, b"x").expect("write scratch");

    pack_io::remove_file(&file).expect("first remove");
    assert!(!file.exists());
    // A missing file is not an error — cleanup is best-effort in the install protocol.
    pack_io::remove_file(&file).expect("second remove");
}

#[test]
fn available_disk_space_is_positive() {
    let dir = scratch_dir("disk-space");
    let free = pack_io::available_disk_space(&dir).expect("disk space");
    assert!(free > 0, "expected a non-zero free-space figure, got {free}");
}

#[test]
fn append_bytes_streams_download_chunks_and_create_file_truncates() {
    let dir = scratch_dir("append");
    let partial = dir.join("core_bsb-1.0.0.sqlite.gz.partial");

    // A fresh download truncates any stale partial file before the first chunk lands.
    std::fs::write(&partial, b"stale bytes from a previous attempt").expect("seed stale partial");
    pack_io::create_file(&partial).expect("create/truncate");
    assert_eq!(pack_io::file_size_bytes(&partial).expect("size"), 0);

    // Chunks stream in from the WebView `fetch`; the running total is returned so FR-105
    // progress stays accurate and a resume knows its offset.
    assert_eq!(pack_io::append_bytes(&partial, &[1, 2, 3]).expect("append 1"), 3);
    assert_eq!(pack_io::append_bytes(&partial, &[4, 5]).expect("append 2"), 5);
    assert_eq!(
        pack_io::read_file_bytes(&partial).expect("read back"),
        vec![1, 2, 3, 4, 5]
    );
}
