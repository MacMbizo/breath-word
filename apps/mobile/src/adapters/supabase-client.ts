// The single shared Supabase client for the mobile app (FR-206, C4 §4.1).
//
// Both the auth seam (`auth.ts`) and the PowerSync upload connector (`supabase-connector.ts`) must
// observe the *same* session, so the app builds one client here and both consume it. Env-guarded
// (`Plan §6`): when the endpoints are absent the getter returns `null` and both seams fall back to
// permanent Offline Guest Mode.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { readSyncServiceConfig } from '../config/sync-service';

let cached: SupabaseClient | null | undefined;

/** Build (once) the shared Supabase client, or `null` when unprovisioned (Plan §6). */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const config = readSyncServiceConfig();
  cached =
    config === null
      ? null
      : createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            // React Native has no `localStorage`; supabase-js falls back to an in-memory store, so
            // the session lasts for the app run until the sign-in flow (P2-14) persists it natively.
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        });
  return cached;
}
