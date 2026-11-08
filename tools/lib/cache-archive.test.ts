import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveProblems,
  cacheManifestSchema,
  cacheTag,
  latestTag,
  listCacheFiles,
  memberProblems,
  missingFrom,
  parseCacheManifest,
  resolveChain,
  riksdagTextCoverage,
  scoreCacheCoverageFrom,
  sha256File,
  type CacheManifest,
} from './cache-archive.ts';

const hash = 'a'.repeat(64);
const textCoverage = {
  kind: 'riksdag-text',
  term: '2022-2026',
  doktyper: ['bet', 'prop'],
  documentsFrom: '2022-09-01',
  documentsTo: '2026-10-20',
  documentCount: 2,
};
const manifest = (over: Record<string, unknown> = {}) => ({
  version: 1,
  name: 'riksdag-text',
  tag: 'cache-riksdag-text-2026-11-08',
  createdAt: '2026-11-08',
  archive: {
    file: 'riksdag-text-2026-11-08.tar.zst',
    sha256: hash,
    bytes: 10,
    compression: 'zstd',
  },
  base: null,
  files: ['A1.xml', 'B2.xml'],
  uncompressedBytes: 100,
  coverage: textCoverage,
  ...over,
});

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(resolve(tmpdir(), 'cache-archive-test-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('manifest schema', () => {
  it('accepts a full snapshot and a score-cache snapshot', () => {
    expect(parseCacheManifest(manifest()).coverage.kind).toBe('riksdag-text');
    const score = manifest({
      name: 'score-cache',
      tag: 'cache-score-cache-2026-11-08',
      coverage: { kind: 'score-cache', runs: [], entryCount: 0 },
    });
    expect(parseCacheManifest(score).name).toBe('score-cache');
  });
  it('rejects a coverage that does not match the name, a foreign tag and path-like file names', () => {
    expect(() =>
      parseCacheManifest(manifest({ coverage: { kind: 'score-cache', runs: [], entryCount: 0 } })),
    ).toThrow(/coverage.kind/);
    expect(() => parseCacheManifest(manifest({ tag: 'cache-score-cache-2026-11-08' }))).toThrow(
      /tag/,
    );
    for (const bad of ['../x.xml', '/etc/passwd', 'a/b.xml', '.hidden']) {
      expect(cacheManifestSchema.safeParse(manifest({ files: [bad] })).success).toBe(false);
    }
  });
  it('rejects unknown keys and bad dates', () => {
    expect(cacheManifestSchema.safeParse({ ...manifest(), extra: 1 }).success).toBe(false);
    expect(cacheManifestSchema.safeParse(manifest({ createdAt: '8 nov' })).success).toBe(false);
  });
});

describe('tags', () => {
  it('builds tags with a same-day counter and picks the newest of one cache', () => {
    expect(cacheTag('score-cache', '2026-11-08')).toBe('cache-score-cache-2026-11-08');
    expect(cacheTag('score-cache', '2026-11-08', 2)).toBe('cache-score-cache-2026-11-08-2');
    const tags = [
      'cache-riksdag-text-2026-10-01',
      'cache-riksdag-text-2026-11-08',
      'cache-riksdag-text-2026-11-08-2',
      'cache-score-cache-2026-12-01',
      'v1.0.0',
    ];
    expect(latestTag(tags, 'riksdag-text')).toBe('cache-riksdag-text-2026-11-08-2');
    expect(latestTag(tags, 'score-cache')).toBe('cache-score-cache-2026-12-01');
    expect(latestTag(['v1'], 'score-cache')).toBeUndefined();
  });
});

