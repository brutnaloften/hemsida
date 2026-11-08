/**
 * Share the gitignored local caches as GitHub Release archives (hemsida-8l0). See docs/cache-sharing.md.
 *   node --experimental-strip-types tools/cache-archive.ts pack    <riksdag-text|score-cache|link-cache> [--delta] [--publish] [--level 19] [--term 2022-2026]
 *   node --experimental-strip-types tools/cache-archive.ts publish <tools/out/cache-archives/<tag>>
 *   node --experimental-strip-types tools/cache-archive.ts fetch   <riksdag-text|score-cache|link-cache> [--tag <tag>] [--dest <dir>]
 *   node --experimental-strip-types tools/cache-archive.ts list    [<riksdag-text|score-cache|link-cache>]
 * Add `--repo owner/name` to any command to target another repository (default: the checkout's remote).
 *
 * pack writes tools/out/cache-archives/<tag>/{<name>-<date>.tar.zst,cache-manifest.json}; with --delta only
 * files missing from the latest published snapshot are archived and the manifest points at it as `base`.
 * fetch downloads the newest snapshot (and its base chain) and unpacks it without overwriting existing files,
 * after checking sha256 and that the archive holds exactly the files the manifest lists. Needs `gh`, `tar`, `zstd`.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  archiveProblems,
  CACHE_NAMES,
  CACHES,
  cacheTag,
  type CacheManifest,
  type CacheName,
  latestTag,
  listCacheFiles,
  MANIFEST_ASSET,
  memberProblems,
  parseTarListing,
  missingFrom,
  parseCacheManifest,
  resolveChain,
  riksdagTextCoverage,
  linkCacheCoverageFrom,
  scoreCacheCoverageFrom,
  sha256File,
  ZSTD_READ,
} from './lib/cache-archive.ts';
import { writeJsonAtomic } from './lib/json.ts';
import { loadStore } from './lib/riksdag-ingest.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    delta: { type: 'boolean', default: false },
    publish: { type: 'boolean', default: false },
    level: { type: 'string', default: '19' },
    term: { type: 'string', default: '2022-2026' },
    tag: { type: 'string' },
    dest: { type: 'string' },
    repo: { type: 'string' },
    'out-dir': { type: 'string', default: resolve(root, 'tools/out/cache-archives') },
  },
});
const [command, arg] = positionals;
if (!/^\d{1,2}$/.test(values.level!) || Number(values.level) < 1 || Number(values.level) > 19)
  throw new Error('--level must be an integer from 1 to 19');

const run = (cmd: string, args: string[], opts: { input?: string } = {}): string =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'inherit'],
    ...opts,
  });
const repoArgs = values.repo ? ['--repo', values.repo] : [];
const gh = (...args: string[]): string => run('gh', [...args, ...repoArgs]);

function cacheName(s: string | undefined): CacheName {
  if (!CACHE_NAMES.includes(s as CacheName))
    throw new Error(`expected a cache name: ${CACHE_NAMES.join(' | ')}`);
  return s as CacheName;
}

const releaseTags = (): string[] =>
  run('gh', [
    'api',
    '--paginate',
    `repos/${values.repo ?? '{owner}/{repo}'}/releases?per_page=100`,
    '--jq',
    '.[].tag_name',
  ])
    .split('\n')
    .filter(Boolean);

/** Download one release asset into `dir` (gh 2.4 has no `download --output -`). */
function downloadAsset(tag: string, pattern: string, dir: string): string {
  gh('release', 'download', tag, '--pattern', pattern, '--dir', dir);
  return resolve(dir, pattern);
}

