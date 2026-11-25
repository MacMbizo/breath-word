// B3 §4.1 — the desktop read/write SQLite layer for `local_device.sqlite` and `user_data.sqlite`.
//
// Unlike the read-only `ContentDb`, this connection is writable: it backs the `LocalDeviceAdapter`
// (installed packs, audio LRU, workspace layout — B4 §4.4) and the desktop `UserDbAdapter`.
// `packages/core` still owns every SQL string and the DDL; this module only executes what the
// WebView forwards (AGENTS.md rule 1), so it exposes one generic execute/query/batch surface plus
// the explicit transaction brackets `writeTransaction` needs (B3 §4.3).
//
// The synced `user_data.sqlite` is ultimately PowerSync-managed (`@powersync/web`, B3 §4.1). Until
// that integration lands, the desktop shell backs the same adapter over this local connection so
// the reading-plan repository (FR-104) runs its exact SQL; the swap happens behind the adapter.

use std::fmt;
use std::path::Path;

use rusqlite::{Connection, OpenFlags, params_from_iter};
use serde_json::{Map, Value};

use crate::sql_json::{json_to_sql, sql_cell_to_json};

#[derive(Debug)]
pub enum DeviceDbError {
    Sql(rusqlite::Error),
}

impl fmt::Display for DeviceDbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeviceDbError::Sql(err) => write!(f, "device DB error: {err}"),
        }
    }
}

impl std::error::Error for DeviceDbError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            DeviceDbError::Sql(err) => Some(err),
        }
    }
}

impl From<rusqlite::Error> for DeviceDbError {
    fn from(err: rusqlite::Error) -> Self {
        DeviceDbError::Sql(err)
    }
}

/// A writable SQLite connection for one device/user database file.
pub struct DeviceDb {
    conn: Connection,
}

impl DeviceDb {
    /// Open (creating if needed) a read/write device database on disk.
    pub fn open(path: &Path) -> Result<Self, DeviceDbError> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self { conn })
    }

    /// Open an empty in-memory device database (used by the native tests).
    pub fn open_memory() -> Result<Self, DeviceDbError> {
        Ok(Self {
            conn: Connection::open_in_memory()?,
        })
    }

    /// The schema version stamped on this file, gating the one-time DDL bootstrap.
    pub fn user_version(&self) -> Result<i64, DeviceDbError> {
        Ok(self.conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
    }

    /// Run a multi-statement script with no parameters — the canonical DDL bootstrap (B4 §4.3/§4.4).
    pub fn execute_batch(&self, sql: &str) -> Result<(), DeviceDbError> {
        self.conn.execute_batch(sql)?;
        Ok(())
    }

    /// Run one parameterised statement; returns the affected row count.
    pub fn execute(&self, sql: &str, params: &[Value]) -> Result<u64, DeviceDbError> {
        let bound: Vec<rusqlite::types::Value> = params.iter().map(json_to_sql).collect();
        let changed = self.conn.execute(sql, params_from_iter(bound.into_iter()))?;
        Ok(changed as u64)
    }

    /// Run a parameterised read; rows cross the IPC boundary as JSON objects.
    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, DeviceDbError> {
        let mut stmt = self.conn.prepare(sql)?;
        let columns: Vec<String> = stmt.column_names().map(|c| c.to_string()).collect();
        let bound: Vec<rusqlite::types::Value> = params.iter().map(json_to_sql).collect();
        let mut rows = stmt.query(params_from_iter(bound.into_iter()))?;

        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let mut record = Map::with_capacity(columns.len());
            for (index, name) in columns.iter().enumerate() {
                let cell: rusqlite::types::Value = row.get(index)?;
                record.insert(name.clone(), sql_cell_to_json(cell));
            }
            out.push(record);
        }
        Ok(out)
    }

    /// `BEGIN IMMEDIATE` — the write half of `UserDbAdapter.writeTransaction` (B3 §4.3).
    pub fn begin(&self) -> Result<(), DeviceDbError> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        Ok(())
    }

    pub fn commit(&self) -> Result<(), DeviceDbError> {
        self.conn.execute_batch("COMMIT")?;
        Ok(())
    }

    pub fn rollback(&self) -> Result<(), DeviceDbError> {
        self.conn.execute_batch("ROLLBACK")?;
        Ok(())
    }
}
