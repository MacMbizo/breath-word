// Gate-1 Spike 1 / B4 §4.6 Acceptance — pack-builder ETL output verification.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { DatabaseSync } from '../src/node-sqlite';

import { afterAll, describe, expect, it } from 'vitest';

import {
  SAMPLE_SEARCH_QUERY,
  SAMPLE_VERSE_COUNT,
  buildPackArtifacts,
  createSamplePackSource,
  loadPackSource,
  main,
  writeManifest,
  type PackSource,
} from '../src/build-pack';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-pack-etl-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const ROMANS_8_28 =
  'And we know that all things work together for good to those who love God, to those who are called according to His purpose.';

const SOURCE: PackSource = {
  metadata: {
    packId: 'core_bsb',
    packType: 'TRANSLATION',
    contentVersion: '1.0.0',
    displayName: 'Berean Standard Bible',
    licenseSpdx: 'CC0-1.0',
    attributionText: 'Berean Standard Bible (public domain).',
    builtAt: '2026-11-25T00:00:00Z',
  },
  translation: {
    code: 'BSB',
    name: 'Berean Standard Bible',
    licenseType: 'CC0-1.0',
    version: '1.0.0',
  },
  books: [
    { number: 1, osis: 'Gen', name: 'Genesis', testament: 'OT', chapterCount: 50, literaryGenre: 'LAW' },
    { number: 43, osis: 'John', name: 'John', testament: 'NT', chapterCount: 21, literaryGenre: 'GOSPEL' },
    { number: 45, osis: 'Rom', name: 'Romans', testament: 'NT', chapterCount: 16, literaryGenre: 'EPISTLE' },
  ],
  verses: [
    {
      book: 1,
      chapter: 1,
      verse: 1,
      plainText: 'In the beginning God created the heavens and the earth.',
      spans: [{ type: 'text', text: 'In the beginning God created the heavens and the earth.' }],
    },
    {
      book: 43,
      chapter: 3,
      verse: 16,
      plainText: 'For God so loved the world, that He gave His one and only Son.',
      spans: [{ type: 'text', text: 'For God so loved the world, that He gave His one and only Son.' }],
    },
    { book: 45, chapter: 8, verse: 28, plainText: ROMANS_8_28, spans: [{ type: 'text', text: ROMANS_8_28 }] },
  ],
};

describe('pack-builder ETL (B4 §4.2/§4.6)', () => {
  const outDir = join(tmpRoot, 'out');
  const artifacts = buildPackArtifacts(SOURCE, outDir, {
    baseUrl: 'https://packs.breathandword.app/v1/',
    minAppVersion: '0.1.0',
  });

  it('produces a .sqlite and a .sqlite.gz', () => {
    expect(artifacts.sqlitePath.endsWith('core_bsb-1.0.0.sqlite')).toBe(true);
    expect(artifacts.gzPath.endsWith('core_bsb-1.0.0.sqlite.gz')).toBe(true);
    expect(readFileSync(artifacts.sqlitePath).byteLength).toBe(artifacts.entry.uncompressedBytes);
  });

  it('gzip round-trips back to the exact .sqlite bytes', () => {
    const original = readFileSync(artifacts.sqlitePath);
    const restored = gunzipSync(readFileSync(artifacts.gzPath));
    expect(restored.equals(original)).toBe(true);
  });

  it('records a schema-valid manifest entry with matching hashes', () => {
    expect(artifacts.entry.packId).toBe('core_bsb');
    expect(artifacts.entry.schemaVersion).toBe(1);
    expect(artifacts.entry.downloadUrl).toBe('https://packs.breathandword.app/v1/core_bsb-1.0.0.sqlite.gz');
    expect(artifacts.entry.sha256Compressed).toMatch(/^[0-9a-f]{64}$/);
    expect(artifacts.entry.sha256Uncompressed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds a pack that passes integrity_check and answers FTS5 with Romans 8:28', () => {
    const db = new DatabaseSync(artifacts.sqlitePath);
    try {
      const integrity = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
      expect(integrity.integrity_check).toBe('ok');

      const meta = db.prepare('SELECT schema_version FROM pack_metadata;').get() as { schema_version: number };
      expect(meta.schema_version).toBe(1);

      const match = db
        .prepare('SELECT canonical_verse_id FROM verses_fts WHERE verses_fts MATCH ?;')
        .all('work together for good') as { canonical_verse_id: number }[];
      expect(match.map((row) => row.canonical_verse_id)).toContain(45008028);
    } finally {
      db.close();
    }
  });

  it('writes a manifest.json matching the pack entry', () => {
    const manifestPath = writeManifest(outDir, [artifacts.entry], SOURCE.metadata.builtAt);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      manifestVersion: number;
      generatedAt: string;
      packs: { packId: string }[];
    };
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.generatedAt).toBe('2026-11-25T00:00:00Z');
    expect(manifest.packs[0]?.packId).toBe('core_bsb');
  });

  it('runs end-to-end from a PackSource JSON file via the CLI', () => {
    const sourcePath = join(tmpRoot, 'core_bsb.source.json');
    writeFileSync(sourcePath, JSON.stringify(SOURCE));
    const cliOut = join(tmpRoot, 'cli-out');

    main(['--source', sourcePath, '--out', cliOut]);

    expect(loadPackSource(sourcePath).metadata.packId).toBe('core_bsb');
    expect(readFileSync(join(cliOut, 'manifest.json'), 'utf8')).toContain('core_bsb-1.0.0.sqlite.gz');
    expect(readFileSync(join(cliOut, 'core_bsb-1.0.0.sqlite.gz')).byteLength).toBeGreaterThan(0);
  });
});

// Gate-1 Spike 1/2 prep: the synthetic fixture the device harness times against (NOT scripture).
describe('pack-builder --sample fixture', () => {
  const sample = createSamplePackSource();

  it('covers the full Protestant canon at a deterministic verse count', () => {
    expect(sample.metadata.packId).toBe('core_bsb');
    expect(sample.books).toHaveLength(66);
    expect(sample.verses).toHaveLength(SAMPLE_VERSE_COUNT);
  });

  it('isolates one distinctive marker verse (Romans 8:28)', () => {
    const marker = sample.verses.filter((verse) => verse.plainText.includes(SAMPLE_SEARCH_QUERY));
    expect(marker).toHaveLength(1);
    expect(marker[0]?.book).toBe(45);
    expect(marker[0]?.chapter).toBe(8);
    expect(marker[0]?.verse).toBe(28);
  });

  it(
    'builds an integrity-clean, FTS5-searchable pack through the --sample CLI path',
    { timeout: 30_000 },
    () => {
      const cliOut = join(tmpRoot, 'sample-out');
      main(['--sample', '--out', cliOut]);

      const db = new DatabaseSync(join(cliOut, 'core_bsb-1.0.0.sqlite'));
      try {
        const integrity = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
        expect(integrity.integrity_check).toBe('ok');

        const match = db
          .prepare('SELECT canonical_verse_id FROM verses_fts WHERE verses_fts MATCH ?;')
          .all(SAMPLE_SEARCH_QUERY) as { canonical_verse_id: number }[];
        expect(match.map((row) => row.canonical_verse_id)).toContain(45008028);

        const count = db.prepare('SELECT COUNT(*) AS n FROM verses;').get() as { n: number };
        expect(count.n).toBe(SAMPLE_VERSE_COUNT);
      } finally {
        db.close();
      }
    },
  );
});
