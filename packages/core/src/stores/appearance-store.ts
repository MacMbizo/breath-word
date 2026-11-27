// D1 §4.2 — headless appearance store: the reader's theme, word view, text size and panel state.
//
// `prefs` is usable before `load()` resolves (it starts at the defaults), so a screen never
// waits on storage to paint. Each change updates state at once and persists in the background;
// a failed write keeps the in-memory choice (it is a comfort setting, not user data) and leaves
// the error for diagnostics.

import { createStore, type StoreApi } from 'zustand/vanilla';

import { asAppError, type AppError, type AppErrorFallback } from '../errors/AppError';
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type AppearancePreferences,
  type AppearanceRepository,
} from '../repositories/appearance-repository';

const APPEARANCE_FAILURE: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'Your reading settings could not be saved on this device.',
};

export interface AppearanceState {
  readonly prefs: AppearancePreferences;
  /** True once stored preferences have been read (or failed to read). */
  readonly loaded: boolean;
  readonly error: AppError | null;
  load(): Promise<void>;
  update(patch: Partial<AppearancePreferences>): Promise<void>;
}

export type AppearanceStore = StoreApi<AppearanceState>;

export function createAppearanceStore(repository: AppearanceRepository): AppearanceStore {
  let writes = Promise.resolve();
  return createStore<AppearanceState>((set, get) => ({
    prefs: DEFAULT_APPEARANCE,
    loaded: false,
    error: null,

    async load() {
      try {
        set({ prefs: await repository.get(), loaded: true, error: null });
      } catch (err) {
        set({ loaded: true, error: asAppError(err, APPEARANCE_FAILURE) });
      }
    },

    async update(patch) {
      const current = get().prefs;
      const prefs = normalizeAppearance({ ...current, ...patch });
      // A no-op change (same values) neither re-renders subscribers nor writes to disk.
      if (JSON.stringify(prefs) === JSON.stringify(current)) return;
      set({ prefs });
      // Serialise writes so a quick run of toggles always lands the last one.
      writes = writes
        .then(() => repository.update(prefs))
        .then(
          () => set({ error: null }),
          (err: unknown) => set({ error: asAppError(err, APPEARANCE_FAILURE) }),
        );
      await writes;
    },
  }));
}
