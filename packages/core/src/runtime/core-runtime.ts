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
import { createCoreEventEmitter, type CoreEventEmitter } from '../events';
import { AudioRepository } from '../repositories/audio-repository';
import { EsvCacheRepository } from '../repositories/esv-cache-repository';
import { ExegesisRepository } from '../repositories/exegesis-repository';
import { HabitsRepository } from '../repositories/habits-repository';
import { AppearanceRepository } from '../repositories/appearance-repository';
import { IdentityRepository } from '../repositories/identity-repository';
import { InductiveStudyRepository } from '../repositories/inductive-study-repository';
import { InkCanvasRepository } from '../repositories/ink-canvas-repository';
import { PackManagerRepository } from '../repositories/pack-manager-repository';
import { PrayerEngineRepository } from '../repositories/prayer-engine-repository';
import { PrayerPoolRepository } from '../repositories/prayer-pool-repository';
import { ReaderRepository } from '../repositories/reader-repository';
import { ReadingPlanRepository } from '../repositories/reading-plan-repository';
import { StudyRefsRepository } from '../repositories/study-refs-repository';
import { VaultRepository } from '../repositories/vault-repository';
import { NoteSearchIndex } from '../search/note-search';
import { createLocalOnlySyncAdapter } from '../sync';
import { createAccountStore, type AccountStore } from '../stores/account-store';
import { createAudioStore, type AudioStore } from '../stores/audio-store';
import { createAppearanceStore, type AppearanceStore } from '../stores/appearance-store';
import { createPackStore, type PackStore } from '../stores/pack-store';
import { createPrayerStore, type PrayerStore } from '../stores/prayer-store';
import { createReaderStore, type ReaderStore } from '../stores/reader-store';
import { createStudyStore, type StudyStore } from '../stores/study-store';
import { createSyncStore, type SyncStore } from '../stores/sync-store';
import { createVaultStore, type VaultStore } from '../stores/vault-store';

/** Headless repositories exposed to the UI layer (B3 §4.2 rule 2). */
export interface CoreRepositories {
  /** FR-101..103 — offline reader, parallel compare, FTS5 search. */
  readonly reader: ReaderRepository;
  /** FR-105 — content pack download / verify / attach / update / remove. */
  readonly packs: PackManagerRepository;
  /** FR-104 — reading-plan enrollment + Manna pacing. */
  readonly readingPlans: ReadingPlanRepository;
  /** FR-201..203 — prayer pools, capture, per-user E2EE state, rotation. */
  readonly prayer: PrayerPoolRepository;
  /** FR-205 — guided-engine session logging. */
  readonly prayerEngine: PrayerEngineRepository;
  /** FR-206 — E2EE vault key lifecycle; owns the in-RAM DEK and the field cipher. */
  readonly vault: VaultRepository;
  /** FR-206 — device identity (guest/account) and the Zero-Loss Guest → Account upgrade. */
  readonly identity: IdentityRepository;
  /** FR-107 — BYO ESV ephemeral passage cache (TTL + verse/chapter caps, never synced). */
  readonly esv: EsvCacheRepository;
  /** FR-107 — kind habit loop (non-punitive streak + gentle resume copy) and reminder schedule. */
  readonly habits: HabitsRepository;
  readonly appearance: AppearanceRepository;
  /** FR-301 / FR-302 / FR-103 — interlinear, Strong's lookup, lexicons, word frequency. */
  readonly exegesis: ExegesisRepository;
  /** FR-303 — weighted TSK cross-references, Passage Guide, Theographic Factbook dossiers. */
  readonly studyRefs: StudyRefsRepository;
  /** FR-304 — inductive symbolic highlights, 5Ws&H / Paraphrase / 5-step Application notes & reminders. */
  readonly inductive: InductiveStudyRepository;
  /** FR-305 — portable normalized vector stylus ink canvases (`ADR-003`). */
  readonly ink: InkCanvasRepository;
  /** FR-106 — synchronized audio narration metadata, verse timestamps & local LRU cache. */
  readonly audio: AudioRepository;
}

/** Headless Zustand stores the UI subscribes to (B3 §4.1 `stores/`, §4.2 rule 2). */
export interface CoreStores {
  /** D1 §4.2 — device-local theme, word view, text size and desktop panel state. */
  readonly appearance: AppearanceStore;
  /** FR-101..103 — current chapter, parallel compare columns and search results. */
  readonly reader: ReaderStore;
  /** FR-105 — installed packs, offline storage total and install progress. */
  readonly packs: PackStore;
  /** FR-201..203 — pools, active-pool items and the rotation queue. */
  readonly prayer: PrayerStore;
  /** FR-206 — vault enabled/unlocked status and the one-time Recovery Key. */
  readonly vault: VaultStore;
  /** FR-206 — PowerSync connection status, offline pill and the rejected-mutation dead-letter. */
  readonly sync: SyncStore;
  /**
   * FR-206 / C4 §4.1 — auth session state and the Zero-Loss Guest → Account upgrade. Inert
   * (`configured: false`) when no auth adapter is injected (unprovisioned build — Plan §6).
   */
  readonly account: AccountStore;
  /** FR-301..305 — word inspection, lexicon, passage guide, factbook, inductive & ink state. */
  readonly study: StudyStore;
  /** FR-106 — synchronized narration playback, active verse sync, ambient mixer & sleep timer. */
  readonly audio: AudioStore;
}

