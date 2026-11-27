// FR-206 / B6 §4.2 — Private Vault wizard (mobile).
//
// The wizard takes the user from "no vault" to "unlocked" in a few steps: explain → choose a
// Vault Passphrase → show the one-time 52-character Recovery Key (13 blocks of 4) → confirm
// "I saved my Recovery Key" → done. When a vault already exists it offers unlock by passphrase or
// by Recovery Key, plus an explicit App Lock. Every read/write goes through the headless vault
// store; the DEK is never surfaced, and no repository or SQL is touched here (AGENTS.md rule 1).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Canvas, Path, Skia } from '@shopify/react-native-skia';

import { generateRecoveryQr } from '@breath-and-word/core';
import { COLORS, FONT_FACES, FONT_SIZES, LINE_HEIGHTS, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';
import { makeStyles, useTheme } from '../theme/ThemeProvider';


type WizardStep = 'intro' | 'passphrase' | 'recovery' | 'done';

/** Split the 52-char display into its 13 blocks of 4 for readable presentation. */
function recoveryKeyBlocks(display: string): string[] {
  return display.split(/[\s-]+/).filter((block) => block.length > 0);
}

// A QR code must keep dark-on-light contrast to stay scannable, so its plate ignores the
// active theme and always uses the light parchment surface/ink (B6 §4.2 — offline generation).
const QR_PLATE = COLORS.parchment;
const QR_SIZE_PX = 220;
/** Modules of quiet zone the spec requires around a QR code (ISO/IEC 18004). */
const QR_QUIET_ZONE = 2;

/**
 * FR-206 / B6 §4.2 — the Recovery Key rendered as a QR code with Skia. The matrix is computed in
 * `packages/core` (pure TS) and each dark module is drawn as a filled rect, so the code is
 * generated entirely offline and can be scanned straight into a secondary device.
 */
function RecoveryQrCode({ display }: { display: string }) {
  const styles = useStyles();
  const path = useMemo(() => {
    const { matrix, size } = generateRecoveryQr(display);
    const total = size + QR_QUIET_ZONE * 2;
    const cell = QR_SIZE_PX / total;
    const builder = Skia.PathBuilder.Make();
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (matrix[row]?.[col] === true) {
          builder.addRect(
            Skia.XYWHRect(
              (col + QR_QUIET_ZONE) * cell,
              (row + QR_QUIET_ZONE) * cell,
              cell,
              cell,
            ),
          );
        }
      }
    }
    return builder.detach();
  }, [display]);

  return (
    <View style={styles.qrPlate} accessibilityRole="image" accessibilityLabel="Recovery Key QR code">
      <Canvas style={styles.qrCanvas}>
        <Path path={path} color={QR_PLATE.text.primary} />
      </Canvas>
    </View>
  );
}