function remoteManifest(tag: string): CacheManifest {
  const tmp = mkdtempSync(resolve(tmpdir(), 'cache-manifest-'));
  try {
    const file = downloadAsset(tag, MANIFEST_ASSET, tmp);
    const m = parseCacheManifest(JSON.parse(readFileSync(file, 'utf8')), `manifest of ${tag}`);
    if (m.tag !== tag) throw new Error(`asked for ${tag} but the manifest is for ${m.tag}`);
    return m;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function pack(name: CacheName): Promise<string> {
  const { dir, ext } = CACHES[name];
  const cacheDir = resolve(root, dir);
  const all = listCacheFiles(cacheDir, ext);
  if (!all.length) throw new Error(`${cacheDir} has no ${ext} files`);

  let base: CacheManifest | null = null;
  let files = all;
  if (values.delta) {
    const tip = latestTag(releaseTags(), name);
    if (tip) {
      base = remoteManifest(tip);
      const chain = await resolveChain(base, async (t) => remoteManifest(t));
      files = missingFrom(all, new Set(chain.flatMap((m) => m.files)));
      if (!files.length) throw new Error(`nothing new since ${tip}`);
    }
  }

  const coverage =
    name === 'riksdag-text'
      ? riksdagTextCoverage(
          all,
          loadStore(resolve(root, 'tools/out/riksdag-store', `${values.term}.json`), values.term!)
            .documents,
          values.term!,
        )
      : name === 'score-cache'
        ? scoreCacheCoverageFrom(readRunManifests('runs'), all.length)
        : linkCacheCoverageFrom(readRunManifests('link-runs'), all.length);

  const date = new Date().toISOString().slice(0, 10);
  const taken = new Set(releaseTags());
  let n = 1;
  while (
    taken.has(cacheTag(name, date, n)) ||
    existsSync(resolve(values['out-dir']!, cacheTag(name, date, n)))
  )
    n++;
  const tag = cacheTag(name, date, n);
  const outDir = resolve(values['out-dir']!, tag);
  mkdirSync(outDir, { recursive: true });
  const archiveFile = `${tag.replace(/^cache-/, '')}.tar.zst`;
  const archivePath = resolve(outDir, archiveFile);

  const listFile = resolve(outDir, 'files.txt');
  writeFileSync(listFile, files.join('\n') + '\n');
  console.error(
    `packing ${files.length} of ${all.length} files (${base ? `delta on ${base.tag}` : 'full'})...`,
  );
  run('tar', [
    '--use-compress-program',
    `zstd -${values.level} -T0`,
    '-cf',
    archivePath,
    '-C',
    cacheDir,
    '-T',
    listFile,
  ]);
  rmSync(listFile);

  const manifest = parseCacheManifest({
    version: 1,
    name,
    tag,
    createdAt: date,
    archive: {
      file: archiveFile,
      sha256: sha256File(archivePath),
      bytes: statSync(archivePath).size,
      compression: 'zstd',
    },
    base: base?.tag ?? null,
    files,
    uncompressedBytes: files.reduce((sum, f) => sum + statSync(resolve(cacheDir, f)).size, 0),
    coverage,
  });
  writeJsonAtomic(resolve(outDir, MANIFEST_ASSET), manifest);
  console.error(`wrote ${outDir} (${(manifest.archive.bytes / 1e6).toFixed(1)} MB)`);
  return outDir;
}

function readRunManifests(dir: 'runs' | 'link-runs'): unknown[] {
  const runsDir = resolve(root, 'tools/out', dir);
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir).flatMap((d) => {
    const p = resolve(runsDir, d, 'manifest.json');
    return existsSync(p) ? [JSON.parse(readFileSync(p, 'utf8')) as unknown] : [];
  });
}

function publish(outDir: string): void {
  const manifest = parseCacheManifest(
    JSON.parse(readFileSync(resolve(outDir, MANIFEST_ASSET), 'utf8')),
  );
  const c = manifest.coverage;
  const summary =
    c.kind === 'riksdag-text'
      ? `Riksdag document text, term ${c.term}, ${c.documentCount} documents dated ${c.documentsFrom} to ${c.documentsTo} (types: ${c.doktyper.join(', ')}).`
      : c.kind === 'score-cache'
        ? `Scoring results for ${c.entryCount} requests from runs: ${c.runs.map((r) => `${r.name} (${r.scorerKind}/${r.model})`).join(', ')}.`
        : `Linking judgements for ${c.entryCount} requests from runs: ${c.runs.map((r) => `${r.name} (${r.judgeKind}/${r.model})`).join(', ')}.`;
  const notes =
    `${summary}\n\n${manifest.base ? `Delta on \`${manifest.base}\`: unpack the base first (\`cache-archive fetch\` does this).` : 'Full snapshot.'}\n\n` +
    `Fetch with \`node --experimental-strip-types tools/cache-archive.ts fetch ${manifest.name}\`. See docs/cache-sharing.md.`;
  gh(
    'release',
    'create',
    manifest.tag,
    resolve(outDir, manifest.archive.file),
    resolve(outDir, MANIFEST_ASSET),
    '--title',
    `${manifest.name} cache ${manifest.createdAt}`,
    '--notes',
    notes,
  );
  console.error(`published ${manifest.tag}`);
}