describe('files and coverage', () => {
  it('lists only flat cache entries with the extension, sorted, ignoring temp files', () => {
    const d = tmp();
    for (const f of ['b.xml', 'a.xml', 'c.json', 'd.xml.tmp']) writeFileSync(resolve(d, f), 'x');
    expect(listCacheFiles(d, '.xml')).toEqual(['a.xml', 'b.xml']);
  });
  it('computes what a delta must hold', () => {
    expect(missingFrom(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['b']);
  });
  it('takes the riksdag-text watermark from the store dates of the cached documents', () => {
    const store = {
      A1: { doktyp: 'prop', datum: '2023-01-10' },
      B2: { doktyp: 'bet', datum: '2026-10-20 00:00:00' },
      NOTCACHED: { doktyp: 'dir', datum: '2030-01-01' },
    };
    const c = riksdagTextCoverage(['A1.xml', 'B2.xml', 'ORPHAN.xml'], store, '2022-2026');
    expect(c).toMatchObject({
      doktyper: ['bet', 'prop'],
      documentsFrom: '2023-01-10',
      documentsTo: '2026-10-20',
      documentCount: 3,
    });
    expect(() => riksdagTextCoverage(['X.xml'], store, '2022-2026')).toThrow(/ingest-riksdag/);
  });
  it('summarises scoring runs and skips unreadable run manifests', () => {
    const run = {
      config: {
        name: 'tido-eval-v1',
        scorer: { kind: 'jev', model: 'jev-latest' },
        question: { template_version: 'v1' },
      },
      plan_hash: hash,
      status: 'complete',
      request_count: 535,
    };
    const c = scoreCacheCoverageFrom([run, { nonsense: true }], 1070);
    expect(c.entryCount).toBe(1070);
    expect(c.runs).toEqual([
      {
        name: 'tido-eval-v1',
        scorerKind: 'jev',
        model: 'jev-latest',
        templateVersion: 'v1',
        planHash: hash,
        requestCount: 535,
        status: 'complete',
      },
    ]);
  });
});

describe('verification', () => {
  it('detects a changed archive by size and hash', () => {
    const d = tmp();
    const p = resolve(d, 'a.tar.zst');
    writeFileSync(p, 'hello');
    const m = parseCacheManifest(
      manifest({
        archive: { file: 'a.tar.zst', sha256: sha256File(p), bytes: 5, compression: 'zstd' },
      }),
    );
    expect(archiveProblems(m, p)).toEqual([]);
    writeFileSync(p, 'HELLO');
    expect(archiveProblems(m, p)).toEqual(['sha256 does not match the manifest']);
    writeFileSync(p, 'hello!');
    expect(archiveProblems(m, p)).toHaveLength(2);
  });
  it('requires the archive members to be exactly the manifest files', () => {
    const m = parseCacheManifest(manifest());
    expect(memberProblems(m, ['./A1.xml', 'B2.xml'])).toEqual([]);
    expect(memberProblems(m, ['A1.xml', '../evil'])).toEqual([
      'unexpected member ../evil',
      'missing member B2.xml',
    ]);
  });
});

describe('resolveChain', () => {
  const m = (tag: string, base: string | null, name = 'riksdag-text'): CacheManifest =>
    parseCacheManifest(
      manifest({
        tag: `cache-${name}-${tag}`,
        base,
        name,
        coverage:
          name === 'riksdag-text' ? textCoverage : { kind: 'score-cache', runs: [], entryCount: 0 },
      }),
    );
  it('returns oldest first and follows base links', async () => {
    const all = {
      'cache-riksdag-text-2026-01-01': m('2026-01-01', null),
      'cache-riksdag-text-2026-02-01': m('2026-02-01', 'cache-riksdag-text-2026-01-01'),
    };
    const chain = await resolveChain(
      m('2026-03-01', 'cache-riksdag-text-2026-02-01'),
      async (t) => all[t as keyof typeof all],
    );
    expect(chain.map((x) => x.tag)).toEqual([
      'cache-riksdag-text-2026-01-01',
      'cache-riksdag-text-2026-02-01',
      'cache-riksdag-text-2026-03-01',
    ]);
  });
  it('rejects loops and a base of another cache', async () => {
    const a = m('2026-01-01', 'cache-riksdag-text-2026-02-01');
    const b = m('2026-02-01', 'cache-riksdag-text-2026-01-01');
    await expect(resolveChain(a, async () => b)).rejects.toThrow(/loops/);
    const other = m('2026-01-01', null, 'score-cache');
    await expect(
      resolveChain(m('2026-02-01', 'cache-score-cache-2026-01-01'), async () => other),
    ).rejects.toThrow(/not riksdag-text/);
  });
});
