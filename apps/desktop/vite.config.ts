// apps/desktop — Vite config for the Tauri WebView (B3 §4.1).
// The Rust side serves `dist/` in production (`tauri.conf.json` `frontendDist`).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Tauri's dev server is a fixed port so the WebView can point at it.
  clearScreen: false,
  // Never watch the Rust build output: `tauri dev` rewrites `src-tauri/target/**` while Vite is
  // watching, and on Windows watching the locked `.exe` throws `EBUSY` and kills the dev server.
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  // `@powersync/web` resolves its WA-SQLite worker at runtime via
  // `new Worker(new URL('./worker.js', import.meta.url))`. Vite's dependency pre-bundler rewrites
  // that into a broken `/node_modules/.vite/deps/worker.js` reference, so the worker 404s and
  // `db.init()` never settles. Opting the SDK out of pre-bundling keeps the URL resolution intact.
  optimizeDeps: { exclude: ['@powersync/web'] },
  // `@powersync/web` ships its WA-SQLite database worker as code-split ESM; Vite's default
  // `iife` worker format cannot code-split and fails the production build (B3 §4.1, ADR-002).
  worker: { format: 'es' },
});
