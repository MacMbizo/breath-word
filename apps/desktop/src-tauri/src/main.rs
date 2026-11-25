// B3 §4.1 / §4.5 — the Tauri v2 desktop shell entry point.
//
// Wires the app-managed read-only `ContentDb` and exposes the `query_content_db` command
// family to the WebView. The Vite + React 19 frontend (`apps/desktop/src`, Dockview
// workspace) is the Phase-1 desktop UI milestone; this shell is the Gate-1 Spike 2 harness.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::Manager;

use breath_and_word_desktop::commands::{ContentDbState, LocalDeviceState, UserDataState};
use breath_and_word_desktop::commands;
use breath_and_word_desktop::{ContentDb, DeviceDb};

fn main() {
    let content_db = ContentDb::open_memory().expect("open in-memory content DB");

    tauri::Builder::default()
        .manage(ContentDbState(Mutex::new(content_db)))
        .setup(|app| {
            // The two writable device DBs live in the OS app-data dir (B4 §4.3/§4.4). They are
            // opened here; the schema DDL is applied by the WebView adapters on first boot.
            let dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let local_device = DeviceDb::open(&dir.join("local_device.sqlite"))?;
            let user_data = DeviceDb::open(&dir.join("user_data.sqlite"))?;
            app.manage(LocalDeviceState(Mutex::new(local_device)));
            app.manage(UserDataState(Mutex::new(user_data)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::attach_content_pack,
            commands::detach_content_pack,
            commands::list_attached_packs,
            commands::check_content_pack_integrity,
            commands::query_content_db,
            commands::run_content_query,
            commands::resolve_pack_paths,
            commands::pack_file_size,
            commands::pack_remove_file,
            commands::pack_rename,
            commands::pack_gunzip,
            commands::pack_sha256,
            commands::pack_available_disk_space,
            commands::pack_read_file,
            commands::pack_create_file,
            commands::pack_append_bytes,
            commands::local_device_execute,
            commands::local_device_query,
            commands::local_device_execute_batch,
            commands::user_data_execute,
            commands::user_data_query,
            commands::user_data_execute_batch,
            commands::user_data_begin,
            commands::user_data_commit,
            commands::user_data_rollback,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Breath & Word desktop");
}
