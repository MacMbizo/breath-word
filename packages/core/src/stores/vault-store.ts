// B3 §4.1 `stores/` / §4.2 rule 2 — headless vault store (FR-206).
//
// A framework-free `zustand/vanilla` store the Settings/Vault wizard subscribes to. It wraps
// `VaultRepository` and never exposes the DEK: selectors surface only `enabled`/`unlocked`
// booleans plus the one-time Recovery Key display string. Failures land in `error` as a
// canonical `AppError`; the store never throws (AGENTS.md rule 7).

import { createStore, type StoreApi } from 'zustand/vanilla';

import { asAppError, type AppError, type AppErrorFallback } from '../errors/AppError';
import type { VaultRepository } from '../repositories/vault-repository';
import type { NoteSearchIndex } from '../search/note-search';

import type { AsyncStatus } from './types';

const VAULT_FAILURE: AppErrorFallback = {
  code: 'CRYPTO_VAULT_LOCKED',
  domain: 'CRYPTO',
  retryPolicy: 'USER_ACTION',
  userMessage: 'The Private Vault could not be updated. Please try again.',
};

export interface VaultStoreState {
  readonly status: AsyncStatus;
  readonly error: AppError | null;
  /** Persisted `user_profiles.e2ee_enabled`. */
  readonly enabled: boolean;
  /** Whether the DEK is currently held in RAM. */
  readonly unlocked: boolean;
  /**
   * The 52-character Recovery Key shown once after `init`; cleared on the next action.
   * The raw DEK is never placed in store state.
   */
  readonly recoveryKeyDisplay: string | null;
  /** B6 §4.2.2 — whether a DEK is parked in the OS keystore for biometric fast unlock. */
  readonly biometricEnabled: boolean;
}

export interface VaultStoreActions {
  /** Read the persisted enabled flag for a user (does not unlock). */
  load(userId: string): Promise<void>;
  /** B6 §4.2.1 — create the vault; returns the Recovery Key display string (or null on failure). */
  init(userId: string, passphrase: string): Promise<string | null>;
  /** B6 §4.2.2 — unlock with the Vault Passphrase. */
  unlockWithPassphrase(userId: string, passphrase: string): Promise<boolean>;
  /** B6 §4.2.2 — unlock with the displayed Recovery Key. */
  unlockWithRecoveryKey(userId: string, recoveryKeyDisplay: string): Promise<boolean>;
  /** B6 §4.2.2 — FaceID/TouchID/fingerprint fast unlock from the OS keystore. */
  unlockWithBiometric(userId: string): Promise<boolean>;
  /** B6 §4.2.2 — park the live DEK in the OS keystore (requires an unlocked vault). */
  enableBiometric(): Promise<void>;
  /** B6 §4.2.2 — remove the parked DEK. */
  disableBiometric(): Promise<void>;
  /** B6 §4.2.3 — change the passphrase (zero re-encryption). */
  rewrap(newPassphrase: string): Promise<void>;
  /** B6 §4.2.4 — App Lock: drop the in-RAM DEK. */
  lock(): void;
}

export type VaultStore = StoreApi<VaultStoreState & VaultStoreActions>;

export interface VaultStoreDeps {
  /**
   * ADR-004 / B6 §4.2.4 — the volatile decrypted-note index destroyed alongside the DEK on lock.
   * Optional so tests can construct the store without one.
   */
  readonly noteSearch?: NoteSearchIndex;
}

const INITIAL_STATE: VaultStoreState = {
  status: 'idle',
  error: null,
  enabled: false,
  unlocked: false,
  recoveryKeyDisplay: null,
  biometricEnabled: false,
};

export function createVaultStore(repository: VaultRepository, deps: VaultStoreDeps = {}): VaultStore {
  return createStore<VaultStoreState & VaultStoreActions>()((set) => ({
    ...INITIAL_STATE,

    async load(userId) {
      set({ status: 'loading', error: null });
      try {
        const [enabled, biometricEnabled] = await Promise.all([
          repository.load(userId),
          repository.isBiometricUnlockEnabled(userId).catch(() => false),
        ]);
        set({ enabled, unlocked: repository.isUnlocked(), biometricEnabled, status: 'ready' });
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE) });
      }
    },

    async init(userId, passphrase) {
      set({ status: 'loading', error: null, recoveryKeyDisplay: null });
      try {
        const outcome = await repository.initVault(userId, passphrase);
        set({
          status: 'ready',
          enabled: true,
          unlocked: true,
          // A fresh DEK clears any previously parked biometric key (VaultRepository.initVault).
          biometricEnabled: false,
          recoveryKeyDisplay: outcome.recoveryKeyDisplay,
        });
        return outcome.recoveryKeyDisplay;
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE) });
        return null;
      }
    },

    async unlockWithPassphrase(userId, passphrase) {
      set({ status: 'loading', error: null, recoveryKeyDisplay: null });
      try {
        await repository.unlockWithPassphrase(userId, passphrase);
        set({ status: 'ready', enabled: true, unlocked: true });
        return true;
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE), unlocked: false });
        return false;
      }
    },

    async unlockWithRecoveryKey(userId, recoveryKeyDisplay) {
      set({ status: 'loading', error: null, recoveryKeyDisplay: null });
      try {
        await repository.unlockWithRecoveryKey(userId, recoveryKeyDisplay);
        set({ status: 'ready', enabled: true, unlocked: true });
        return true;
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE), unlocked: false });
        return false;
      }
    },

    async unlockWithBiometric(userId) {
      set({ status: 'loading', error: null, recoveryKeyDisplay: null });
      try {
        const ok = await repository.unlockWithBiometric(userId);
        set({ status: 'ready', enabled: ok, unlocked: ok });
        return ok;
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE), unlocked: false });
        return false;
      }
    },

    async enableBiometric() {
      set({ status: 'loading', error: null });
      try {
        await repository.enableBiometricUnlock();
        set({ status: 'ready', biometricEnabled: true });
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE) });
      }
    },

    async disableBiometric() {
      set({ status: 'loading', error: null });
      try {
        await repository.disableBiometricUnlock();
        set({ status: 'ready', biometricEnabled: false });
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE) });
      }
    },

    async rewrap(newPassphrase) {
      set({ status: 'loading', error: null, recoveryKeyDisplay: null });
      try {
        await repository.rewrapPassphrase(newPassphrase);
        set({ status: 'ready' });
      } catch (error) {
        set({ status: 'error', error: asAppError(error, VAULT_FAILURE) });
      }
    },

    lock() {
      repository.lock();
      // B6 §4.2.4 / ADR-004 — no plaintext note may outlive the DEK in RAM.
      deps.noteSearch?.purge();
      set({ unlocked: false, recoveryKeyDisplay: null });
    },
  }));
}
