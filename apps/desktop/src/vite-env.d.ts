/// <reference types="vite/client" />

/** Client-safe `VITE_*` values injected at build time (E1 §4.2) — never secrets. */
interface ImportMetaEnv {
  /** Content-pack catalogue `manifest.json` URL (Cloudflare R2). */
  readonly VITE_PACK_MANIFEST_URL?: string;
  /** Public Supabase project URL (safe; protected by RLS — C4). */
  readonly VITE_SUPABASE_URL?: string;
  /** Public Supabase anon key (safe; zero privilege without a user JWT + RLS — C4). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** PowerSync Cloud endpoint (sync-rules buckets: `user_private` + `joined_pools` — C2). */
  readonly VITE_POWERSYNC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
