// B3 §4.2 rule 2 — Desktop app boot: compose the headless core, then restore attached packs.
//
// The Tauri/Vite shell calls `bootDesktop()` (or `bootDesktopApp({ adapters })`) once at startup.
// `src/adapters` assembles the platform adapters — Tauri `invoke` content DB + pack I/O over
// rusqlite, the native writable device DBs, WebCrypto, WebView storage and HTML5 audio — so
// `packages/core` stays platform-agnostic (B3 §4.1/§4.3).

import { initCoreRuntime, type CoreAdapters, type CoreRuntime } from '@breath-and-word/core';
import { createDesktopAdapters } from './adapters';

export interface DesktopBootOptions {
  /** Platform adapters assembled by `src/adapters` (B3 §4.3). */
  readonly adapters: CoreAdapters;
  /** Pack id holding `reading_plans` / `reading_plan_days`; defaults to `study_refs`. */
  readonly studyRefsPackId?: string;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * Boot the Desktop core runtime: wire the headless repositories (`initCoreRuntime`), then
 * re-attach every previously installed content pack so a cold start can read immediately
 * (`ATTACH DATABASE` is per-connection — B4 §4.6 / B7 cold-start-to-readable).
 */
export async function bootDesktopApp(options: DesktopBootOptions): Promise<CoreRuntime> {
  const runtime = initCoreRuntime(options);
  await runtime.repositories.packs.attachInstalledPacks();
  return runtime;
}

/**
 * Boot the desktop app end-to-end: assemble the platform adapters (`createDesktopAdapters`) and
 * hand them to `bootDesktopApp`. The Vite entry (`main.tsx`) calls this once at startup.
 */
export async function bootDesktop(
  options: Omit<DesktopBootOptions, 'adapters'> = {},
): Promise<CoreRuntime> {
  const adapters = await createDesktopAdapters();
  return bootDesktopApp({ ...options, adapters });
}
