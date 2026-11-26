// Dev/prod config — where the app reads the published content-pack catalogue (FR-105, B4 §4.6).
//
// The catalogue is a single `manifest.json`. In production it is served from Cloudflare R2 and its
// full URL is injected as `EXPO_PUBLIC_PACK_MANIFEST_URL` (E1 environments matrix + provisioning
// runbook §127/§235). When that is unset (local dev) we fall back to `pnpm serve:packs`, reusing
// Metro's host — a LAN IP on a physical device, or `10.0.2.2` from inside the Android emulator.
import Constants from 'expo-constants';

/** Port the local pack server listens on (`pnpm serve:packs`). */
const PACK_SERVER_PORT = 8787;

/** Local catalogue base URL for the current dev session (Metro host + pack-server port). */
function packServerBaseUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? '10.0.2.2';
  return `http://${host}:${PACK_SERVER_PORT}`;
}

/** Full URL of the published `manifest.json` the app should fetch. */
export function packManifestUrl(): string {
  // `process.env.EXPO_PUBLIC_*` is inlined at build time, so this must be a literal member access.
  const configured = process.env.EXPO_PUBLIC_PACK_MANIFEST_URL;
  return configured !== undefined && configured.length > 0
    ? configured
    : `${packServerBaseUrl()}/manifest.json`;
}

/** True when no remote catalogue is configured, so dev falls back to the local `serve:packs`. */
export function usesLocalPackServer(): boolean {
  const configured = process.env.EXPO_PUBLIC_PACK_MANIFEST_URL;
  return configured === undefined || configured.length === 0;
}

/**
 * Resolve a manifest entry's `downloadUrl` to a host this device can actually reach.
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
  return `${packServerBaseUrl()}/${fileName}`;
}
