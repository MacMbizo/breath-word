// Vite entry (B3 §4.1): boot the headless core once, then mount the React 19 shell.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
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
    root.render(
      <StrictMode>
        <CoreRuntimeProvider runtime={runtime}>
          <App />
        </CoreRuntimeProvider>
      </StrictMode>,
    );
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.render(
      <StrictMode>
        <div className="p-xl font-ui text-uiMd text-ink-red" role="alert">
          Breath &amp; Word could not start the local engine: {message}
        </div>
      </StrictMode>,
    );
  },
);
