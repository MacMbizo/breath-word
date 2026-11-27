// AuthAdapter — the Supabase auth transport seam for the desktop app (FR-206, C4 §4.1).
//
// `packages/core` stays transport-free (B3 §4.3); this adapter is the only place the app touches
// `@supabase/supabase-js`'s auth API. It wraps the shared Supabase client so the session the user
// signs into is the very session the PowerSync connector uploads under.
//
// Env-guarded (`Plan §6`): when unprovisioned `createAuthAdapter()` returns `null`, the core leaves
// the account store inert (`configured: false`) and the device stays in Offline Guest Mode.

import type { AuthAdapter, AuthSession } from '@breath-and-word/core';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from './supabase-client';

/** Map a Supabase session onto the transport-free `AuthSession` the core consumes. */
function toAuthSession(session: Session | null): AuthSession | null {
  if (session === null) {
    return null;
  }
  return { userId: session.user.id, email: session.user.email ?? null };
}

/** Build the desktop `AuthAdapter`, or `null` when the Supabase endpoints are absent (Plan §6). */
export function createAuthAdapter(): AuthAdapter | null {
  const supabase = getSupabaseClient();
  if (supabase === null) {
    return null;
  }

  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toAuthSession(data.session);
    },

    onAuthStateChange(handler) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        handler(toAuthSession(session));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },

    async signInWithPassword(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error !== null || data.session === null) {
        throw error ?? new Error('Supabase returned no session for a successful sign-in.');
      }
      return { userId: data.session.user.id, email: data.session.user.email ?? null };
    },

    async signUpWithPassword(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error !== null) {
        throw error;
      }
      // Email confirmation (when enabled) yields a user but no session; the `onAuthStateChange`
      // SIGNED_IN that follows confirmation drives the guest→account upgrade instead.
      if (data.session === null) {
        throw new Error('Check your inbox to confirm your email before signing in.');
      }
      return { userId: data.session.user.id, email: data.session.user.email ?? null };
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error !== null) {
        throw error;
      }
    },
  };
}
