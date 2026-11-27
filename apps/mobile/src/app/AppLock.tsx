// B6 §4.2.4 — App Lock: drop the in-RAM DEK after 15 minutes in the background.
//
// `AppState` reports every background/inactive transition; on return to the foreground we ask
// the headless vault store to lock if the app was away longer than the timeout. Locking zeroizes
// the DEK; per `ADR-004` it is also the moment the volatile decrypted-note search state is
// discarded. Renders nothing.
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useCoreRuntime } from './CoreRuntime';

/** B6 §4.2.4 — default inactivity timeout before the vault auto-locks (15 minutes). */
export const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export function AppLock(): null {
  const runtime = useCoreRuntime();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onChange = (status: AppStateStatus): void => {
      if (status === 'background' || status === 'inactive') {
        hiddenAt.current ??= Date.now();
        return;
      }
      if (status === 'active') {
        if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= AUTO_LOCK_TIMEOUT_MS) {
          runtime.stores.vault.getState().lock();
        }
        hiddenAt.current = null;
      }
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [runtime]);

  return null;
}
