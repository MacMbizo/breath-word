// A tiny typed emitter for `CoreEvent` — the fan-out seam that lets the sync, vault,
// pack, audio and prayer subsystems publish state changes to UI subscribers without
// holding direct references to them. No transport, no persistence, no registry magic.

import type { CoreEvent, CoreEventOf, CoreEventType } from './types';

export type CoreEventListener<T extends CoreEventType> = (event: CoreEventOf<T>) => void;
export type CoreEventHandler = (event: CoreEvent) => void;

export interface CoreEventEmitter {
  /** Publish an event to every matching listener, then to every `onAny` listener. */
  emit(event: CoreEvent): void;
  /** Subscribe to one event type; returns an unsubscribe function. */
  on<T extends CoreEventType>(type: T, listener: CoreEventListener<T>): () => void;
  /** Subscribe to every event regardless of type; returns an unsubscribe function. */
  onAny(listener: CoreEventHandler): () => void;
  /** Drop every listener (used on sign-out / teardown). */
  offAll(): void;
}

export function createCoreEventEmitter(): CoreEventEmitter {
  const byType = new Map<CoreEventType, Set<CoreEventHandler>>();
  const anyListeners = new Set<CoreEventHandler>();

  return {
    emit(event) {
      // Snapshot each set so a listener that subscribes/unsubscribes during dispatch
      // cannot corrupt the current iteration.
      for (const listener of [...(byType.get(event.type) ?? [])]) {
        listener(event);
      }
      for (const listener of [...anyListeners]) {
        listener(event);
      }
    },
    on(type, listener) {
      const set = byType.get(type) ?? new Set<CoreEventHandler>();
      set.add(listener as CoreEventHandler);
      byType.set(type, set);
      return () => {
        set.delete(listener as CoreEventHandler);
      };
    },
    onAny(listener) {
      anyListeners.add(listener);
      return () => {
        anyListeners.delete(listener);
      };
    },
    offAll() {
      byType.clear();
      anyListeners.clear();
    },
  };
}
