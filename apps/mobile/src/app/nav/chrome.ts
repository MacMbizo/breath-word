// FR-104 Focus Mode — one tiny shared flag so the reader can hide the app chrome (its own
// header and the floating pill nav) and the pill can follow without prop drilling.
import { useSyncExternalStore } from 'react';

let focusMode = false;
const listeners = new Set<() => void>();

export function setFocusMode(next: boolean): void {
  if (next === focusMode) return;
  focusMode = next;
  for (const listener of listeners) listener();
}

export function useFocusMode(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => focusMode,
  );
}
