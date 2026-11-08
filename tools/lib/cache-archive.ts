/**
 * Shareable snapshots of the gitignored local caches (hemsida-8l0). `tools/cache-archive.ts` packs a cache
 * directory into a tar.zst, uploads it as a GitHub Release asset next to a `cache-manifest.json`, and fetches
 * it on another machine. This module is the pure part: the manifest schema (the single source of truth for
 * what a snapshot claims), file listing, coverage, delta and verification logic. Docs: docs/cache-sharing.md.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod/v4';
import { formatIssues } from './json.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
/** Cache entries are flat files with plain names; anything else is rejected before a tar is unpacked. */
const TAG_PATTERN = /^cache-[a-z-]+-\d{4}-\d{2}-\d{2}(-\d+)?$/;
const fileName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const CACHE_NAMES = ['riksdag-text', 'score-cache'] as const;
export type CacheName = (typeof CACHE_NAMES)[number];

/** Extension of the entries and default directory (relative to the repo root) of each cache. */
export const CACHES: Record<CacheName, { dir: string; ext: string }> = {
  'riksdag-text': { dir: 'tools/out/riksdag-text', ext: '.xml' },
  'score-cache': { dir: 'tools/out/score-cache', ext: '.json' },
};

const scoringRunSchema = z.strictObject({
  name: z.string(),
  scorerKind: z.string(),
  model: z.string(),
  templateVersion: z.string(),
  planHash: sha256,
  requestCount: z.number().int().nonnegative(),
  status: z.string(),
});
export type ScoringRun = z.infer<typeof scoringRunSchema>;

const riksdagTextCoverageSchema = z.strictObject({
  kind: z.literal('riksdag-text'),
  term: z.string().min(1),
  /** Document types (dir, sou, ds, prop, bet, ...) present in the cache. */
  doktyper: z.array(z.string()).min(1),
  /** Publication dates (`datum` in the Riksdag store) of the oldest and newest cached document. */
  documentsFrom: isoDate,
  /** Watermark: a refresh only needs documents dated after this (minus a lookback). */
  documentsTo: isoDate,
  /** Cached documents in the whole cache at pack time, including those in the base snapshots. */
  documentCount: z.number().int().positive(),
});

const scoreCacheCoverage = z.strictObject({
  kind: z.literal('score-cache'),
  /** Scoring runs (tools/out/runs/<name>/manifest.json) the entries come from. Keys are content hashes. */
  runs: z.array(scoringRunSchema),
  entryCount: z.number().int().nonnegative(),
});

export const cacheManifestSchema = z
  .strictObject({
    version: z.literal(1),
    name: z.enum(CACHE_NAMES),
    /** Release tag: `cache-<name>-<createdAt>`. */
    tag: z.string().regex(TAG_PATTERN),
    createdAt: isoDate,
    archive: z.strictObject({
      file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.tar\.zst$/),
      sha256,
      bytes: z.number().int().positive(),
      compression: z.literal('zstd'),
    }),
    /** Tag of the snapshot this one extends (a delta holds only files missing from it); null = full snapshot. */
    base: z.string().regex(TAG_PATTERN).nullable(),
    /** Files inside this archive, sorted. */
    files: z.array(fileName),
    uncompressedBytes: z.number().int().nonnegative(),
    coverage: z.discriminatedUnion('kind', [riksdagTextCoverageSchema, scoreCacheCoverage]),
  })
  .refine((m) => m.coverage.kind === m.name, { message: 'coverage.kind must equal name' })
  .refine((m) => m.tag.startsWith(`cache-${m.name}-`), {
    message: 'tag must be cache-<name>-<date>',
  });
export type CacheManifest = z.infer<typeof cacheManifestSchema>;
export type RiksdagTextCoverage = z.infer<typeof riksdagTextCoverageSchema>;
export type ScoreCacheCoverage = z.infer<typeof scoreCacheCoverage>;

export const MANIFEST_ASSET = 'cache-manifest.json';

export function parseCacheManifest(raw: unknown, label = 'cache manifest'): CacheManifest {
  const parsed = cacheManifestSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid ${label}: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

export const cacheTag = (name: CacheName, date: string, n = 1): string =>
  `cache-${name}-${date}${n > 1 ? `-${n}` : ''}`;

/** Newest tag of `name` (tags sort by date, then by same-day counter). */
export function latestTag(tags: readonly string[], name: CacheName): string | undefined {
  const re = new RegExp(`^cache-${name}-(\\d{4}-\\d{2}-\\d{2})(?:-(\\d+))?$`);
  return tags
    .map((t) => ({ t, m: re.exec(t) }))
    .filter((x): x is { t: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => a.m[1]!.localeCompare(b.m[1]!) || Number(a.m[2] ?? 1) - Number(b.m[2] ?? 1))
    .at(-1)?.t;
}

/** Sorted names of the cache entries (flat files with the cache's extension) in `dir`. */
export function listCacheFiles(dir: string, ext: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext) && !f.endsWith('.tmp') && statSync(resolve(dir, f)).isFile())
    .sort();
}

/** What a delta archive holds: every file the base snapshots lack. */
export function missingFrom(all: readonly string[], have: ReadonlySet<string>): string[] {
  return all.filter((f) => !have.has(f));
}

export interface StoreDoc {
  doktyp: string;
  datum: string;
}

