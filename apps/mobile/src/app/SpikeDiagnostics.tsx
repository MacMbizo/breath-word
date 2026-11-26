// Dev-only Gate-1 Spike 1 diagnostics (B3 §4.5). This is an internal harness, NOT product UI —
// it exists so the dual-SQLite lock-contention claim can be measured on a real device.
//
// It drives the headless core repositories only (AGENTS.md rule 1 — no raw SQL in the UI layer):
//   * pack setup   -> PackManagerRepository.install (the real FR-105 download/verify/attach path)
//   * timed read   -> ReaderRepository.search (op-sqlite ATTACH + FTS5 on the content connection)
//   * concurrent write -> ReadingPlanRepository.markDayComplete (PowerSync `user_data.sqlite`)
//
// Success = the FTS5 reads stay well under 20 ms while the user-data writes are in flight, with no
// SQLITE_BUSY / lock failure on either side (ADR-002 dual-SQLite separation, B4 §4.6).

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppError, parsePackManifest } from '@breath-and-word/core';
import {
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  MIN_TOUCH_TARGET,
  RADII,
  SPACING,
} from '@breath-and-word/tokens';

import { packDownloadUrl, packManifestUrl } from '../config/pack-server';
import { useCoreRuntime } from './CoreRuntime';

const THEME = COLORS.daylight;

/** Pack id emitted by `pack-builder --sample` (tools/pack-builder). */
const SAMPLE_PACK_ID = 'core_bsb';
/** Phrase present in every synthetic filler verse, so the query scans the whole ~31k-row corpus. */
const HEAVY_QUERY = 'came to pass';
/** Timed FTS5 reads — enough iterations for a stable p50. */
const SEARCH_ITERATIONS = 25;
/** Concurrent `user_data.sqlite` writes issued while the reads run. */
const CONCURRENT_WRITES = 25;
/** Fixed dev identifiers; the harness never touches a real user's rows. */
const DEV_USER_ID = 'spike-user';
const DEV_ENROLLMENT_ID = 'spike-enrollment';
const DEV_PLAN_ID = 'spike-plan';
/** Gate-1 Spike 1 latency budget (B3 §4.5). */
const LATENCY_BUDGET_MS = 20;

/** High-resolution clock where available (Hermes), falling back to `Date.now()`. */
const perf = (globalThis as { performance?: { now(): number } }).performance;
function nowMs(): number {
  return perf?.now() ?? Date.now();
}

