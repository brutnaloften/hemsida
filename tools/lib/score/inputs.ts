/** Load the documents, promises and labelled pairs a config selects (hemsida-vzn). The only I/O besides the cache. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evalFileSchema } from '../../../src/schema/eval.ts';
import { parseRiksdagText } from '../riksdag-text.ts';
import { defaultStorePath, loadStore } from '../riksdag-ingest.ts';
import { inShard, type Shard } from './shard.ts';
import type { ScoreConfig } from './config.ts';
import type { LabelledPair } from './report.ts';
import type { PlanDocument, PlanPromise } from './plan.ts';

export interface RunInputs {
  documents: PlanDocument[];
  promises: PlanPromise[];
  pairs: LabelledPair[];
}

export interface CacheDocMeta {
  titel: string;
  doktyp: string;
  datum: string;
}

/**
 * Pick documents from the text cache (`<dok_id>.xml` file names) for a `cache` config: optional doktyp
 * and since-date filters against the store's metadata. Sorted by id. Pure.
 */
export function selectCacheDocuments(
  files: readonly string[],
  store: Readonly<Record<string, CacheDocMeta>>,
  filter: { doktyper?: readonly string[]; since?: string },
): { id: string; title: string }[] {
  const filtered = filter.doktyper !== undefined || filter.since !== undefined;
  return files
    .filter((f) => f.endsWith('.xml'))
    .map((f) => f.slice(0, -'.xml'.length))
    .sort()
    .flatMap((id) => {
      const meta = store[id];
      if (filtered) {
        if (!meta) return [];
        if (filter.doktyper && !filter.doktyper.includes(meta.doktyp)) return [];
        if (filter.since && !(meta.datum >= filter.since)) return [];
      }
      return [{ id, title: meta?.titel || id }];
    });
}

/** `root` is the repo root, `textDir` the cached Riksdag text (`tools/out/riksdag-text`). */
export function loadInputs(
  config: ScoreConfig,
  root: string,
  textDir: string,
  opts: {
    storePath?: string;
    /** Only load documents in this shard; out-of-shard text is never read. */
    shard?: Shard;
    /** Test seam for reading a cached document's XML. */
    readText?: (path: string) => string;
  } = {},
): RunInputs {
  const readText = opts.readText ?? ((path: string) => readFileSync(path, 'utf8'));
  const docCfg = config.inputs.documents;
  const evalFile = docCfg.pairs_file
    ? evalFileSchema.parse(JSON.parse(readFileSync(resolve(root, docCfg.pairs_file), 'utf8')))
    : undefined;
  const titles = new Map(evalFile?.pairs.map((p) => [p.document_id, p.document_title]));
  let ids: string[];
  if (docCfg.kind === 'cache') {
    const storeFile = opts.storePath ?? defaultStorePath(root, config.inputs.promises.term);
    if (!existsSync(storeFile))
      throw new Error(
        `Riksdag store ${storeFile} not found; run ingest-riksdag (or fetch the riksdag-store data) first`,
      );
    const store = loadStore(storeFile, config.inputs.promises.term);
    const selected = selectCacheDocuments(readdirSync(textDir), store.documents, docCfg);
    // Eval-pairs titles win so the eval requests keep their cache keys.
    for (const d of selected) if (!titles.has(d.id)) titles.set(d.id, d.title);
    ids = selected.map((d) => d.id);
  } else {
    ids = docCfg.kind === 'ids' ? docCfg.ids : [...titles.keys()];
  }

  if (opts.shard) {
    const shard = opts.shard;
    ids = ids.filter((id) => inShard(id, shard));
  }

  const documents = ids.map((id) => {
    let raw: string;
    try {
      raw = readText(resolve(textDir, `${id}.xml`));
    } catch {
      throw new Error(`no cached text for document ${id} in ${textDir} (fetch it first)`);
    }
    return {
      id,
      title: titles.get(id) ?? id,
      paragraphs: parseRiksdagText(raw).map((p) => p.text),
    };
  });

  const dir = resolve(root, 'src/data', config.inputs.promises.term, 'promises');
  const promises: PlanPromise[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.startsWith(config.inputs.promises.id_prefix) || !f.endsWith('.json')) continue;
    const p = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as {
      id: string;
      title: string;
      description: string;
    };
    promises.push({ id: p.id, title: p.title, text: p.description });
  }
  if (!promises.length)
    throw new Error(`no promises match prefix "${config.inputs.promises.id_prefix}"`);

  return { documents, promises, pairs: evalFile?.pairs ?? [] };
}
