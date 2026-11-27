// Bridge `packages/core` headless stores (zustand/vanilla) into React (B3 §4.2 rule 2).
// The stores are plain `StoreApi` objects; we only need the minimal readable surface, so the
// mobile app never has to depend on `zustand` directly (mirrors the desktop helper).
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
 * Subscribe to ONE slice of a headless store. The component re-renders only when the selected
 * value changes identity — use it for big screens (the reader) that must not re-render on every
 * unrelated loading flag. The selector must return a stable reference (a field, not a new object).
 */
export function useCoreStoreSelector<T, S>(store: ReadableStore<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
