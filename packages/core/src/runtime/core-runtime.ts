// B3 §4.2 rule 2 — the single composition root for the headless core.
//
// UI apps call `initCoreRuntime(adapters)` once at boot with platform-injected adapters
// (op-sqlite + PowerSync on Mobile; rusqlite + @powersync/web on Desktop) and receive the
// wired repositories. Screens read state through the repositories (or headless stores built
// on top of them); they never construct repositories and never write raw SQL (rule 3).
//
// The runtime holds no global mutable state — callers keep the returned object (e.g. in a
// React context) and dispose the underlying DB handles themselves when the app tears down.

import type { CoreAdapters } from '../adapters';
import { PackManagerRepository } from '../repositories/pack-manager-repository';
import { ReaderRepository } from '../repositories/reader-repository';
import { ReadingPlanRepository } from '../repositories/reading-plan-repository';
import { createPackStore, type PackStore } from '../stores/pack-store';
import { createReaderStore, type ReaderStore } from '../stores/reader-store';

/** Headless repositories exposed to the UI layer (B3 §4.2 rule 2). */
export interface CoreRepositories {
  /** FR-101..103 — offline reader, parallel compare, FTS5 search. */
  readonly reader: ReaderRepository;
  /** FR-105 — content pack download / verify / attach / update / remove. */
  readonly packs: PackManagerRepository;
  /** FR-104 — reading-plan enrollment + Manna pacing. */
  readonly readingPlans: ReadingPlanRepository;
}

/** Headless Zustand stores the UI subscribes to (B3 §4.1 `stores/`, §4.2 rule 2). */
export interface CoreStores {
  /** FR-101..103 — current chapter, parallel compare columns and search results. */
  readonly reader: ReaderStore;
  /** FR-105 — installed packs, offline storage total and install progress. */
  readonly packs: PackStore;
}

/** The wired core, ready for the UI to consume. */
export interface CoreRuntime {
  readonly adapters: CoreAdapters;
  readonly repositories: CoreRepositories;
  readonly stores: CoreStores;
}

export interface InitCoreRuntimeOptions {
  /** Platform-injected adapters (B3 §4.3). */
  readonly adapters: CoreAdapters;
  /** Pack id holding `reading_plans` / `reading_plan_days`; defaults to `study_refs`. */
  readonly studyRefsPackId?: string;
  /** Injectable clock forwarded to repositories (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Compose the headless core from platform adapters. Call once at app boot. */
export function initCoreRuntime(options: InitCoreRuntimeOptions): CoreRuntime {
  const { adapters } = options;
  const now = options.now;
  const clock = now === undefined ? {} : { now };
  const studyRefs = options.studyRefsPackId === undefined ? {} : { studyRefsPackId: options.studyRefsPackId };

  const repositories: CoreRepositories = {
    reader: new ReaderRepository(adapters.contentDb),
    packs: new PackManagerRepository({
      contentDb: adapters.contentDb,
      localDevice: adapters.localDevice,
      installer: adapters.packInstaller,
      crypto: adapters.crypto,
      ...clock,
    }),
    readingPlans: new ReadingPlanRepository({
      contentDb: adapters.contentDb,
      userDb: adapters.userDb,
      crypto: adapters.crypto,
      ...studyRefs,
      ...clock,
    }),
  };

  const stores: CoreStores = {
    reader: createReaderStore(repositories.reader),
    packs: createPackStore(repositories.packs),
  };

  return { adapters, repositories, stores };
}
