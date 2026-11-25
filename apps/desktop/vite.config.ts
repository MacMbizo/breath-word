// apps/desktop — Vite config for the Tauri WebView (B3 §4.1).
// The Rust side serves `dist/` in production (`tauri.conf.json` `frontendDist`).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Tauri's dev server is a fixed port so the WebView can point at it.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  // `@powersync/web` ships its WA-SQLite database worker as code-split ESM; Vite's default
  // `iife` worker format cannot code-split and fails the production build (B3 §4.1, ADR-002).
  worker: { format: 'es' },
});
