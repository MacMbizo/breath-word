// B6 §4.2.4 — App Lock: drop the in-RAM DEK after 15 minutes in the background.
//
// The window records when it goes hidden and, on return, asks the headless vault store to lock
// if the absence outlasted the timeout. Locking zeroizes the DEK; per `ADR-004` it is also the
// moment the volatile decrypted-note search state is discarded. Renders nothing.
import { useEffect } from 'react';

import { useCoreRuntime } from './CoreRuntime';

/** B6 §4.2.4 — default inactivity timeout before the vault auto-locks (15 minutes). */
export const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export function AppLock(): null {
  const runtime = useCoreRuntime();

  useEffect(() => {
    let hiddenAt: number | null = null;

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= AUTO_LOCK_TIMEOUT_MS) {
        runtime.stores.vault.getState().lock();
      }
      hiddenAt = null;
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [runtime]);

  return null;
}
