// B3 §4.3 — exercises the writable device-DB layer that backs the desktop `LocalDeviceAdapter`
// and `UserDbAdapter`: the multi-statement DDL bootstrap, parameterised execute/query, the
// `PRAGMA user_version` schema gate, and the `BEGIN IMMEDIATE`/COMMIT/ROLLBACK brackets used by
// `writeTransaction`. Runs offline in-memory (plus one on-disk case).

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use breath_and_word_desktop::device_db::DeviceDb;
use serde_json::{json, Value};

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// A fresh scratch directory per test.
fn scratch_dir(label: &str) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "bw-device-db-{}-{}-{}",
        std::process::id(),
        label,
        unique
    ));
    std::fs::create_dir_all(&dir).expect("create scratch dir");
    dir
}

/// The subset of `LOCAL_DEVICE_DDL` the pack-manager round-trip exercises (mirrors B4 §4.4).
const INSTALLED_PACKS_DDL: &str = "
CREATE TABLE installed_packs (
    pack_id TEXT PRIMARY KEY,
    pack_type TEXT NOT NULL,
    content_version TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    installed_at TEXT NOT NULL
);
CREATE TABLE workspace_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
";

fn cell<'a>(row: &'a serde_json::Map<String, Value>, key: &str) -> &'a Value {
    row.get(key).expect("column present")
}

#[test]
fn ddl_bootstrap_and_parameterised_round_trip() {
    let db = DeviceDb::open_memory().expect("open memory device DB");

    // Fresh file: the schema gate starts at 0, so the adapter applies the DDL, then stamps it.
    assert_eq!(db.user_version().expect("user_version"), 0);
    db.execute_batch(INSTALLED_PACKS_DDL).expect("apply DDL");
    db.execute_batch("PRAGMA user_version = 1").expect("stamp version");
    assert_eq!(db.user_version().expect("user_version"), 1);

    let changed = db
        .execute(
            "INSERT INTO installed_packs
               (pack_id, pack_type, content_version, schema_version, file_path, sha256, file_size_bytes, installed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            &[
                json!("core_bsb"),
                json!("BIBLE"),
                json!("1.0.0"),
                json!(1),
                json!("C:/packs/core_bsb-1.0.0.sqlite"),
                json!("deadbeef"),
                json!(31_000_000),
                json!("2026-11-25T00:00:00Z"),
            ],
        )
        .expect("insert installed pack");
    assert_eq!(changed, 1, "one row inserted");

    let rows = db
        .query(
            "SELECT pack_id, schema_version, file_size_bytes FROM installed_packs WHERE pack_id = ?",
            &[json!("core_bsb")],
        )
        .expect("query installed pack");
    assert_eq!(rows.len(), 1);
    assert_eq!(cell(&rows[0], "pack_id"), &json!("core_bsb"));
    assert_eq!(cell(&rows[0], "schema_version"), &json!(1));
    assert_eq!(cell(&rows[0], "file_size_bytes"), &json!(31_000_000));

    // The upsert the pack manager runs on re-install must not create a second row.
    db.execute(
        "INSERT INTO installed_packs
           (pack_id, pack_type, content_version, schema_version, file_path, sha256, file_size_bytes, installed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pack_id) DO UPDATE SET content_version = excluded.content_version",
        &[
            json!("core_bsb"),
            json!("BIBLE"),
            json!("1.1.0"),
            json!(1),
            json!("C:/packs/core_bsb-1.1.0.sqlite"),
            json!("cafef00d"),
            json!(32_000_000),
            json!("2026-11-26T00:00:00Z"),
        ],
    )
    .expect("upsert installed pack");
    let all = db
        .query("SELECT content_version FROM installed_packs", &[])
        .expect("query all");
    assert_eq!(all.len(), 1);
    assert_eq!(cell(&all[0], "content_version"), &json!("1.1.0"));
}

#[test]
fn write_transaction_commit_and_rollback() {
    let db = DeviceDb::open_memory().expect("open memory device DB");
    db.execute_batch(INSTALLED_PACKS_DDL).expect("apply DDL");

    // Commit path: the row survives.
    db.begin().expect("begin");
    db.execute(
        "INSERT INTO workspace_state (key, value_json, updated_at) VALUES (?, ?, ?)",
        &[json!("layout"), json!("{\"open\":true}"), json!("2026-11-25T00:00:00Z")],
    )
    .expect("insert in tx");
    db.commit().expect("commit");
    let committed = db
        .query("SELECT value_json FROM workspace_state WHERE key = ?", &[json!("layout")])
        .expect("query committed");
    assert_eq!(committed.len(), 1);
    assert_eq!(cell(&committed[0], "value_json"), &json!("{\"open\":true}"));

    // Rollback path: the row is discarded.
    db.begin().expect("begin");
    db.execute(
        "INSERT INTO workspace_state (key, value_json, updated_at) VALUES (?, ?, ?)",
        &[json!("discarded"), json!("{}"), json!("2026-11-25T00:00:00Z")],
    )
    .expect("insert in tx");
    db.rollback().expect("rollback");
    let after = db
        .query("SELECT key FROM workspace_state WHERE key = ?", &[json!("discarded")])
        .expect("query discarded");
    assert!(after.is_empty(), "rolled-back row must be gone");
}

#[test]
fn open_creates_a_persistent_file_across_reopen() {
    let path = scratch_dir("persist").join("local_device.sqlite");

    {
        let db = DeviceDb::open(&path).expect("open file");
        db.execute_batch(INSTALLED_PACKS_DDL).expect("apply DDL");
        db.execute_batch("PRAGMA user_version = 1").expect("stamp version");
        db.execute(
            "INSERT INTO installed_packs
               (pack_id, pack_type, content_version, schema_version, file_path, sha256, file_size_bytes, installed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            &[
                json!("core_bsb"),
                json!("BIBLE"),
                json!("1.0.0"),
                json!(1),
                json!("C:/packs/core_bsb-1.0.0.sqlite"),
                json!("deadbeef"),
                json!(123),
                json!("2026-11-25T00:00:00Z"),
            ],
        )
        .expect("insert");
    }

    // Re-open: the DDL is already applied (user_version 1) and the row is still there — the
    // cold-start path `PackManagerRepository.attachInstalledPacks` depends on (B7).
    let reopened = DeviceDb::open(&path).expect("reopen file");
    assert_eq!(reopened.user_version().expect("user_version"), 1);
    let rows = reopened
        .query("SELECT pack_id FROM installed_packs", &[])
        .expect("query");
    assert_eq!(rows.len(), 1);
    assert_eq!(cell(&rows[0], "pack_id"), &json!("core_bsb"));
}
