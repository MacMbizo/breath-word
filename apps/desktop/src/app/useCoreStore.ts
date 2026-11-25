// Bridge `packages/core` headless stores (zustand/vanilla) into React (B3 §4.2 rule 2).
// The stores are plain `StoreApi` objects; we only need the minimal readable surface, so
// desktop never has to depend on `zustand` directly.
import { useSyncExternalStore } from 'react';

interface ReadableStore<T> {
  getState: () => T;
  subscribe: (listener: () => void) => () => void;
}

/** Subscribe a component to a headless core store. */
export function useCoreStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
