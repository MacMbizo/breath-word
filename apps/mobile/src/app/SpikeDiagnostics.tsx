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

import {
  AppError,
  buildRowAad,
  bytesToBase64Url,
  bytesToUtf8,
  decryptEnvelope,
  encryptEnvelope,
  parseEnvelope,
  parsePackManifest,
  utf8ToBytes,
} from '@breath-and-word/core';
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
/**
 * B3 §4.5 pins the FTS5 latency assertion to "a single distinctive marker verse (Rom 8:28)".
 * The sample pack puts this phrase in exactly one verse so the timed reads hit a small, stable
 * result set rather than bm25-ranking the whole ~31k-row corpus.
 */
const MARKER_QUERY = 'work together for good';
/** `BBCCCVVV` id of the marker verse (Romans 8:28) the probe must return. */
const MARKER_VERSE_ID = 45008028;
/** Corpus-wide phrase present in every filler verse — reported as a non-gating stress datapoint. */
const STRESS_QUERY = 'came to pass';
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

// --- Gate-1 Spike 3 (crypto parity, B6 §4.2) ------------------------------------------------
// The device derives a key with PBKDF2-SHA256 and produces an `e2ee:v1` envelope through the same
// `react-native-quick-crypto` adapter the vault uses. The PBKDF2 output is checked against a
// host-computed KAT (node:crypto WebCrypto), and the emitted envelope can be decrypted back on the
// host to prove the native and Web adapters are byte-compatible.
const SPIKE3_PASSPHRASE = 'breath-and-word';
const SPIKE3_SALT = 'spike3-salt-v1';
const SPIKE3_ITERATIONS = 100000;
const SPIKE3_KEY_BYTES = 32;
/** Host WebCrypto KAT: PBKDF2-SHA256(passphrase, salt, iterations, 32) — must match the device. */
const SPIKE3_KAT_HEX = 'a378d6301d33313ac935ef4826471f2765b752557be0d098e63bb42515412a43';
const SPIKE3_DEK = new Uint8Array(32).fill(7);
const SPIKE3_PLAINTEXT = 'Lord, teach me to pray.';
const SPIKE3_AAD = buildRowAad(
  'prayer_item_user_states',
  '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  'user_notes_payload',
);

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

/** Lowercase hex — used to compare the device PBKDF2 output against the host KAT. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
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

      // B3 §4.5 assertion target: one distinctive marker verse, not a corpus-wide phrase.
      const markerHits = await runtime.repositories.reader.search({
        packId: SAMPLE_PACK_ID,
        text: MARKER_QUERY,
      });
      const markerFound = markerHits.some((hit) => hit.canonicalVerseId === MARKER_VERSE_ID);
      append(
        `[spike1] marker "${MARKER_QUERY}" -> ${markerHits.length} hit(s); Rom 8:28 ${markerFound ? 'found' : 'MISSING'}`,
      );

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
          await runtime.repositories.reader.search({
            packId: SAMPLE_PACK_ID,
            text: MARKER_QUERY,
          });
          readDurations.push(nowMs() - startedAt);
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

      // Non-gating stress datapoint: the corpus-wide phrase bm25-ranks every filler verse.
      const stressStartedAt = nowMs();
      const stressHits = await runtime.repositories.reader.search({
        packId: SAMPLE_PACK_ID,
        text: STRESS_QUERY,
      });
      append(
        `[spike1] stress "${STRESS_QUERY}" -> ${stressHits.length} hits in ${(nowMs() - stressStartedAt).toFixed(1)}ms (limit-capped, non-gating)`,
      );

      const pass = markerFound && writeFailures === 0 && max < LATENCY_BUDGET_MS;
      append(
        pass
          ? `[spike1] PASS — Rom 8:28 found, <${LATENCY_BUDGET_MS}ms, no lock contention`
          : `[spike1] CHECK — marker ${markerFound ? 'found' : 'MISSING'}, budget ${LATENCY_BUDGET_MS}ms, see numbers above`,
      );
    } catch (error) {
      append(`[spike1] FAILED — ${describeError(error)}`);
    } finally {
      setBusy(false);
    }
  }, [append, runtime]);

  const runSpike3 = useCallback(async () => {
    setBusy(true);
    try {
      const crypto = runtime.adapters.crypto;

      // 1. PBKDF2-SHA256 KAT — must be bit-identical to the host WebCrypto result.
      const derived = await crypto.pbkdf2Sha256(
        SPIKE3_PASSPHRASE,
        utf8ToBytes(SPIKE3_SALT),
        SPIKE3_ITERATIONS,
        SPIKE3_KEY_BYTES,
      );
      const derivedHex = toHex(derived);
      const kdfOk = derivedHex === SPIKE3_KAT_HEX;
      append(
        `[spike3] pbkdf2-sha256 "${SPIKE3_PASSPHRASE}" iter=${SPIKE3_ITERATIONS} -> ${derivedHex}`,
      );
      append(
        kdfOk
          ? '[spike3] KDF matches host KAT'
          : `[spike3] KDF MISMATCH — expected ${SPIKE3_KAT_HEX}`,
      );

      // 2. `e2ee:v1` envelope round-trip through the native AES-256-GCM adapter.
      const envelope = await encryptEnvelope(crypto, {
        dek: SPIKE3_DEK,
        plaintext: utf8ToBytes(SPIKE3_PLAINTEXT),
        aad: SPIKE3_AAD,
      });
      append(`[spike3] envelope=${envelope}`);
      const decrypted = bytesToUtf8(
        await decryptEnvelope(crypto, SPIKE3_DEK, envelope, SPIKE3_AAD),
      );
      const roundTripOk = decrypted === SPIKE3_PLAINTEXT;
      append(
        roundTripOk
          ? `[spike3] round-trip OK — "${decrypted}"`
          : `[spike3] ROUND-TRIP MISMATCH — got "${decrypted}"`,
      );

      // 3. Tamper check — a flipped ciphertext byte must fail authentication.
      const { iv, ciphertext } = parseEnvelope(envelope);
      const tampered = new Uint8Array(ciphertext);
      tampered[0] = (tampered[0] ?? 0) ^ 0xff;
      const tamperedEnvelope = `e2ee:v1:${bytesToBase64Url(iv)}:${bytesToBase64Url(tampered)}`;
      let tamperOk = false;
      try {
        await decryptEnvelope(crypto, SPIKE3_DEK, tamperedEnvelope, SPIKE3_AAD);
      } catch (error) {
        tamperOk = error instanceof AppError && error.code === 'CRYPTO_DECRYPT_FAILED';
        append(`[spike3] tampered envelope rejected — ${describeError(error)}`);
      }
      if (!tamperOk) {
        append('[spike3] TAMPER CHECK FAILED — tampered envelope did not raise CRYPTO_DECRYPT_FAILED');
      }

      const pass = kdfOk && roundTripOk && tamperOk;
      append(pass ? '[spike3] PASS — native crypto matches host WebCrypto' : '[spike3] CHECK — see lines above');
    } catch (error) {
      append(`[spike3] FAILED — ${describeError(error)}`);
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
        <Pressable
          disabled={busy}
          onPress={runSpike3}
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Run Spike 3</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => setLines([])} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {lines.length === 0 ? (
          <Text style={styles.logPlaceholder}>
            {busy ? 'Working…' : 'No runs yet. Install the sample pack, then run Spike 1 or Spike 3.'}
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
