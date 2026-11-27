// The single shared Supabase client for the desktop app (FR-206, C4 §4.1).
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
            // WebView secure storage: supabase-js persists the session in `localStorage` so a
            // signed-in desktop user stays signed in across relaunches.
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        });
  return cached;
}
