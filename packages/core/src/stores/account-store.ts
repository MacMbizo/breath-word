// C4 §4.1 — headless account/session store (FR-206).
//
// The transport-free orchestrator for the Zero-Loss Guest → Account upgrade. It observes the app's
// `AuthAdapter` and, the moment a Supabase account appears, it (1) runs the atomic local rewrite of
// every guest-owned row onto the `authUserId` via `IdentityRepository`, then (2) connects PowerSync
// so the migrated rows upload into the account (C4 §4.1 steps 1–2). Ordering is load-bearing: the
// rewrite must commit *before* `connect()` uploads, otherwise PowerSync would try to upload
// guest-owned rows and RLS would reject them.
//
// It never throws (failures land in `error` as a canonical `AppError` — AGENTS.md rule 7), and it
// stays inert when no auth adapter is injected, so an unprovisioned build is pure Offline Guest Mode.

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { AuthAdapter, AuthSession, SyncAdapter } from '../adapters';
import { AUTH_GUEST_MIGRATION_FALLBACK, AUTH_REQUIRED_FALLBACK, authRequiredError } from '../auth';
import { asAppError, type AppError } from '../errors/AppError';
import type { IdentityMigrationReport, IdentityRepository } from '../repositories/identity-repository';

import type { AsyncStatus } from './types';

export interface AccountStoreDeps {
  /** The auth transport seam; `null` when the build has no Supabase provisioning (Plan §6). */
  readonly auth: AuthAdapter | null;
  /** Owns the atomic guest→account rewrite across the 11 synced tables (C4 §4.1 step 1). */
  readonly identity: IdentityRepository;
  /** Transport seam whose `connect()` uploads the migrated rows (C4 §4.1 step 2). */
  readonly sync: SyncAdapter;
  /**
   * B6 §4.2.4 / ADR-004 — invoked once the session has ended so signing out leaves neither the
   * in-RAM DEK nor the volatile decrypted-note index behind. Optional so tests can omit it.
   */
  readonly onSignOut?: () => void;
}

export interface AccountStoreState {
  readonly status: AsyncStatus;
  readonly error: AppError | null;
  /** False when no auth adapter is injected — the device is permanently in Offline Guest Mode. */
  readonly configured: boolean;
  readonly signedIn: boolean;
  readonly session: AuthSession | null;
  /** True while the guest→account rewrite + reconnect is in flight. */
  readonly upgrading: boolean;
  /** Report of the most recent successful upgrade this session, else `null`. */
  readonly lastMigration: IdentityMigrationReport | null;
}

export interface AccountStoreActions {
  /** Seed from the adapter, subscribe to auth transitions, then run any pending upgrade. Idempotent. */
  start(): Promise<void>;
  /** Drop subscriptions; the device keeps whatever identity it already has. */
  stop(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export type AccountStore = StoreApi<AccountStoreState & AccountStoreActions>;

export function createAccountStore(deps: AccountStoreDeps): AccountStore {
  const { auth, identity, sync, onSignOut } = deps;

  // Subscriptions live in the closure, never in state (functions do not belong in the store).
  let unsubscribe: (() => void) | null = null;
  // Serialises session transitions so the SIGNED_IN callback and the explicit `signIn()` cannot
  // race the guest→account rewrite (only one migration may run per account id).
  let queue: Promise<void> = Promise.resolve();

  return createStore<AccountStoreState & AccountStoreActions>()((set) => {
    /** C4 §4.1 — rewrite guest rows onto the account, then connect so they upload. */
    const applySession = async (session: AuthSession | null): Promise<void> => {
      if (session === null) {
        // Signed out: settle the loading spinner `start()`/`signIn()` raised, or the sign-in
        // button would stay disabled on "Working…" forever (the pre-auth state is a ready one).
        set({ session: null, signedIn: false, upgrading: false, status: 'ready' });
        return;
      }
      set({ session, signedIn: true, upgrading: true, error: null });
      try {
        const guestUserId = await identity.getGuestUserId();
        if (guestUserId !== null && guestUserId !== session.userId) {
          const report = await identity.migrateGuestToAccount(guestUserId, session.userId);
          set({ lastMigration: report });
        }
        await sync.connect();
        set({ status: 'ready', upgrading: false });
      } catch (error) {
        set({
          status: 'error',
          upgrading: false,
          error: asAppError(error, AUTH_GUEST_MIGRATION_FALLBACK),
        });
      }
    };

    const enqueue = (session: AuthSession | null): Promise<void> => {
      queue = queue.then(() => applySession(session));
      return queue;
    };

    return {
      status: 'idle',
      error: null,
      configured: auth !== null,
      signedIn: false,
      session: null,
      upgrading: false,
      lastMigration: null,

      async start() {
        if (auth === null) {
          set({ status: 'ready', configured: false });
          return;
        }
        set({ status: 'loading', configured: true, error: null });
        if (unsubscribe === null) {
          unsubscribe = auth.onAuthStateChange((session) => {
            void enqueue(session);
          });
        }
        try {
          await enqueue(await auth.getSession());
        } catch (error) {
          set({ status: 'error', error: asAppError(error, AUTH_REQUIRED_FALLBACK) });
        }
      },

      async stop() {
        unsubscribe?.();
        unsubscribe = null;
        set({ status: 'idle', upgrading: false });
      },

      async signIn(email, password) {
        if (auth === null) {
          set({ status: 'error', error: authRequiredError() });
          return;
        }
        set({ status: 'loading', error: null });
        try {
          await enqueue(await auth.signInWithPassword(email, password));
        } catch (error) {
          set({ status: 'error', error: asAppError(error, AUTH_REQUIRED_FALLBACK) });
        }
      },

      async signUp(email, password) {
        if (auth === null) {
          set({ status: 'error', error: authRequiredError() });
          return;
        }
        set({ status: 'loading', error: null });
        try {
          await enqueue(await auth.signUpWithPassword(email, password));
        } catch (error) {
          set({ status: 'error', error: asAppError(error, AUTH_REQUIRED_FALLBACK) });
        }
      },

      async signOut() {
        if (auth === null) {
          return;
        }
        try {
          await auth.signOut();
        } catch (error) {
          set({ status: 'error', error: asAppError(error, AUTH_REQUIRED_FALLBACK) });
          return;
        }
        // C4 §4.1 — signing out returns the device to Offline Guest Mode.
        await sync.disconnect();
        set({
          session: null,
          signedIn: false,
          upgrading: false,
          lastMigration: null,
          status: 'ready',
        });
        // B6 §4.2.4 / ADR-004 — lock the vault (zeroize the DEK, purge the volatile note index).
        onSignOut?.();
      },
    };
  });
}
