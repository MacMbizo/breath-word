// Dev/prod config — the Supabase + PowerSync endpoints that back FR-206 sync (E1 §4.2).
//
// `packages/core` stays transport-free, so the app owns the two client-safe values the PowerSync
// connector needs: the public Supabase project URL + anon key (zero privilege without a user JWT +
// RLS — C4) and the PowerSync service endpoint whose sync-rules declare the `user_private` /
// `joined_pools` buckets (C2 §4.1). Both are `VITE_`-prefixed and therefore bundled.
//
// Until §6 provisioning is complete the trio is absent, `readSyncServiceConfig()` returns `null`
// and the app boots fully local: no Supabase client, no PowerSync connection, no regression.

/** Client-safe endpoints required to sync (E1 §4.2). */
export interface SyncServiceConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly powersyncUrl: string;
}

/**
 * Read the sync endpoints from the bundle, or `null` when any is missing (unprovisioned build).
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so each access must be a literal member
 * expression.
 */
export function readSyncServiceConfig(): SyncServiceConfig | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const powersyncUrl = import.meta.env.VITE_POWERSYNC_URL;

  if (
    supabaseUrl === undefined ||
    supabaseUrl.length === 0 ||
    supabaseAnonKey === undefined ||
    supabaseAnonKey.length === 0 ||
    powersyncUrl === undefined ||
    powersyncUrl.length === 0
  ) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey, powersyncUrl };
}
