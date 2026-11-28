#!/usr/bin/env node
// Download the full text of every English Bible version in data/english-bible-versions.json whose
// licence allows redistribution (public domain or open). Copyrighted / non-commercial versions are
// catalogued only and never fetched (B5). Research staging for future packs — not a pack build.
//
//   node scripts/fetch-english-bibles.mjs            # fetch anything not yet stored
//   node scripts/fetch-english-bibles.mjs --force    # re-download everything
//   node scripts/fetch-english-bibles.mjs BSB KJV    # only these catalog keys
//
// Output (git-ignored): sources/english/<key>.<format>.json.gz | <key>.sword.zip, plus manifest.json
// with each file's source, licence, byte size and SHA-256.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'data', 'english-bible-versions.json'), 'utf8'));
const outDir = join(root, 'sources', 'english');
const manifestPath = join(outDir, 'manifest.json');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = new Set(args.filter((a) => !a.startsWith('--')));
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

const REDISTRIBUTABLE = new Set(['public-domain', 'open']);

function fileNameFor(version) {
  return version.storeFrom.format === 'sword-module-zip'
    ? `${version.key}.sword.zip`
    : `${version.key}.${version.storeFrom.format}.json.gz`;
}

async function download(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

/** Light validation so an HTML error page or truncated body is never stored as scripture. */
function validate(version, body) {
  if (version.storeFrom.format === 'sword-module-zip') {
    if (body.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('not a zip archive');
    return { kind: 'zip' };
  }
  const json = JSON.parse(body.toString('utf8'));
  if (version.storeFrom.format === 'helloao-complete-json') {
    const books = json.books?.length ?? 0;
    if (books === 0) throw new Error('no books in response');
    return { books };
  }
  const books = (json.books ?? []).filter((b) => b.chapters?.some((c) => c.verses?.some((v) => v.text?.trim())));
  if (books.length === 0) throw new Error('no non-empty books in response');
  return { books: books.length };
}

let fetched = 0;
let skipped = 0;
const failed = [];
for (const version of catalog.versions) {
  if (version.storeFrom === null || !REDISTRIBUTABLE.has(version.redistribution)) continue;
  if (only.size > 0 && !only.has(version.key)) continue;
  const file = fileNameFor(version);
  if (!force && existsSync(join(outDir, file)) && manifest[version.key]?.file === file) {
    skipped += 1;
    continue;
  }
  try {
    const body = await download(version.storeFrom.url);
    const check = validate(version, body);
    const stored = version.storeFrom.format === 'sword-module-zip' ? body : gzipSync(body, { level: 9 });
    writeFileSync(join(outDir, file), stored);
    const source = version.sources.find((s) => s.source === version.storeFrom.source && s.id === version.storeFrom.id);
    manifest[version.key] = {
      file,
      name: version.name,
      scope: version.scope,
      source: version.storeFrom.source,
      sourceId: version.storeFrom.id,
      url: version.storeFrom.url,
      format: version.storeFrom.format,
      licence: source?.licence ?? '',
      redistribution: version.redistribution,
      ...check,
      bytes: stored.length,
      sha256: createHash('sha256').update(stored).digest('hex'),
      fetchedAt: new Date().toISOString(),
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fetched += 1;
    console.log(`ok   ${version.key.padEnd(16)} ${(stored.length / 1024).toFixed(0).padStart(6)} KB  ${version.storeFrom.source}`);
  } catch (error) {
    failed.push(version.key);
    console.log(`FAIL ${version.key.padEnd(16)} ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\nfetched ${fetched}, already stored ${skipped}, failed ${failed.length}${failed.length ? `: ${failed.join(', ')}` : ''}`);
process.exitCode = failed.length > 0 ? 1 : 0;