export function VaultWizardScreen() {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  const runtime = useCoreRuntime();
  const { status, error, enabled, unlocked, recoveryKeyDisplay, biometricEnabled } = useCoreStore(
    runtime.stores.vault,
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>('intro');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [savedAcknowledged, setSavedAcknowledged] = useState(false);

  useEffect(() => {
    void runtime.repositories.identity.getOrCreateCurrentUserId().then(setUserId);
  }, [runtime]);

  // Load the persisted enabled flag once the identity is known.
  useEffect(() => {
    if (userId === null) return;
    void runtime.stores.vault.getState().load(userId);
  }, [userId, runtime]);

  const trimmed = passphrase.trim();
  const canCreate = userId !== null && trimmed.length >= 8 && trimmed === confirm.trim() && !busy(status);

  const createVault = useCallback(async () => {
    if (!canCreate || userId === null) return;
    const display = await runtime.stores.vault.getState().init(userId, trimmed);
    if (display !== null) {
      setStep('recovery');
      setSavedAcknowledged(false);
    }
  }, [canCreate, userId, trimmed, runtime]);

  const unlockWithPassphrase = useCallback(async () => {
    if (userId === null || trimmed === '') return;
    const ok = await runtime.stores.vault.getState().unlockWithPassphrase(userId, trimmed);
    if (ok) setStep('done');
  }, [userId, trimmed, runtime]);

  const unlockWithRecovery = useCallback(async () => {
    if (userId === null || recoveryInput.trim() === '') return;
    const ok = await runtime.stores.vault.getState().unlockWithRecoveryKey(userId, recoveryInput.trim());
    if (ok) setStep('done');
  }, [userId, recoveryInput, runtime]);

  // B6 §4.2.2 — biometric fast unlock is only offered by a hardware-backed keystore.
  const supportsBiometric = runtime.adapters.secureStorage.supportsBiometric;

  const unlockWithBiometric = useCallback(async () => {
    if (userId === null) return;
    const ok = await runtime.stores.vault.getState().unlockWithBiometric(userId);
    if (ok) setStep('done');
  }, [userId, runtime]);

  const toggleBiometric = useCallback(async () => {
    const store = runtime.stores.vault.getState();
    if (store.biometricEnabled) await store.disableBiometric();
    else await store.enableBiometric();
  }, [runtime]);

  const blocks = recoveryKeyDisplay === null ? [] : recoveryKeyBlocks(recoveryKeyDisplay);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Private Vault</Text>
      <Text style={styles.lede}>
        Your private notes and testimonies are encrypted on this device before they sync. Only your
        passphrase can unlock them — we can never read them.
      </Text>

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error.userMessage}
        </Text>
      )}

      {!enabled && step === 'intro' && (
        <View style={styles.card}>
          <Pressable
            onPress={() => setStep('passphrase')}
            accessibilityRole="button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Set up Private Vault</Text>
          </Pressable>
        </View>
      )}

      {!enabled && step === 'passphrase' && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Vault Passphrase</Text>
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            placeholder="At least 8 characters"
            placeholderTextColor={THEME.text.verseNum}
            style={styles.input}
          />
          <Text style={styles.sectionLabel}>Confirm passphrase</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Type it again"
            placeholderTextColor={THEME.text.verseNum}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={() => setStep('intro')}
              accessibilityRole="button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={() => void createVault()}
              disabled={!canCreate}
              accessibilityRole="button"
              style={[styles.primaryButton, !canCreate && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>Create vault</Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === 'recovery' && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Your Recovery Key</Text>
          <Text style={styles.warn}>
            This is shown once. Write it down and store it safely — it is the only other way to
            unlock your vault if you forget your passphrase.
          </Text>
          <View style={styles.keyGrid}>
            {blocks.map((block, index) => (
              <Text key={`${block}-${index}`} style={styles.keyBlock}>
                {block}
              </Text>
            ))}
          </View>
          {recoveryKeyDisplay !== null && (
            <View style={styles.qrSection}>
              <Text style={styles.sectionLabel}>Scan into another device</Text>
              <RecoveryQrCode display={recoveryKeyDisplay} />
            </View>
          )}
          <Pressable
            onPress={() => setSavedAcknowledged((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: savedAcknowledged }}
            style={styles.checkRow}
          >
            <View style={[styles.checkbox, savedAcknowledged && styles.checkboxOn]} />
            <Text style={styles.checkLabel}>I saved my Recovery Key</Text>
          </Pressable>
          <Pressable
            onPress={() => setStep('done')}
            disabled={!savedAcknowledged}
            accessibilityRole="button"
            style={[styles.primaryButton, !savedAcknowledged && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      )}

      {enabled && !unlocked && step !== 'done' && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Unlock your vault</Text>
          {supportsBiometric && biometricEnabled && (
            <Pressable
              onPress={() => void unlockWithBiometric()}
              disabled={busy(status)}
              accessibilityRole="button"
              style={[styles.primaryButton, busy(status) && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>Unlock with Face ID / fingerprint</Text>
            </Pressable>
          )}
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Vault Passphrase"
            placeholderTextColor={THEME.text.verseNum}
            style={styles.input}
          />
          <Pressable
            onPress={() => void unlockWithPassphrase()}
            disabled={busy(status) || trimmed === ''}
            accessibilityRole="button"
            style={[styles.primaryButton, (busy(status) || trimmed === '') && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>Unlock</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>Or use your Recovery Key</Text>
          <TextInput
            value={recoveryInput}
            onChangeText={setRecoveryInput}
            autoCapitalize="characters"
            placeholder="XXXX XXXX XXXX …"
            placeholderTextColor={THEME.text.verseNum}
            style={styles.input}
          />
          <Pressable
            onPress={() => void unlockWithRecovery()}
            disabled={busy(status) || recoveryInput.trim() === ''}
            accessibilityRole="button"
            style={[
              styles.secondaryButton,
              (busy(status) || recoveryInput.trim() === '') && styles.disabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Unlock with Recovery Key</Text>
          </Pressable>
        </View>
      )}

      {(step === 'done' || (enabled && unlocked)) && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Vault unlocked</Text>
          <Text style={styles.lede}>
            Your private notes are encrypted on this device. Lock the vault whenever you step away.
          </Text>
          {supportsBiometric && (
            <Pressable
              onPress={() => void toggleBiometric()}
              disabled={busy(status)}
              accessibilityRole="switch"
              accessibilityState={{ checked: biometricEnabled }}
              style={styles.checkRow}
            >
              <View style={[styles.checkbox, biometricEnabled && styles.checkboxOn]} />
              <Text style={styles.checkLabel}>Unlock with Face ID / fingerprint</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => runtime.stores.vault.getState().lock()}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Lock now</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function busy(status: string): boolean {
  return status === 'loading';
}

const useStyles = makeStyles((THEME) => ({
  content: {
    gap: SPACING.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
    backgroundColor: THEME.bg.canvas,
  },
  title: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  lede: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.secondary,
  },
  card: {
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  sectionLabel: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  warn: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.redLetter,
  },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  qrSection: { alignItems: 'center', gap: SPACING.sm },
  qrPlate: {
    padding: SPACING.sm,
    borderRadius: RADII.md,
    backgroundColor: QR_PLATE.bg.surface,
  },
  qrCanvas: { width: QR_SIZE_PX, height: QR_SIZE_PX },
  keyBlock: {
    minWidth: MIN_TOUCH_TARGET,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.sm,
    backgroundColor: THEME.bg.elevated,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
    textAlign: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  checkboxOn: { backgroundColor: THEME.accent.primary, borderColor: THEME.accent.primary },
  checkLabel: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.canvas,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
  error: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.redLetter,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  disabled: { opacity: 0.4 },
}));