/** Coverage of the riksdag-text cache: cached `<dok_id>.xml` files joined to the Riksdag store's metadata. */
export function riksdagTextCoverage(
  allFiles: readonly string[],
  store: Readonly<Record<string, StoreDoc>>,
  term: string,
): RiksdagTextCoverage {
  const docs = allFiles.flatMap((f) => {
    const d = store[f.replace(/\.xml$/, '')];
    return d && /^\d{4}-\d{2}-\d{2}/.test(d.datum)
      ? [{ doktyp: d.doktyp, datum: d.datum.slice(0, 10) }]
      : [];
  });
  if (!docs.length)
    throw new Error(`no cached document is in the ${term} store; run ingest-riksdag first`);
  const dates = docs.map((d) => d.datum).sort();
  return riksdagTextCoverageSchema.parse({
    kind: 'riksdag-text',
    term,
    doktyper: [...new Set(docs.map((d) => d.doktyp))].sort(),
    documentsFrom: dates[0],
    documentsTo: dates.at(-1),
    documentCount: allFiles.length,
  });
}

const runManifestSchema = z.looseObject({
  config: z.looseObject({
    name: z.string(),
    scorer: z.looseObject({ kind: z.string(), model: z.string() }),
    question: z.looseObject({ template_version: z.string() }),
  }),
  plan_hash: sha256,
  status: z.string(),
  request_count: z.number().int().nonnegative(),
});

/** Coverage of the score cache from the run manifests in `tools/out/runs/*` (unreadable ones are skipped). */
export function scoreCacheCoverageFrom(
  runManifests: readonly unknown[],
  entryCount: number,
): ScoreCacheCoverage {
  const runs = runManifests.flatMap((raw): ScoringRun[] => {
    const m = runManifestSchema.safeParse(raw);
    if (!m.success) return [];
    const { config } = m.data;
    return [
      {
        name: config.name,
        scorerKind: config.scorer.kind,
        model: config.scorer.model,
        templateVersion: config.question.template_version,
        planHash: m.data.plan_hash,
        requestCount: m.data.request_count,
        status: m.data.status,
      },
    ];
  });
  return scoreCacheCoverage.parse({
    kind: 'score-cache',
    runs: runs.sort((a, b) => a.name.localeCompare(b.name)),
    entryCount,
  });
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Check a downloaded archive against its manifest (size and hash). Returns problems, empty when fine. */
export function archiveProblems(m: CacheManifest, archivePath: string): string[] {
  const problems: string[] = [];
  const bytes = statSync(archivePath).size;
  if (bytes !== m.archive.bytes) problems.push(`size ${bytes} != manifest ${m.archive.bytes}`);
  if (sha256File(archivePath) !== m.archive.sha256)
    problems.push('sha256 does not match the manifest');
  return problems;
}

export interface TarEntry {
  /** First character of the `tar -tv` mode field: `-` regular file, `d`, `l` symlink, `h` hard link, ... */
  type: string;
  name: string;
}

/** Parse `tar -tvf` output (GNU tar). Symlinks and hard links keep their type; link targets are dropped. */
export function parseTarListing(output: string): { entries: TarEntry[]; unparsed: string[] } {
  const entries: TarEntry[] = [];
  const unparsed: string[] = [];
  for (const line of output.split('\n').filter(Boolean)) {
    const m = /^(\S)\S{9}\s+\S+\s+\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+(.*)$/.exec(
      line,
    );
    if (!m) unparsed.push(line);
    else
      entries.push({
        type: m[1]!,
        name: m[2]!.replace(/ (?:->|link to) .*$/, '').replace(/^\.\//, ''),
      });
  }
  return { entries, unparsed };
}

/**
 * The archive must hold exactly the manifest's files, each once and each a regular file. Names alone are not
 * enough: a symlink or hard link member called `a.xml` would be unpacked as a link to anything on the machine.
 */
export function memberProblems(m: CacheManifest, entries: readonly TarEntry[]): string[] {
  const want = new Set(m.files);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const e of entries) {
    if (e.type !== '-') problems.push(`${e.name} is not a regular file (type ${e.type})`);
    else if (!want.has(e.name)) problems.push(`unexpected member ${e.name}`);
    if (seen.has(e.name)) problems.push(`duplicate member ${e.name}`);
    seen.add(e.name);
  }
  for (const f of want) if (!seen.has(f)) problems.push(`missing member ${f}`);
  return problems;
}

/** Manifests from the oldest full snapshot to `tip`, following `base`. Throws on a missing link or a cycle. */
export async function resolveChain(
  tip: CacheManifest,
  load: (tag: string) => Promise<CacheManifest>,
): Promise<CacheManifest[]> {
  const chain = [tip];
  const seen = new Set([tip.tag]);
  for (let cur = tip; cur.base;) {
    if (seen.has(cur.base)) throw new Error(`cache manifest chain loops at ${cur.base}`);
    seen.add(cur.base);
    const asked = cur.base;
    cur = await load(asked);
    if (cur.tag !== asked) throw new Error(`asked for ${asked} but the manifest is for ${cur.tag}`);
    if (cur.name !== tip.name)
      throw new Error(`base ${cur.tag} is a ${cur.name} snapshot, not ${tip.name}`);
    chain.unshift(cur);
  }
  return chain;
}
