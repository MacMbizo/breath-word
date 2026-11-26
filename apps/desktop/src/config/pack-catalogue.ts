// Where the desktop app reads the published content-pack catalogue (FR-105, B4 §4.6).
//
// The catalogue is a single `manifest.json`. In production it is served from Cloudflare R2 and its
// full URL is injected as `VITE_PACK_MANIFEST_URL` (E1 environments matrix). When that is unset
// (local dev) we fall back to `pnpm serve:packs`, which listens on localhost.

/** Port the local pack server listens on (`pnpm serve:packs`). */
const PACK_SERVER_PORT = 8787;

/** Full URL of the published `manifest.json` the app should fetch. */
export function packManifestUrl(): string {
  // Vite inlines `import.meta.env.VITE_*` at build time, so this must be a literal member access.
  const configured = import.meta.env.VITE_PACK_MANIFEST_URL;
  return configured !== undefined && configured.length > 0
    ? configured
    : `http://localhost:${PACK_SERVER_PORT}/manifest.json`;
}

/** True when no remote catalogue is configured, so dev falls back to the local `serve:packs`. */
export function usesLocalPackServer(): boolean {
  const configured = import.meta.env.VITE_PACK_MANIFEST_URL;
  return configured === undefined || configured.length === 0;
}

/**
 * Resolve a manifest entry's `downloadUrl` to the host this build can actually reach.
 *
 * The published `manifest.json` records the production CDN prefix, but in local dev the very same
 * artifacts are served by `pnpm serve:packs`, so only the file name is meaningful — re-point it at
 * the dev pack server. With a configured remote catalogue the entry is returned untouched.
 */
export function packDownloadUrl(entry: { downloadUrl: string }): string {
  if (!usesLocalPackServer()) {
    return entry.downloadUrl;
  }
  const fileName = entry.downloadUrl.split('/').pop() ?? entry.downloadUrl;
  return `http://localhost:${PACK_SERVER_PORT}/${fileName}`;
}
