// FR-105 library — installed content packs + offline storage total (headless pack store).
import { useEffect } from 'react';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function LibraryView() {
  const { stores } = useCoreRuntime();
  const { installed, storageBytes, status, error } = useCoreStore(stores.packs);

  useEffect(() => {
    void stores.packs.getState().refresh();
  }, [stores]);

  return (
    <section className="flex h-full flex-col gap-lg overflow-hidden">
      <header className="flex items-baseline justify-between">
        <h2 className="font-ui text-uiLg text-ink-primary">Library</h2>
        <p className="font-ui text-uiSm text-ink-secondary">
          Offline storage: <span className="text-ink-primary">{formatBytes(storageBytes)}</span>
        </p>
      </header>

      {status === 'loading' && installed.length === 0 && (
        <p className="font-ui text-uiSm text-ink-secondary">Loading installed packs…</p>
      )}
      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}
      {status !== 'loading' && installed.length === 0 && error === null && (
        <p className="font-ui text-uiSm text-ink-secondary">
          No content packs installed yet. Install a pack to read offline.
        </p>
      )}

      <ul className="flex-1 overflow-y-auto">
        {installed.map((pack) => (
          <li
            key={pack.packId}
            className="mb-sm flex items-center justify-between rounded-md border border-hairline bg-surface px-lg py-md"
          >
            <div className="flex flex-col">
              <span className="font-ui text-uiMd text-ink-primary">{pack.packId}</span>
              <span className="font-ui text-uiXs text-ink-secondary">
                {pack.packType} · v{pack.contentVersion} · schema {pack.schemaVersion}
              </span>
            </div>
            <span className="font-ui text-uiSm text-ink-secondary">
              {formatBytes(pack.fileSizeBytes)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