/** The wired core, ready for the UI to consume. */
export interface CoreRuntime {
  readonly adapters: CoreAdapters;
  readonly repositories: CoreRepositories;
  readonly stores: CoreStores;
  /**
   * ADR-004 / B3 §4.1 `search/` — the volatile in-memory index over decrypted private notes. The
   * UI rebuilds it from decrypted notes while the vault is unlocked; it is purged automatically on
   * vault lock (`stores.vault.lock()`), so no plaintext survives the DEK.
   */
  readonly noteSearch: NoteSearchIndex;
  /** `C2 §4.3` fan-out seam every subsystem publishes typed events through. */
  readonly events: CoreEventEmitter;
}

export interface InitCoreRuntimeOptions {
  /** Platform-injected adapters (B3 §4.3). */
  readonly adapters: CoreAdapters;
  /** Pack id holding `reading_plans` / `cross_references` / `factbook_entities`; defaults to `study_refs`. */
  readonly studyRefsPackId?: string;
  /** Pack id holding `interlinear_tokens` / `lexicon_entries`; defaults to `exegesis_step`. */
  readonly exegesisPackId?: string;
  /** Injectable clock forwarded to repositories (tests); defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Compose the headless core from platform adapters. Call once at app boot. */
export function initCoreRuntime(options: InitCoreRuntimeOptions): CoreRuntime {
  const { adapters } = options;
  const now = options.now;
  const clock = now === undefined ? {} : { now };
  const studyRefsOpt = options.studyRefsPackId === undefined ? {} : { studyRefsPackId: options.studyRefsPackId };
  const exegesisOpt = options.exegesisPackId === undefined ? {} : { exegesisPackId: options.exegesisPackId };

  const vault = new VaultRepository({
    userDb: adapters.userDb,
    crypto: adapters.crypto,
    // B6 §4.2.2 — optional biometric fast unlock against the OS hardware-backed keystore.
    secureStorage: adapters.secureStorage,
  });
  const noteSearch = new NoteSearchIndex();
  const events = createCoreEventEmitter();
  const syncAdapter = adapters.sync ?? createLocalOnlySyncAdapter();
  const fieldCipher = vault.cipher();

  const repositories: CoreRepositories = {
    reader: new ReaderRepository(adapters.contentDb),
    identity: new IdentityRepository({
      userDb: adapters.userDb,
      localDevice: adapters.localDevice,
      crypto: adapters.crypto,
      ...clock,
    }),
    packs: new PackManagerRepository({
      contentDb: adapters.contentDb,
      localDevice: adapters.localDevice,
      installer: adapters.packInstaller,
      ...clock,
    }),
    readingPlans: new ReadingPlanRepository({
      contentDb: adapters.contentDb,
      userDb: adapters.userDb,
      crypto: adapters.crypto,
      ...studyRefsOpt,
      ...clock,
    }),
    prayer: new PrayerPoolRepository({
      userDb: adapters.userDb,
      crypto: adapters.crypto,
      cipher: fieldCipher,
      ...clock,
    }),
    prayerEngine: new PrayerEngineRepository({
      userDb: adapters.userDb,
      crypto: adapters.crypto,
      cipher: fieldCipher,
      ...clock,
    }),
    vault,
    esv: new EsvCacheRepository({ localDevice: adapters.localDevice, ...clock }),
    habits: new HabitsRepository({ localDevice: adapters.localDevice, ...clock }),
    appearance: new AppearanceRepository({ localDevice: adapters.localDevice, ...clock }),
    exegesis: new ExegesisRepository({
      contentDb: adapters.contentDb,
      ...exegesisOpt,
    }),
    studyRefs: new StudyRefsRepository({
      contentDb: adapters.contentDb,
      ...studyRefsOpt,
    }),
    inductive: new InductiveStudyRepository({
      userDb: adapters.userDb,
      localDevice: adapters.localDevice,
      crypto: adapters.crypto,
      cipher: fieldCipher,
      ...clock,
    }),
    ink: new InkCanvasRepository({
      userDb: adapters.userDb,
      crypto: adapters.crypto,
      cipher: fieldCipher,
      ...clock,
    }),
    audio: new AudioRepository({
      contentDb: adapters.contentDb,
      localDevice: adapters.localDevice,
      ...clock,
    }),
  };

  const vaultStore = createVaultStore(repositories.vault, { noteSearch });
  const stores: CoreStores = {
    appearance: createAppearanceStore(repositories.appearance),
    reader: createReaderStore(repositories.reader),
    packs: createPackStore(repositories.packs),
    prayer: createPrayerStore(repositories.prayer, adapters.poolShare ?? null),
    vault: vaultStore,
    sync: createSyncStore({ adapter: syncAdapter, emitter: events }),
    account: createAccountStore({
      auth: adapters.auth ?? null,
      identity: repositories.identity,
      sync: syncAdapter,
      // B6 §4.2.4 / ADR-004 — signing out locks the vault (zeroize DEK, purge the volatile index).
      onSignOut: () => vaultStore.getState().lock(),
    }),
    study: createStudyStore({
      exegesis: repositories.exegesis,
      studyRefs: repositories.studyRefs,
      inductive: repositories.inductive,
      ink: repositories.ink,
    }),
    audio: createAudioStore({
      audio: adapters.audio,
      repository: repositories.audio,
      emitter: events,
    }),
  };

  return { adapters, repositories, stores, noteSearch, events };
}
