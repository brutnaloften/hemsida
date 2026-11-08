import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveProblems,
  cacheManifestSchema,
  cacheTag,
  latestTag,
  linkCacheCoverageFrom,
  listCacheFiles,
  memberProblems,
  missingFrom,
  parseCacheManifest,
  parseTarListing,
  resolveChain,
  riksdagTextCoverage,
  scoreCacheCoverageFrom,
  sha256File,
  type CacheManifest,
  ZSTD_READ,
} from './cache-archive.ts';

const hasTar = spawnSync('tar', ['--version']).status === 0;
const hasZstd = spawnSync('zstd', ['--version']).status === 0;
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
    const link = manifest({
      name: 'link-cache',
      tag: 'cache-link-cache-2026-11-08',
      coverage: { kind: 'link-cache', runs: [], entryCount: 0 },
    });
    expect(parseCacheManifest(link).name).toBe('link-cache');
    expect(
      latestTag(['cache-link-cache-2026-11-08', 'cache-score-cache-2026-11-09'], 'link-cache'),
    ).toBe('cache-link-cache-2026-11-08');
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
  it('accepts Swedish letters in file names (Riksdag ids such as HA01FöU1)', () => {
    expect(
      parseCacheManifest(manifest({ files: ['HA01FöU1.xml', 'H901FiU51.xml'] })).files,
    ).toHaveLength(2);
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
  it('summarises linking runs and skips unreadable run manifests', () => {
    const run = {
      config: {
        name: 'link-eval-haiku-v1',
        judge: { kind: 'claude', model: 'claude-haiku-5-5' },
        template_version: 'v1',
      },
      plan_hash: hash,
      status: 'complete',
      request_count: 51,
    };
    const c = linkCacheCoverageFrom([run, { nonsense: true }], 51);
    expect(c.entryCount).toBe(51);
    expect(c.runs).toEqual([
      {
        name: 'link-eval-haiku-v1',
        judgeKind: 'claude',
        model: 'claude-haiku-5-5',
        templateVersion: 'v1',
        planHash: hash,
        requestCount: 51,
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
  it('requires the archive members to be exactly the manifest files, each once, all regular files', () => {
    const m = parseCacheManifest(manifest());
    const f = (name: string, type = '-') => ({ name, type });
    expect(memberProblems(m, [f('A1.xml'), f('B2.xml')])).toEqual([]);
    expect(memberProblems(m, [f('A1.xml'), f('../evil')])).toEqual([
      'unexpected member ../evil',
      'missing member B2.xml',
    ]);
    expect(memberProblems(m, [f('A1.xml', 'l'), f('B2.xml'), f('B2.xml')])).toEqual([
      'A1.xml is not a regular file (type l)',
      'duplicate member B2.xml',
    ]);
  });
  it.skipIf(!hasTar)(
    'rejects a symlink and a hard link that tar would unpack under a plain name',
    () => {
      const d = tmp();
      mkdirSync(resolve(d, 'src'));
      writeFileSync(resolve(d, 'src', 'A1.xml'), 'ok');
      symlinkSync('/etc/hostname', resolve(d, 'src', 'B2.xml'));
      execFileSync('tar', [
        '-cf',
        resolve(d, 'x.tar'),
        '-C',
        resolve(d, 'src'),
        'A1.xml',
        'B2.xml',
      ]);
      const { entries, unparsed } = parseTarListing(
        execFileSync('tar', ['-tvf', resolve(d, 'x.tar')], { encoding: 'utf8' }),
      );
      expect(unparsed).toEqual([]);
      expect(entries.map((e) => [e.name, e.type])).toEqual([
        ['A1.xml', '-'],
        ['B2.xml', 'l'],
      ]);
      expect(memberProblems(parseCacheManifest(manifest()), entries)).toEqual([
        'B2.xml is not a regular file (type l)',
      ]);
    },
  );
  it('parses GNU tar and bsdtar listings in any locale, decoding escaped names', () => {
    const listing = [
      // GNU tar
      '-rw-r--r-- user/wheel       3 2026-11-08 19:11 A1.xml',
      'lrwxr-xr-x user/wheel       0 2026-11-08 19:11 B2.xml -> /etc/hosts',
      'hrw-r--r-- user/wheel       0 2026-11-08 19:11 C3.xml link to A1.xml',
      '-rw-r--r-- user/wheel       2 2026-11-08 19:11 HA01F\\303\\266U1.xml',
      // bsdtar (macOS), C and Swedish locale, recent and old files
      '-rw-r--r--  0 user  wheel       3 Nov  8 20:11 A1.xml',
      'lrwxr-xr-x  0 user  wheel       0 nov.  8 20:11 B2.xml -> /etc/hosts',
      'hrw-r--r--  0 user  wheel       0 Nov  8 20:11 C3.xml link to A1.xml',
      '-rw-r--r--  0 user  wheel       2 Nov  8 20:11 HA01F\\303\\266U1.xml',
      '-rw-r--r--  0 user  wheel       2 jan.  1  2019 HA01FöU2.xml',
      '-rw-r--r--  0 user  wheel       2 Jan  1  2019 a\\\\303.xml',
    ].join('\n');
    const { entries, unparsed } = parseTarListing(listing);
    expect(unparsed).toEqual([]);
    expect(entries.map((e) => [e.name, e.type])).toEqual([
      ['A1.xml', '-'],
      ['B2.xml', 'l'],
      ['C3.xml', 'h'],
      ['HA01FöU1.xml', '-'],
      ['A1.xml', '-'],
      ['B2.xml', 'l'],
      ['C3.xml', 'h'],
      ['HA01FöU1.xml', '-'],
      ['HA01FöU2.xml', '-'],
      // An escaped backslash stays a backslash and is not read as an octal escape.
      ['a\\303.xml', '-'],
    ]);
  });
  it.skipIf(!hasTar || !hasZstd)(
    'lists and unpacks a .tar.zst with the platform tar, also without a UTF-8 locale',
    () => {
      const d = tmp();
      const files = ['A1.xml', 'HA01FöU1.xml'];
      mkdirSync(resolve(d, 'src'));
      for (const f of files) writeFileSync(resolve(d, 'src', f), f);
      const archive = resolve(d, 'x.tar.zst');
      execFileSync('tar', [
        '--use-compress-program',
        'zstd -3',
        '-cf',
        archive,
        '-C',
        resolve(d, 'src'),
        ...files,
      ]);
      const env = { ...process.env, LC_ALL: 'C', LANG: 'C' };
      const { entries, unparsed } = parseTarListing(
        execFileSync('tar', ['--use-compress-program', ZSTD_READ, '-tvf', archive], {
          encoding: 'utf8',
          env,
        }),
      );
      expect(unparsed).toEqual([]);
      // bsdtar on macOS stores `ö` decomposed (NFD) although the file name on disk is NFC, so compare normalised;
      // an undecoded `\303\266` escape would still fail here.
      expect(entries.map((e) => [e.name.normalize('NFC'), e.type])).toEqual(
        files.map((f) => [f, '-']),
      );
      mkdirSync(resolve(d, 'out'));
      execFileSync(
        'tar',
        ['--use-compress-program', ZSTD_READ, '-xf', archive, '-C', resolve(d, 'out')],
        { env },
      );
      expect(readFileSync(resolve(d, 'out', 'HA01FöU1.xml'), 'utf8')).toBe('HA01FöU1.xml');
    },
  );
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
  it('rejects a manifest that is not the tag asked for', async () => {
    const tip = m('2026-02-01', 'cache-riksdag-text-2026-01-01');
    await expect(resolveChain(tip, async () => m('2026-05-05', null))).rejects.toThrow(/asked for/);
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
