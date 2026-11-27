// The writing identity for synced study data (guest id offline, account id once signed in).
import { useEffect, useState } from 'react';

import { useCoreRuntime } from '../CoreRuntime';

export function useCurrentUserId(): string | null {
  const runtime = useCoreRuntime();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void runtime.repositories.identity.getOrCreateCurrentUserId().then((id) => {
      if (live) setUserId(id);
    });
    return () => {
      live = false;
    };
  }, [runtime]);
  return userId;
}