async function fetchCache(name: CacheName): Promise<void> {
  const dest = resolve(values.dest ?? resolve(root, CACHES[name].dir));
  mkdirSync(dest, { recursive: true });
  const tag = values.tag ?? latestTag(releaseTags(), name);
  if (!tag) throw new Error(`no published ${name} snapshot`);
  const chain = await resolveChain(remoteManifest(tag), async (t) => remoteManifest(t));
  for (const m of chain) {
    if (m.files.every((f) => existsSync(resolve(dest, f)))) {
      console.error(`${m.tag}: already unpacked`);
      continue;
    }
    const tmp = mkdtempSync(resolve(tmpdir(), 'cache-fetch-'));
    const stage = mkdtempSync(resolve(dest, '..', '.cache-stage-'));
    try {
      const archive = downloadAsset(m.tag, m.archive.file, tmp);
      const listing = parseTarListing(
        run('tar', ['--use-compress-program', ZSTD_READ, '-tvf', archive]),
      );
      const problems = [
        ...archiveProblems(m, archive),
        ...listing.unparsed.map((l) => `unreadable tar entry: ${l}`),
        ...memberProblems(m, listing.entries),
      ];
      if (problems.length)
        throw new Error(`${m.tag} failed verification: ${problems.slice(0, 5).join('; ')}`);
      // Unpack aside and move file by file, so an interrupted fetch never leaves a truncated entry in the cache.
      run('tar', [
        '--use-compress-program',
        ZSTD_READ,
        '-xf',
        archive,
        '-C',
        stage,
        '--no-same-owner',
      ]);
      let added = 0;
      for (const f of m.files) {
        if (existsSync(resolve(dest, f))) continue;
        renameSync(resolve(stage, f), resolve(dest, f));
        added++;
      }
      console.error(`${m.tag}: ${added} new of ${m.files.length} files in ${dest}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      rmSync(stage, { recursive: true, force: true });
    }
  }
}

function list(name?: CacheName): void {
  for (const n of name ? [name] : CACHE_NAMES) {
    const tags = releaseTags()
      .filter((t) => t.startsWith(`cache-${n}-`))
      .sort();
    console.log(`${n}: ${tags.length ? tags.join(', ') : '(none published)'}`);
    const tip = latestTag(tags, n);
    if (tip) console.log(JSON.stringify(remoteManifest(tip).coverage, null, 2));
  }
}

if (command === 'pack') {
  const outDir = await pack(cacheName(arg));
  if (values.publish) publish(outDir);
} else if (command === 'publish') {
  if (!arg) throw new Error('usage: publish <dir with cache-manifest.json>');
  publish(resolve(arg));
} else if (command === 'fetch') await fetchCache(cacheName(arg));
else if (command === 'list') list(arg ? cacheName(arg) : undefined);
else throw new Error('usage: cache-archive.ts <pack|publish|fetch|list> ...');
