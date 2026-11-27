// Plan unit P3-09 — EXEGESIS pack ETL (B4 §4.1/§4.2, B5 §4.3, AGENTS.md rule 4).

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterAll, describe, expect, it } from 'vitest';

import { buildPackDatabase, createSamplePackSource, main } from '../src/build-pack';
import {
  EXEGESIS_PACK_ID,
  buildExegesisPackArtifacts,
  buildExegesisPackDatabase,
  createSampleExegesisPackSource,
  type ExegesisPackSource,
} from '../src/exegesis-pack';
import { DatabaseSync } from '../src/node-sqlite';

const tmpRoot = mkdtempSync(join(tmpdir(), 'bw-exegesis-etl-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const OPTIONS = { baseUrl: 'https://packs.example.test/v1/', minAppVersion: '0.1.0' };

let counter = 0;
function freshPath(): string {
  counter += 1;
  return join(tmpRoot, `exegesis-${counter}.sqlite`);
}

/** A sample source with one field overridden — keeps each negative case to a single change. */
function sampleWith(mutate: (source: ExegesisPackSource) => void): ExegesisPackSource {
  const source = createSampleExegesisPackSource();
  mutate(source);
  return source;
}

function expectBuildFailure(source: ExegesisPackSource, code: string, detail: RegExp): void {
  const path = freshPath();
  let thrown: unknown;
  try {
    buildExegesisPackDatabase(source, path);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code });
  expect((thrown as { internalDetail?: string }).internalDetail).toMatch(detail);
  // A failed build must never leave a publishable file behind.
  expect(existsSync(path)).toBe(false);
}

describe('exegesis pack builder (P3-09)', () => {
  it('builds an integrity-clean exegesis_step pack with canonical Strong’s ids', () => {
    const path = freshPath();
    const stats = buildExegesisPackDatabase(createSampleExegesisPackSource(), path);
    expect(stats).toMatchObject({ tokenCount: 19, lexiconEntryCount: 2, versificationMapCount: 2 });
    // Tokens whose Strong's id has no lexicon entry are reported, not dropped.
    expect(stats.unresolvedStrongsIds).toContain('G3588');
    expect(stats.unresolvedStrongsIds).not.toContain('G26');

    const db = new DatabaseSync(path, { readOnly: true });
    try {
      expect((db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string }).integrity_check).toBe('ok');

      const meta = db.prepare('SELECT * FROM pack_metadata').all() as Record<string, unknown>[];
      expect(meta).toHaveLength(1);
      expect(meta[0]).toMatchObject({ pack_id: EXEGESIS_PACK_ID, pack_type: 'EXEGESIS', license_spdx: 'CC-BY-4.0' });

      // Zero-padded source ids (`G0026`, `H0430`) are stored unpadded.
      const ids = db.prepare('SELECT DISTINCT strongs_id FROM interlinear_tokens ORDER BY strongs_id').all() as {
        strongs_id: string;
      }[];
      for (const { strongs_id } of ids) expect(strongs_id).toMatch(/^[GH][1-9]\d*$/);
      expect(ids.map((row) => row.strongs_id)).toEqual(expect.arrayContaining(['G26', 'G25', 'H430', 'H853']));

      const agape = db.prepare("SELECT * FROM lexicon_entries WHERE strongs_id = 'G26'").get() as Record<string, unknown>;
      expect(agape).toMatchObject({ lemma: 'ἀγάπη', language: 'greek', ot_occurrences: 0, nt_occurrences: 1, total_occurrences: 1 });
      expect(JSON.parse(agape.full_entry_json as string)).toEqual([
        { heading: 'Definition', body: 'Love: self-giving goodwill and esteem.', source: 'Sample fixture' },
      ]);

      const elohim = db.prepare("SELECT ot_occurrences, nt_occurrences FROM lexicon_entries WHERE strongs_id = 'H430'").get();
      expect(elohim).toEqual({ ot_occurrences: 1, nt_occurrences: 0 });

      const malachi = db
        .prepare("SELECT canonical_verse_id, mapping_type FROM versification_maps WHERE source_verse_id = 39003019")
        .get();
      expect(malachi).toEqual({ canonical_verse_id: 39004001, mapping_type: 'OFFSET' });
    } finally {
      db.close();
    }
  });

  it('packages the pack into a manifest entry whose hashes match the files', () => {
    const outDir = join(tmpRoot, 'artifacts');
    const artifacts = buildExegesisPackArtifacts(createSampleExegesisPackSource(), outDir, OPTIONS);
    const gz = readFileSync(artifacts.gzPath);
    expect(artifacts.entry).toMatchObject({
      packId: EXEGESIS_PACK_ID,
      packType: 'EXEGESIS',
      licenseSpdx: 'CC-BY-4.0',
      downloadUrl: `https://packs.example.test/v1/${EXEGESIS_PACK_ID}-0.0.1-sample.sqlite.gz`,
      compressedBytes: gz.byteLength,
    });
    expect(createHash('sha256').update(gz).digest('hex')).toBe(artifacts.entry.sha256Compressed);
    expect(createHash('sha256').update(gunzipSync(gz)).digest('hex')).toBe(artifacts.entry.sha256Uncompressed);
  });

  describe('B5 §4.3 licence and attribution checks', () => {
    it.each([
      ['empty licenseSpdx', (s: ExegesisPackSource) => (s.metadata.licenseSpdx = ''), /licenseSpdx/],
      ['blank attributionText', (s: ExegesisPackSource) => (s.metadata.attributionText = '   '), /attributionText/],
      [
        'CC BY credit without a licence link',
        (s: ExegesisPackSource) => (s.metadata.attributionText = 'STEPBible.org / Tyndale House, Cambridge'),
        /link the licence/,
      ],
      ['a non-EXEGESIS pack type', (s: ExegesisPackSource) => (s.metadata.packType = 'TRANSLATION'), /expected "EXEGESIS"/],
    ])('rejects %s', (_label, mutate, detail) => {
      expectBuildFailure(sampleWith(mutate), 'PACK_PARSE_FAILED', detail);
    });

    it('applies the same check to translation packs', () => {
      const source = createSamplePackSource();
      source.metadata.attributionText = '';
      const path = freshPath();
      expect(() => buildPackDatabase(source, path)).toThrow(expect.objectContaining({ code: 'PACK_PARSE_FAILED' }));
      expect(existsSync(path)).toBe(false);
    });
  });

  describe('Strong’s id normalization (AGENTS.md rule 4)', () => {
    it.each(['X12', 'G0', 'G26a', 'Strong 26'])('rejects malformed token id %s', (raw) => {
      expectBuildFailure(
        sampleWith((s) => (s.tokens[0]!.strongsId = raw)),
        'PACK_PARSE_FAILED',
        /tokens\[0\]\.strongsId.*not a valid Strong's id/,
      );
    });

    it('treats a blank token id as "no Strong’s number" rather than an error', () => {
      const stats = buildExegesisPackDatabase(
        sampleWith((s) => (s.tokens[3]!.strongsId = '  ')),
        freshPath(),
      );
      expect(stats.tokenCount).toBe(19);
    });

    it('rejects lexicon ids that collapse to the same canonical id', () => {
      expectBuildFailure(
        sampleWith((s) => s.lexicon.push({ ...s.lexicon[0]!, strongsId: 'g26' })),
        'PACK_PARSE_FAILED',
        /both normalize to G26/,
      );
    });

    it('rejects a lexicon language that contradicts the Strong’s prefix', () => {
      expectBuildFailure(
        sampleWith((s) => (s.lexicon[0]!.language = 'hebrew')),
        'PACK_PARSE_FAILED',
        /G26 cannot be hebrew/,
      );
    });

    it('rejects duplicate word positions and non-canonical verse ids', () => {
      expectBuildFailure(
        sampleWith((s) => (s.tokens[1]!.wordPosition = 1)),
        'PACK_PARSE_FAILED',
        /duplicates word 1/,
      );
      expectBuildFailure(
        sampleWith((s) => (s.tokens[0]!.canonicalVerseId = 1_001_000)),
        'PACK_PARSE_FAILED',
        /not a Protestant BBCCCVVV id/,
      );
    });
  });

  describe('CLI', () => {
    it('builds the sample fixture with --sample-exegesis and records it in the manifest', () => {
      const outDir = join(tmpRoot, 'cli-sample');
      main(['--sample-exegesis', '--out', outDir]);
      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as {
        packs: { packId: string; packType: string }[];
      };
      expect(manifest.packs).toEqual([expect.objectContaining({ packId: EXEGESIS_PACK_ID, packType: 'EXEGESIS' })]);
    });

    it('routes a --source JSON with packType EXEGESIS to the exegesis builder', () => {
      const outDir = join(tmpRoot, 'cli-source');
      const sourcePath = join(tmpRoot, 'exegesis-source.json');
      writeFileSync(sourcePath, JSON.stringify(createSampleExegesisPackSource()));
      main(['--source', sourcePath, '--out', outDir]);
      const db = new DatabaseSync(join(outDir, `${EXEGESIS_PACK_ID}-0.0.1-sample.sqlite`), { readOnly: true });
      try {
        expect(db.prepare('SELECT COUNT(*) AS n FROM interlinear_tokens').get()).toEqual({ n: 19 });
      } finally {
        db.close();
      }
    });
  });
});
