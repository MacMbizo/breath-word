// B3 §4.3 — the JSON <-> SQLite value bridge shared by every native DB module.
//
// `packages/core` authors all SQL and passes parameters as JSON (the Tauri IPC form), so both
// the read-only content DB (`content_db`) and the read/write device DBs (`device_db`) need the
// same two conversions. Keeping them here avoids the two modules drifting apart.

use serde_json::Value;

/// JSON parameter -> SQLite value. Objects/arrays are unsupported parameter shapes and bind NULL.
pub(crate) fn json_to_sql(value: &Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as SqlValue;
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(flag) => SqlValue::Integer(i64::from(*flag)),
        Value::Number(number) => {
            if let Some(int) = number.as_i64() {
                SqlValue::Integer(int)
            } else if let Some(real) = number.as_f64() {
                SqlValue::Real(real)
            } else {
                SqlValue::Null
            }
        }
        Value::String(text) => SqlValue::Text(text.clone()),
        Value::Array(_) | Value::Object(_) => SqlValue::Null,
    }
}

/// SQLite column -> JSON cell. Blobs cross the IPC boundary as a byte array.
pub(crate) fn sql_cell_to_json(value: rusqlite::types::Value) -> Value {
    match value {
        rusqlite::types::Value::Null => Value::Null,
        rusqlite::types::Value::Integer(int) => Value::from(int),
        rusqlite::types::Value::Real(real) => {
            serde_json::Number::from_f64(real).map_or(Value::Null, Value::Number)
        }
        rusqlite::types::Value::Text(text) => Value::String(text),
        rusqlite::types::Value::Blob(bytes) => {
            Value::Array(bytes.into_iter().map(Value::from).collect())
        }
    }
}
