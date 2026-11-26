/// <reference types="vite/client" />

/** Client-safe `VITE_*` values injected at build time (E1 §4.2) — never secrets. */
interface ImportMetaEnv {
  /** Content-pack catalogue `manifest.json` URL (Cloudflare R2). */
  readonly VITE_PACK_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
