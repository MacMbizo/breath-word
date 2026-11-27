// Vite entry (B3 §4.1): boot the headless core once, then mount the React 19 shell.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { isAppError } from '@breath-and-word/core';

import { App } from './app/App';
import { AppLock } from './app/AppLock';
import { CoreRuntimeProvider } from './app/CoreRuntime';
import { applyTheme, DEFAULT_THEME } from './app/theme';
import { bootDesktop } from './boot';

import './styles.css';

// Write the D1 token variables before first paint so there is no unstyled flash.
applyTheme(DEFAULT_THEME);

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Breath & Word: #root container is missing from index.html.');
}

const root = createRoot(container);

void bootDesktop().then(
  (runtime) => {
    // FR-206 — start the account store once so an existing Supabase session (or a later sign-in)
    // drives the guest→account upgrade. Inert (`configured: false`) in an unprovisioned build.
    void runtime.stores.account.getState().start();
    root.render(
      <StrictMode>
        <CoreRuntimeProvider runtime={runtime}>
          <AppLock />
          <App />
        </CoreRuntimeProvider>
      </StrictMode>,
    );
  },
  (error: unknown) => {
    // `AppError.userMessage` is deliberately generic (C3 §4.1) — the real failure is kept in
    // `cause`. Log the whole thing (visible in the WebView devtools) and surface the diagnosis so a
    // boot failure is actionable instead of opaque.
    console.error('[breath-and-word] desktop boot failed', error);

    const message = error instanceof Error ? error.message : String(error);
    const diagnostics: string[] = [];
    if (isAppError(error)) {
      diagnostics.push(`code: ${error.code}`);
      if (error.internalDetail !== undefined) diagnostics.push(`detail: ${error.internalDetail}`);
    }
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof Error) {
      diagnostics.push(`cause: ${cause.name}: ${cause.message}`);
      if (cause.stack !== undefined) diagnostics.push(cause.stack);
    } else if (cause !== undefined) {
      diagnostics.push(`cause: ${String(cause)}`);
    }

    root.render(
      <StrictMode>
        <div className="p-xl font-ui text-uiMd text-ink-red" role="alert">
          <p>Breath &amp; Word could not start the local engine: {message}</p>
          {diagnostics.length > 0 ? (
            <pre className="mt-md font-mono text-uiSm" style={{ whiteSpace: 'pre-wrap' }}>
              {diagnostics.join('\n')}
            </pre>
          ) : null}
        </div>
      </StrictMode>,
    );
  },
);
