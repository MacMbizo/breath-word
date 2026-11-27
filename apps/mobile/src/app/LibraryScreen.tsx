// FR-105 Content Pack Manager (mobile) — the Library & Storage screen (B3 §4.1, B4 §4.6).
//
// Shows the packs already on the device (with the offline storage total) and the packs offered by
// the published `manifest.json`, then drives install / update / remove through the headless
// `packStore`. Per AGENTS.md rule 1 no SQL lives here; download progress is mirrored from the
// store and failures surface as canonical `AppError`s.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  parsePackManifest,
  type ManifestPackEntry,
  type PackManifest,
  type PackType,
} from '@breath-and-word/core';
import { FONT_FACES, FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { packDownloadUrl, packManifestUrl } from '../config/pack-server';
import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';
import { makeStyles } from '../theme/ThemeProvider';


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
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LibraryScreen() {
  const styles = useStyles();
  const runtime = useCoreRuntime();
  const packs = runtime.stores.packs;
  const { installed, storageBytes, status, error, progress } = useCoreStore(packs);

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
    void packs.getState().refresh();
    void loadCatalogue();
  }, [packs, loadCatalogue]);

  const runPackAction = useCallback(
    async (entry: ManifestPackEntry, action: 'install' | 'update') => {
      setBusyPackId(entry.packId);
      // Local dev serves the pack from `serve:packs`, not the production CDN in the manifest.
      const resolved: ManifestPackEntry = { ...entry, downloadUrl: packDownloadUrl(entry) };
      try {
        if (action === 'install') {
          await packs.getState().install(resolved);
        } else {
          await packs.getState().update(resolved);
        }
      } finally {
        setBusyPackId(null);
      }
    },
    [packs],
  );

  const removePack = useCallback(
    async (packId: string) => {
      setBusyPackId(packId);
      try {
        await packs.getState().remove(packId);
      } finally {
        setBusyPackId(null);
      }
    },
    [packs],
  );

  const busy = busyPackId !== null || status === 'loading';
  const fraction =
    progress !== null && progress.totalBytes > 0
      ? Math.min(1, progress.receivedBytes / progress.totalBytes)
      : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Content Library</Text>
        <Text style={styles.subtitle}>{`Offline storage · ${formatBytes(storageBytes)}`}</Text>
      </View>

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error.userMessage}
        </Text>
      )}

      {progress !== null && progress.packId === busyPackId && (
        <View style={styles.progressRow}>
          <Text style={styles.muted}>
            {`${PHASE_LABELS[progress.phase] ?? progress.phase} ${progress.packId} · ${Math.round(fraction * 100)}%`}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Installed</Text>
      {installed.length === 0 ? (
        <Text style={styles.muted}>No content packs are installed yet.</Text>
      ) : (
        installed.map((pack) => (
          <View key={pack.packId} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.packName}>{pack.packId}</Text>
              <Text style={styles.muted}>
                {`${PACK_TYPE_LABELS[pack.packType]} · v${pack.contentVersion} · ${formatBytes(pack.fileSizeBytes)}`}
              </Text>
            </View>
            {busyPackId === pack.packId ? (
              <ActivityIndicator />
            ) : (
              <Pressable
                disabled={busy}
                onPress={() => void removePack(pack.packId)}
                accessibilityRole="button"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Remove</Text>
              </Pressable>
            )}
          </View>
        ))
      )}

      <View style={styles.catalogueHeader}>
        <Text style={styles.sectionTitle}>Catalogue</Text>
        <Pressable disabled={busy || loadingCatalogue} onPress={() => void loadCatalogue()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{loadingCatalogue ? 'Loading…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {catalogueError !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {`Catalogue unavailable (${catalogueError}). Start the local pack server and retry.`}
        </Text>
      )}

      {manifest !== null &&
        manifest.packs.map((entry) => {
          const current = installed.find((pack) => pack.packId === entry.packId);
          const hasUpdate = current !== undefined && current.contentVersion !== entry.contentVersion;
          const action: 'install' | 'update' = current === undefined ? 'install' : 'update';
          return (
            <View key={entry.packId} style={styles.card}>
              <View style={styles.cardBody}>
                <Text style={styles.packName}>{entry.packId}</Text>
                <Text style={styles.muted}>
                  {`${PACK_TYPE_LABELS[entry.packType]} · v${entry.contentVersion} · ${entry.licenseSpdx} · ${formatBytes(entry.uncompressedBytes)}`}
                </Text>
              </View>
              {busyPackId === entry.packId ? (
                <ActivityIndicator />
              ) : current !== undefined && !hasUpdate ? (
                <Text style={styles.installedBadge}>Installed</Text>
              ) : (
                <Pressable
                  disabled={busy}
                  onPress={() => void runPackAction(entry, action)}
                  accessibilityRole="button"
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {hasUpdate ? `Update to v${entry.contentVersion}` : 'Install'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
    </ScrollView>
  );
}

const useStyles = makeStyles((THEME) => ({
  root: { flex: 1, backgroundColor: THEME.bg.canvas },
  content: { padding: SPACING.xl, gap: SPACING.sm },
  header: { gap: SPACING.xs, marginBottom: SPACING.sm },
  title: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  subtitle: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  sectionTitle: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
    marginTop: SPACING.md,
  },
  catalogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  cardBody: { flex: 1, gap: SPACING.xxs },
  packName: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  muted: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  error: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.redLetter,
  },
  progressRow: { gap: SPACING.xs },
  progressTrack: {
    height: SPACING.xs,
    borderRadius: RADII.sm,
    backgroundColor: THEME.bg.elevated,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: THEME.accent.primary },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
    textAlign: 'center',
  },
  installedBadge: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.verseNum,
  },
}));
