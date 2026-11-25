// Gate-1 Spike 2 (B3 §4.5) — the desktop content-DB module over `rusqlite`.
//
// Mirrors the `ContentDbAdapter` contract (B3 §4.3) that Mobile implements with op-sqlite:
// open a read-only connection, `ATTACH DATABASE` each installed pack under a namespaced
// schema, and serve the offline reads. `packages/core` never touches SQLite directly — the
// Tauri command layer forwards these calls (B3 §4.1).

use std::fmt;
use std::path::Path;

use rusqlite::{Connection, OpenFlags, params, params_from_iter};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::sql_json::{json_to_sql, sql_cell_to_json};

/// Attached schema names become SQL identifiers, so they must be boring — this mirrors the
/// `SAFE_PACK_ID` guard in `packages/core/src/repositories`.
pub(crate) fn is_safe_pack_id(pack_id: &str) -> bool {
    let mut chars = pack_id.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

#[derive(Debug)]
pub enum ContentDbError {
    Sql(rusqlite::Error),
    InvalidPackId(String),
    /// A `run_query` statement tried to change the database; packs are read-only (B4 §4.2).
    NotReadOnly,
}

impl fmt::Display for ContentDbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ContentDbError::Sql(err) => write!(f, "content DB error: {err}"),
            ContentDbError::InvalidPackId(pack_id) => {
                write!(f, "invalid content pack id: {pack_id:?}")
            }
            ContentDbError::NotReadOnly => {
                write!(f, "content packs are read-only; only SELECT/read-only PRAGMA statements are allowed")
            }
        }
    }
}

impl std::error::Error for ContentDbError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ContentDbError::Sql(err) => Some(err),
            ContentDbError::InvalidPackId(_) | ContentDbError::NotReadOnly => None,
        }
    }
}

impl From<rusqlite::Error> for ContentDbError {
    fn from(err: rusqlite::Error) -> Self {
        ContentDbError::Sql(err)
    }
}

/// One FR-103 search hit (`ReaderRepository.search` in `packages/core`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SearchHit {
    pub translation_code: String,
    pub canonical_verse_id: i64,
    pub book_number: i64,
    pub chapter: i64,
    pub verse: i64,
    pub plain_text: String,
    /// FTS5 snippet with matched terms wrapped in `[[…]]`.
    pub snippet: String,
    /// FTS5 `bm25()` relevance; lower is a better match.
    pub score: f64,
}

/// Read-only access to installed content packs through `ATTACH DATABASE` (B3 §4.3).
pub struct ContentDb {
    conn: Connection,
}

impl ContentDb {
    /// Open the always-attached main database read-only (the reader never writes packs).
    pub fn open_readonly(path: &Path) -> Result<Self, ContentDbError> {
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        Ok(Self { conn })
    }

    /// Open an empty in-memory main database. The desktop reader owns no content tables of
    /// its own — everything is read from the attached packs — so the shell manages one of these.
    pub fn open_memory() -> Result<Self, ContentDbError> {
        let conn = Connection::open_in_memory()?;
        Ok(Self { conn })
    }

    /// Attach a modular content pack under its namespaced schema.
    pub fn attach_pack(&self, pack_id: &str, path: &Path) -> Result<(), ContentDbError> {
        if !is_safe_pack_id(pack_id) {
            return Err(ContentDbError::InvalidPackId(pack_id.to_string()));
        }
        let sql = format!("ATTACH DATABASE ?1 AS {pack_id}");
        self.conn.execute(&sql, params![path.to_string_lossy()])?;
        Ok(())
    }

    pub fn detach_pack(&self, pack_id: &str) -> Result<(), ContentDbError> {
        if !is_safe_pack_id(pack_id) {
            return Err(ContentDbError::InvalidPackId(pack_id.to_string()));
        }
        self.conn.execute(&format!("DETACH DATABASE {pack_id}"), [])?;
        Ok(())
    }

    /// Every attached pack schema (excludes the always-present `main` / `temp`).
    pub fn attached_packs(&self) -> Result<Vec<String>, ContentDbError> {
        let mut stmt = self.conn.prepare("PRAGMA database_list")?;
        let names = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let mut packs = Vec::new();
        for name in names {
            let name = name?;
            if name != "main" && name != "temp" {
                packs.push(name);
            }
        }
        packs.sort();
        Ok(packs)
    }

    /// `PRAGMA <pack>.integrity_check` — used by the Content Pack Manager before committing.
    pub fn integrity_check(&self, pack_id: &str) -> Result<bool, ContentDbError> {
        if !is_safe_pack_id(pack_id) {
            return Err(ContentDbError::InvalidPackId(pack_id.to_string()));
        }
        let verdict: String =
            self.conn
                .query_row(&format!("PRAGMA {pack_id}.integrity_check"), [], |row| {
                    row.get(0)
                })?;
        Ok(verdict == "ok")
    }

    /// FR-103 — offline FTS5 search ranked by relevance (`bm25`).
    pub fn search(
        &self,
        pack_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchHit>, ContentDbError> {
        if !is_safe_pack_id(pack_id) {
            return Err(ContentDbError::InvalidPackId(pack_id.to_string()));
        }
        let sql = format!(
            "SELECT v.translation_code, v.canonical_verse_id, v.book_number, v.chapter, v.verse,
                    v.plain_text,
                    snippet(verses_fts, 2, '[[', ']]', '…', 12) AS snippet,
                    bm25(verses_fts) AS score
               FROM \"{pack_id}\".verses_fts
               JOIN \"{pack_id}\".verses AS v ON v.id = verses_fts.rowid
              WHERE verses_fts MATCH ?1
              ORDER BY score ASC
              LIMIT ?2"
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![query, limit as i64], |row| {
            Ok(SearchHit {
                translation_code: row.get(0)?,
                canonical_verse_id: row.get(1)?,
                book_number: row.get(2)?,
                chapter: row.get(3)?,
                verse: row.get(4)?,
                plain_text: row.get(5)?,
                snippet: row.get(6)?,
                score: row.get(7)?,
            })
        })?;

        let mut hits = Vec::new();
        for hit in rows {
            hits.push(hit?);
        }
        Ok(hits)
    }

    /// Generic read-only parameterised query (`ContentDbAdapter.query`, B3 §4.3).
    ///
    /// The reader sends plain `SELECT`s against `"<pack>".…` alongside the odd read-only
    /// `PRAGMA <pack>.integrity_check`, so the SQL itself comes from `packages/core` and is
    /// never authored by a screen (AGENTS.md rule 1). Statements that would change the
    /// database are refused — packs are strictly read-only.
    pub fn run_query(
        &self,
        sql: &str,
        params: &[Value],
    ) -> Result<Vec<Map<String, Value>>, ContentDbError> {
        let mut stmt = self.conn.prepare(sql)?;
        if !stmt.readonly() {
            return Err(ContentDbError::NotReadOnly);
        }

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
}

