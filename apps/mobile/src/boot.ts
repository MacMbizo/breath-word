// B3 §4.2 rule 2 — Mobile app boot: compose the headless core, then restore attached packs.
//
// The Expo shell calls `bootMobileApp({ adapters })` once at startup. `adapters` are assembled
// by the platform layer (`src/adapters`: op-sqlite ContentDb, @powersync/react-native,
// react-native-quick-crypto, TrackPlayer) so `packages/core` stays platform-agnostic.

import { initCoreRuntime, type CoreAdapters, type CoreRuntime } from '@breath-and-word/core';
import { createMobileAdapters } from './adapters';

export interface MobileBootOptions {
  /** Platform adapters assembled by `src/adapters` (B3 §4.3). */
  readonly adapters: CoreAdapters;
  /** Pack id holding `reading_plans` / `reading_plan_days`; defaults to `study_refs`. */
  readonly studyRefsPackId?: string;
  /** Injectable clock (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * Boot the Mobile core runtime: wire the headless repositories (`initCoreRuntime`), then
 * re-attach every previously installed content pack so a cold start can read immediately
 * (`ATTACH DATABASE` is per-connection — B4 §4.6 / B7 cold-start-to-readable).
 */
export async function bootMobileApp(options: MobileBootOptions): Promise<CoreRuntime> {
  const runtime = initCoreRuntime(options);
  await runtime.repositories.packs.attachInstalledPacks();
  return runtime;
}

/**
 * Boot the mobile app end-to-end: assemble the platform adapters (`createMobileAdapters`) and hand
 * them to `bootMobileApp`. The Expo Router root layout calls this once at startup.
 */
export async function bootMobile(
  options: Omit<MobileBootOptions, 'adapters'> = {},
): Promise<CoreRuntime> {
  const adapters = await createMobileAdapters();
  return bootMobileApp({ ...options, adapters });
}
