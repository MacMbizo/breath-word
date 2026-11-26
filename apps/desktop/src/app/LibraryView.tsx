// FR-105 library — installed content packs, the offline storage total, and the published
// catalogue (headless pack store). Install / update / remove run through `stores.packs`;
// this component owns only view state and never touches SQL (AGENTS.md rule 1).
import { useCallback, useEffect, useState } from 'react';

import {
  parsePackManifest,
  type ManifestPackEntry,
  type PackManifest,
  type PackType,
} from '@breath-and-word/core';

import { packDownloadUrl, packManifestUrl } from '../config/pack-catalogue';
import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const PACK_TYPE_LABELS: Record<PackType, string> = {
  TRANSLATION: 'Translation',
  EXEGESIS: 'Exegesis',
  STUDY_REFS: 'Study',
  COMMENTARY: 'Commentary',
};

const PHASE_LABELS: Record<string, string> = {
  downloading: 'Downloading',
  verifying: 'Verifying',
  extracting: 'Extracting',
  attaching: 'Attaching',
};

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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LibraryView() {
  const { stores } = useCoreRuntime();
  const { installed, storageBytes, status, error, progress } = useCoreStore(stores.packs);

  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);

  const loadCatalogue = useCallback(async () => {
    setLoadingCatalogue(true);
    setCatalogueError(null);
    try {
      const response = await fetch(packManifestUrl());
      if (!response.ok) {
        throw new Error(`manifest request failed: HTTP ${response.status}`);
      }
      setManifest(parsePackManifest(await response.json()));
    } catch (cause) {
      setManifest(null);
      setCatalogueError(describeError(cause));
    } finally {
      setLoadingCatalogue(false);
    }
  }, []);

  useEffect(() => {
    void stores.packs.getState().refresh();
    void loadCatalogue();
  }, [stores, loadCatalogue]);

  const runPackAction = useCallback(
    async (entry: ManifestPackEntry, action: 'install' | 'update') => {
      setBusyPackId(entry.packId);
      // Local dev serves the pack from `serve:packs`, not the production CDN in the manifest.
      const resolved: ManifestPackEntry = { ...entry, downloadUrl: packDownloadUrl(entry) };
      try {
        if (action === 'install') {
          await stores.packs.getState().install(resolved);
        } else {
          await stores.packs.getState().update(resolved);
        }
      } finally {
        setBusyPackId(null);
      }
    },
    [stores],
  );

  const removePack = useCallback(
    async (packId: string) => {
      setBusyPackId(packId);
      try {
        await stores.packs.getState().remove(packId);
      } finally {
        setBusyPackId(null);
      }
    },
    [stores],
  );

  const busy = busyPackId !== null || status === 'loading';
  const fraction =
    progress !== null && progress.totalBytes > 0
      ? Math.min(1, progress.receivedBytes / progress.totalBytes)
      : 0;

  return (
    <section className="flex h-full flex-col gap-lg overflow-hidden">
      <header className="flex items-baseline justify-between">
        <h2 className="font-ui text-uiLg text-ink-primary">Library</h2>
        <p className="font-ui text-uiSm text-ink-secondary">
          Offline storage: <span className="text-ink-primary">{formatBytes(storageBytes)}</span>
        </p>
      </header>

      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}

      {progress !== null && progress.packId === busyPackId && (
        <div className="flex flex-col gap-xs">
          <span className="font-ui text-uiXs text-ink-secondary">
            {`${PHASE_LABELS[progress.phase] ?? progress.phase} ${progress.packId} · ${Math.round(
              fraction * 100,
            )}%`}
          </span>
          <div className="h-xs overflow-hidden rounded-sm bg-elevated">
            <div className="h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
          </div>
        </div>
      )}

      <h3 className="font-ui text-uiSm text-ink-secondary">Installed</h3>
      {status === 'loading' && installed.length === 0 && (
        <p className="font-ui text-uiSm text-ink-secondary">Loading installed packs…</p>
      )}
      {status !== 'loading' && installed.length === 0 && error === null && (
        <p className="font-ui text-uiSm text-ink-secondary">
          No content packs installed yet. Install a pack below to read offline.
        </p>
      )}

      <ul className="flex flex-col gap-sm overflow-y-auto">
        {installed.map((pack) => (
          <li
            key={pack.packId}
            className="flex items-center justify-between gap-md rounded-md border border-hairline bg-surface px-lg py-md"
          >
            <div className="flex flex-col">
              <span className="font-ui text-uiMd text-ink-primary">{pack.packId}</span>
              <span className="font-ui text-uiXs text-ink-secondary">
                {`${PACK_TYPE_LABELS[pack.packType]} · v${pack.contentVersion} · ${formatBytes(
                  pack.fileSizeBytes,
                )}`}
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removePack(pack.packId)}
              className="rounded-pill border border-hairline px-lg py-xs font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between">
        <h3 className="font-ui text-uiSm text-ink-secondary">Catalogue</h3>
        <button
          type="button"
          disabled={busy || loadingCatalogue}
          onClick={() => void loadCatalogue()}
          className="rounded-pill border border-hairline px-lg py-xs font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-50"
        >
          {loadingCatalogue ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {catalogueError !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {`Catalogue unavailable (${catalogueError}). Start the local pack server and retry.`}
        </p>
      )}

      <ul className="flex flex-1 flex-col gap-sm overflow-y-auto">
        {manifest?.packs.map((entry) => {
          const current = installed.find((pack) => pack.packId === entry.packId);
          const hasUpdate = current !== undefined && current.contentVersion !== entry.contentVersion;
          const action: 'install' | 'update' = current === undefined ? 'install' : 'update';
          return (
            <li
              key={entry.packId}
              className="flex items-center justify-between gap-md rounded-md border border-hairline bg-surface px-lg py-md"
            >
              <div className="flex flex-col">
                <span className="font-ui text-uiMd text-ink-primary">{entry.packId}</span>
                <span className="font-ui text-uiXs text-ink-secondary">
                  {`${PACK_TYPE_LABELS[entry.packType]} · v${entry.contentVersion} · ${
                    entry.licenseSpdx
                  } · ${formatBytes(entry.uncompressedBytes)}`}
                </span>
              </div>
              {current !== undefined && !hasUpdate ? (
                <span className="font-ui text-uiXs text-ink-verse">Installed</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runPackAction(entry, action)}
                  className="rounded-pill bg-accent px-lg py-xs font-ui text-uiSm text-canvas transition disabled:opacity-50"
                >
                  {hasUpdate ? `Update to v${entry.contentVersion}` : 'Install'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
