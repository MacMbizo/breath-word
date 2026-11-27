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

/**
 * Subscribe to ONE slice of a headless store; re-renders only when that slice changes identity.
 * The selector must return a stable reference (a store field, not a freshly built object).
 */
export function useCoreStoreSelector<T, S>(store: ReadableStore<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