/** Flatten an error plus its `internalDetail`/cause chain so a device run names the exact failure. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof AppError) {
      parts.push(current.internalDetail ?? current.message);
      current = current.cause;
    } else if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      current = undefined;
    }
  }
  return parts.filter((part) => part.length > 0).join(' <- ');
}

/** Nearest-rank percentile of an ascending array. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

export function SpikeDiagnostics() {
  const runtime = useCoreRuntime();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  const append = useCallback((line: string) => {
    setLines((prev) => [...prev, line]);
  }, []);

  const installSamplePack = useCallback(async () => {
    setBusy(true);
    const manifestUrl = packManifestUrl();
    append(`[install] GET ${manifestUrl}`);
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`manifest request failed: HTTP ${response.status}`);
      }
      const manifest = parsePackManifest(await response.json());
      const entry = manifest.packs.find((pack) => pack.packId === SAMPLE_PACK_ID);
      if (entry === undefined) {
        throw new Error(`manifest has no "${SAMPLE_PACK_ID}" pack`);
      }
      append(`[install] downloading ${packDownloadUrl(entry)} (${entry.compressedBytes} B gz)`);
      const installed = await runtime.repositories.packs.install(
        { ...entry, downloadUrl: packDownloadUrl(entry) },
        (phase, received, total) => {
          // Non-downloading phases fire once each, so this names exactly which step is in flight
          // (or stalls) on screen — release builds emit no JS logs to logcat.
          if (phase !== 'downloading') {
            append(`[install] ${phase} (${received}/${total} B)`);
          }
        },
      );
      append(`[install] attached "${installed.packId}" v${installed.contentVersion} (${installed.fileSizeBytes} B)`);
    } catch (error) {
      append(`[install] FAILED — ${describeError(error)}`);
    } finally {
      setBusy(false);
    }
  }, [append, runtime]);

  const runSpike1 = useCallback(async () => {
    setBusy(true);
    try {
      const reattached = await runtime.repositories.packs.attachInstalledPacks();
      if (reattached.length > 0) {
        append(`[spike1] re-attached on cold start: ${reattached.join(', ')}`);
      }

      const packs = await runtime.repositories.packs.listInstalled();
      if (!packs.some((pack) => pack.packId === SAMPLE_PACK_ID)) {
        append(`[spike1] "${SAMPLE_PACK_ID}" is not installed — run install first.`);
        return;
      }

      const readDurations: number[] = [];
      let writeFailures = 0;

      const writes = (async () => {
        for (let day = 1; day <= CONCURRENT_WRITES; day += 1) {
          try {
            await runtime.repositories.readingPlans.markDayComplete(
              DEV_USER_ID,
              DEV_ENROLLMENT_ID,
              DEV_PLAN_ID,
              day,
            );
          } catch (error) {
            writeFailures += 1;
            append(`[spike1] user_data write #${day} FAILED — ${describeError(error)}`);
          }
        }
      })();

      const reads = (async () => {
        for (let i = 0; i < SEARCH_ITERATIONS; i += 1) {
          const startedAt = nowMs();
          const hits = await runtime.repositories.reader.search({
            packId: SAMPLE_PACK_ID,
            text: HEAVY_QUERY,
          });
          readDurations.push(nowMs() - startedAt);
          if (i === 0) {
            append(`[spike1] MATCH "${HEAVY_QUERY}" -> ${hits.length} hits (limit-capped)`);
          }
        }
      })();

      await Promise.all([writes, reads]);

      const sorted = [...readDurations].sort((a, b) => a - b);
      const min = sorted[0] ?? 0;
      const p50 = percentile(sorted, 50);
      const max = sorted[sorted.length - 1] ?? 0;
      append(
        `[spike1] FTS5 reads n=${sorted.length}  min=${min.toFixed(1)}ms  p50=${p50.toFixed(1)}ms  max=${max.toFixed(1)}ms`,
      );
      append(`[spike1] concurrent user_data writes: ${CONCURRENT_WRITES - writeFailures}/${CONCURRENT_WRITES} ok`);

      const pass = writeFailures === 0 && max < LATENCY_BUDGET_MS;
      append(
        pass
          ? `[spike1] PASS — <${LATENCY_BUDGET_MS}ms with no lock contention`
          : `[spike1] CHECK — budget ${LATENCY_BUDGET_MS}ms, see numbers above`,
      );
    } catch (error) {
      append(`[spike1] FAILED — ${describeError(error)}`);
    } finally {
      setBusy(false);
    }
  }, [append, runtime]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Gate-1 Spike Diagnostics</Text>
        <Text style={styles.subtitle}>Dev-only. Catalogue: {packManifestUrl()}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          disabled={busy}
          onPress={installSamplePack}
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Install sample pack</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={runSpike1}
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Run Spike 1</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => setLines([])} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {lines.length === 0 ? (
          <Text style={styles.logPlaceholder}>
            {busy ? 'Working…' : 'No runs yet. Install the sample pack, then run Spike 1.'}
          </Text>
        ) : (
          lines.map((line, index) => (
            <Text key={index} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: THEME.bg.canvas,
  },
  header: { gap: SPACING.xs },
  title: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  subtitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
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
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
    textAlign: 'center',
  },
  log: {
    flex: 1,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  logContent: { padding: SPACING.md, gap: SPACING.xs },
  logPlaceholder: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  logLine: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.primary,
  },
});
