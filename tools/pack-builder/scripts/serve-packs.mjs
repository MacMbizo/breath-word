// Dev-only static file server for the pack-builder `out/` directory.
//
// Serves the built `*.sqlite.gz` packs and `manifest.json` over plain HTTP so a device can
// exercise the real FR-105 install flow (download -> SHA-256 verify -> gunzip -> attach)
// against a locally built pack — the setup Gate-1 Spike 1 / Spike 2 need.
//
// Usage:
//   pnpm --filter @breath-and-word/pack-builder pack:sample       # build the fixture
//   pnpm --filter @breath-and-word/pack-builder serve:packs       # serve out/ on :8787
//
// The Android emulator reaches the host machine at http://10.0.2.2:<port>; a physical device
// uses the machine's LAN IP. Point the mobile Spike diagnostics screen at that base URL.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(fileURLToPath(new URL('../out', import.meta.url)));

const CONTENT_TYPES = {
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.sqlite': 'application/vnd.sqlite3',
};

function parsePort() {
  const index = process.argv.indexOf('--port');
  if (index >= 0) {
    const value = Number(process.argv[index + 1]);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }
  return 8787;
}

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent((url ?? '/').split('?')[0]);
  const relative = normalize(requestPath).replace(/^[/\\]+/, '');
  const filePath = join(OUT_DIR, relative);
  // Reject anything that escapes the output directory (path traversal guard).
  if (filePath !== OUT_DIR && !filePath.startsWith(OUT_DIR + sep)) {
    return null;
  }
  return filePath;
}

// The desktop WebView fetches packs straight from this server (`apps/desktop` download adapter),
// and — unlike the React Native mobile client — browsers enforce CORS. Production serves the same
// artifacts from R2 with an equivalent wildcard policy, so mirror it here to keep the FR-105
// download path working in local dev.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
};

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...CORS_HEADERS,
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': '*',
    });
    res.end();
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { ...CORS_HEADERS, 'content-type': 'text/plain' });
    res.end(`not found: ${req.url ?? '/'}\n`);
    return;
  }

  res.writeHead(200, {
    ...CORS_HEADERS,
    'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'content-length': statSync(filePath).size,
  });
  createReadStream(filePath).pipe(res);
});

const port = parsePort();
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(
    `pack-builder pack server on http://0.0.0.0:${port}/ (serving ${OUT_DIR})\n` +
      `  Android emulator base URL: http://10.0.2.2:${port}/\n`,
  );
});
