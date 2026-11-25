// React context holding the wired core runtime (B3 §4.2 rule 2). The Expo Router root layout
// boots the runtime once with `bootMobile()` and provides it here; screens read state through the
// headless stores and never construct repositories or write SQL.
import { createContext, useContext, type ReactNode } from 'react';

import type { CoreRuntime } from '@breath-and-word/core';

const RuntimeContext = createContext<CoreRuntime | null>(null);

export function CoreRuntimeProvider({
  runtime,
  children,
}: {
  runtime: CoreRuntime;
  children: ReactNode;
}): ReactNode {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

/** Access the booted core runtime. Throws if used outside the provider. */
export function useCoreRuntime(): CoreRuntime {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error('useCoreRuntime must be used within <CoreRuntimeProvider>.');
  }
  return runtime;
}
