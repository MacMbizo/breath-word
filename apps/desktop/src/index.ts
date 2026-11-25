// apps/desktop — Tauri v2 + Vite + React 19 shell (Win11 / macOS / Web Companion).
// The `src-tauri` Rust crate lands the content-DB layer (`rusqlite` FTS5), the native pack
// file-I/O layer, the writable device DBs and their Tauri command shell; `src/adapters` wires
// those commands (plus WebCrypto/WebView storage/HTML5 audio) into the `CoreAdapters` contract.
// The Vite + React 19 frontend (`index.html` -> `src/main.tsx` -> `src/app/`) renders the first
// reader/library screens off the headless core stores (B3 §4.1).

export const DESKTOP_APP_NAME = 'Breath & Word';

export * from './adapters';
export * from './boot';

