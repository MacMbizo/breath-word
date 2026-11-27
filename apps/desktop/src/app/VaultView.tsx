// FR-206 / B6 §4.2 — Private Vault wizard (desktop).
//
// Mirrors the mobile `VaultWizardScreen`: explain → choose a Vault Passphrase → show the one-time
// 52-character Recovery Key (13 blocks of 4) → confirm "I saved my Recovery Key" → done. When a
// vault already exists it offers unlock by passphrase or by Recovery Key, plus an explicit Lock.
// Every read/write goes through the headless vault store; the DEK is never surfaced, and no
// repository or SQL is touched here (AGENTS.md rule 1).
import { useCallback, useEffect, useMemo, useState } from 'react';

import { generateRecoveryQr } from '@breath-and-word/core';
import { COLORS } from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

type WizardStep = 'intro' | 'passphrase' | 'recovery' | 'done';

/** Split the 52-char display into its 13 blocks of 4 for readable presentation. */
function recoveryKeyBlocks(display: string): string[] {
  return display.split(/[\s-]+/).filter((block) => block.length > 0);
}

// A QR code must keep dark-on-light contrast to stay scannable, so its plate ignores the active
// theme and always uses the daylight surface/ink (B6 §4.2 — offline generation).
const QR_PLATE = COLORS.daylight;
/** Modules of quiet zone the spec requires around a QR code (ISO/IEC 18004). */
const QR_QUIET_ZONE = 2;

/** FR-206 / B6 §4.2 — the Recovery Key as an inline SVG QR code (scan into a secondary device). */
function RecoveryQrCode({ display }: { display: string }) {
  const { size, d } = useMemo(() => {
    const { matrix, size: modules } = generateRecoveryQr(display);
    let path = '';
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (matrix[row]?.[col] === true) path += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: modules, d: path };
  }, [display]);

  return (
    <svg
      role="img"
      aria-label="Recovery Key QR code"
      viewBox={`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${size + QR_QUIET_ZONE * 2} ${size + QR_QUIET_ZONE * 2}`}
      width={220}
      height={220}
      shapeRendering="crispEdges"
      className="rounded-md border border-hairline"
      style={{ backgroundColor: QR_PLATE.bg.surface }}
    >
      <path d={d} fill={QR_PLATE.text.primary} />
    </svg>
  );
}

const FIELD =
  'rounded-md border border-hairline bg-canvas px-md py-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent';
const SECTION_LABEL = 'font-ui text-uiXs text-ink-secondary';
const PRIMARY =
  'rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-40';
const OUTLINE =
  'rounded-pill border border-hairline px-xl py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40';
const CARD = 'flex flex-col gap-md rounded-lg border border-hairline bg-surface p-xl';

export function VaultView() {
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
  const busy = status === 'loading';
  const canCreate = userId !== null && trimmed.length >= 8 && trimmed === confirm.trim() && !busy;

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
    const ok = await runtime.stores.vault
      .getState()
      .unlockWithRecoveryKey(userId, recoveryInput.trim());
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
    <section className="flex h-full flex-col gap-lg overflow-y-auto">
      <h2 className="font-ui text-uiLg text-ink-primary">Private Vault</h2>
      <p className="font-ui text-uiSm text-ink-secondary">
        Your private notes and testimonies are encrypted on this device before they sync. Only your
        passphrase can unlock them — we can never read them.
      </p>

      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}

      {!enabled && step === 'intro' && (
        <div className={CARD}>
          <button type="button" onClick={() => setStep('passphrase')} className={PRIMARY}>
            Set up Private Vault
          </button>
        </div>
      )}

      {!enabled && step === 'passphrase' && (
        <div className={CARD}>
          <label className="flex flex-col gap-xxs">
            <span className={SECTION_LABEL}>Vault Passphrase</span>
            <input
              className={FIELD}
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <label className="flex flex-col gap-xxs">
            <span className={SECTION_LABEL}>Confirm passphrase</span>
            <input
              className={FIELD}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
          </label>
          <div className="flex justify-end gap-sm">
            <button type="button" onClick={() => setStep('intro')} className={OUTLINE}>
              Back
            </button>
            <button
              type="button"
              onClick={() => void createVault()}
              disabled={!canCreate}
              className={PRIMARY}
            >
              Create vault
            </button>
          </div>
        </div>
      )}

      {step === 'recovery' && (
        <div className={CARD}>
          <span className={SECTION_LABEL}>Your Recovery Key</span>
          <p className="font-ui text-uiSm text-ink-red">
            This is shown once. Write it down and store it safely — it is the only other way to
            unlock your vault if you forget your passphrase.
          </p>
          <div className="flex flex-wrap gap-sm">
            {blocks.map((block, index) => (
              <span
                key={`${block}-${index}`}
                className="min-w-11 rounded-sm bg-elevated px-md py-sm text-center font-ui text-uiMd text-ink-primary"
              >
                {block}
              </span>
            ))}
          </div>
          {recoveryKeyDisplay !== null && (
            <div className="flex flex-col items-start gap-sm">
              <span className={SECTION_LABEL}>Scan into another device</span>
              <RecoveryQrCode display={recoveryKeyDisplay} />
            </div>
          )}
          <label className="flex items-center gap-md">
            <input
              type="checkbox"
              checked={savedAcknowledged}
              onChange={(e) => setSavedAcknowledged(e.target.checked)}
            />
            <span className="font-ui text-uiSm text-ink-primary">I saved my Recovery Key</span>
          </label>
          <button
            type="button"
            onClick={() => setStep('done')}
            disabled={!savedAcknowledged}
            className={PRIMARY}
          >
            Continue
          </button>
        </div>
      )}

      {enabled && !unlocked && step !== 'done' && (
        <div className={CARD}>
          <span className={SECTION_LABEL}>Unlock your vault</span>
          {supportsBiometric && biometricEnabled && (
            <button
              type="button"
              onClick={() => void unlockWithBiometric()}
              disabled={busy}
              className={PRIMARY}
            >
              Unlock with Windows Hello / Touch ID
            </button>
          )}
          <input
            className={FIELD}
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Vault Passphrase"
          />
          <button
            type="button"
            onClick={() => void unlockWithPassphrase()}
            disabled={busy || trimmed === ''}
            className={PRIMARY}
          >
            Unlock
          </button>
          <span className={SECTION_LABEL}>Or use your Recovery Key</span>
          <input
            className={FIELD}
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value)}
            placeholder="XXXX XXXX XXXX …"
          />
          <button
            type="button"
            onClick={() => void unlockWithRecovery()}
            disabled={busy || recoveryInput.trim() === ''}
            className={OUTLINE}
          >
            Unlock with Recovery Key
          </button>
        </div>
      )}

      {(step === 'done' || (enabled && unlocked)) && (
        <div className={CARD}>
          <span className={SECTION_LABEL}>Vault unlocked</span>
          <p className="font-ui text-uiSm text-ink-secondary">
            Your private notes are encrypted on this device. Lock the vault whenever you step away.
          </p>
          {supportsBiometric && (
            <label className="flex items-center gap-md">
              <input
                type="checkbox"
                checked={biometricEnabled}
                onChange={() => void toggleBiometric()}
              />
              <span className="font-ui text-uiSm text-ink-primary">
                Unlock with Windows Hello / Touch ID
              </span>
            </label>
          )}
          <button
            type="button"
            onClick={() => runtime.stores.vault.getState().lock()}
            className={OUTLINE}
          >
            Lock now
          </button>
        </div>
      )}
    </section>
  );
}
