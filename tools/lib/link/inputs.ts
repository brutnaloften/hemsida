/**
 * Loads the pairs, promises and evidence text a linking config selects (hemsida-4np.5). The only I/O besides
 * the cache. Evidence is the tier-1 text of the document (`riksdag-tier1.ts`) cut to a token budget, plus the
 * eval brief's passages when a briefs folder is configured.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { evalFileSchema, type EvalFile } from '../../../src/schema/eval.ts';
import { briefPath, briefSchema, renderBrief } from '../eval-brief.ts';
import { candidateFileSchema, CANDIDATE_DOKTYPER } from '../riksdag-candidates.ts';
import { extractTier1, type Tier1Doc } from '../riksdag-tier1.ts';
import type { LinkConfig } from './config.ts';
import type { LinkPair, LinkPromise } from './plan.ts';

export interface LinkInputs {
  pairs: LinkPair[];
  promises: Map<string, LinkPromise>;
  /** Evidence text of a pair (memoised per document). */
  evidenceFor: (pair: LinkPair) => string;
}

/** The only fields of a promise file the judge needs (v1 and v2 files both have them). */
const promiseTextSchema = z.looseObject({
  title: z.string().min(1),
  description: z.string().min(1),
});

const TRUNCATION_MARK = '\n[... utdraget avkortat ...]';

/**
 * Evidence text for one document: a header the judge can rely on (type, title, id, decision outcome of a
 * betänkande), then the tier-1 sections, cut at `maxChars`. Pure.
 */
export function renderEvidence(
  doc: Pick<Tier1Doc, 'dok_id' | 'doktyp' | 'outcome' | 'sections'>,
  title: string,
  maxChars: number,
): string {
  const header = [
    `Typ: ${doc.doktyp}`,
    `Titel: ${title}`,
    `Dokument-id: ${doc.dok_id}`,
    ...(doc.outcome && doc.outcome !== 'unknown' ? [`Beslut: ${doc.outcome}`] : []),
  ].join('\n');
  const body = doc.sections.length
    ? doc.sections.map((s) => (s.heading ? `## ${s.heading}\n${s.text}` : s.text)).join('\n\n')
    : '(ingen utdragen text finns för dokumentet)';
  const text = `${header}\n\n${body}`;
  return text.length <= maxChars
    ? text
    : text.slice(0, maxChars - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}

function evalPairs(file: EvalFile, prefix: string): LinkPair[] {
  return file.pairs
    .filter((p) => p.promise_id.startsWith(prefix))
    .map((p) => ({
      id: p.id,
      promise_id: p.promise_id,
      document_id: p.document_id,
      document_title: p.document_title,
      doktyp: p.document_type,
      label: p.label,
      ...(p.stage ? { stage: p.stage } : {}),
    }));
}

/** Pairs from candidate files, best first per promise (relevance, then keyword score). Pure. */
export function candidatePairs(
  files: readonly ReturnType<typeof candidateFileSchema.parse>[],
  opts: {
    prefix: string;
    minRelevance?: number;
    maxPerPromise?: number;
    labels?: ReadonlyMap<string, LinkPair>;
  },
): LinkPair[] {
  const out: LinkPair[] = [];
  for (const f of files) {
    if (!f.promise_id.startsWith(opts.prefix)) continue;
    const picked = f.candidates
      .filter((c) => (CANDIDATE_DOKTYPER as readonly string[]).includes(c.doktyp))
      .filter((c) => opts.minRelevance === undefined || (c.relevance ?? -1) >= opts.minRelevance)
      .sort(
        (a, b) =>
          (b.relevance ?? -1) - (a.relevance ?? -1) ||
          b.score - a.score ||
          (a.dok_id < b.dok_id ? -1 : 1),
      )
      .slice(0, opts.maxPerPromise);
    for (const c of picked) {
      const id = `${f.promise_id}::${c.dok_id}`;
      out.push(
        opts.labels?.get(id) ?? {
          id,
          promise_id: f.promise_id,
          document_id: c.dok_id,
          document_title: c.titel,
          doktyp: c.doktyp,
          label: null,
        },
      );
    }
  }
  return out;
}

/** `root` is the repo root, `textDir` the cached Riksdag text (`tools/out/riksdag-text`). */
export function loadLinkInputs(
  config: LinkConfig,
  root: string,
  textDir: string,
  opts: {
    /** Only the first n pairs (by id): a cheap trial of a real judge. */
    limit?: number;
    /** Test seam for reading a cached document's raw text. */
    readText?: (path: string) => string;
  } = {},
): LinkInputs {
  const readText = opts.readText ?? ((path: string) => readFileSync(path, 'utf8'));
  const { term, id_prefix } = config.inputs.promises;
  const pairCfg = config.inputs.pairs;
  const evalFile = pairCfg.pairs_file
    ? evalFileSchema.parse(JSON.parse(readFileSync(resolve(root, pairCfg.pairs_file), 'utf8')))
    : undefined;

  let pairs: LinkPair[];
  if (pairCfg.kind === 'eval-pairs') {
    pairs = evalPairs(evalFile!, id_prefix);
  } else {
    const dir = resolve(root, 'src/data', term, 'riksdag-candidates');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => candidateFileSchema.parse(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))));
    const labels = new Map(
      evalPairs(evalFile ?? { term, seed: 0, pairs: [] }, '').map((p) => [p.id, p]),
    );
    pairs = candidatePairs(files, {
      prefix: id_prefix,
      minRelevance: pairCfg.min_relevance,
      maxPerPromise: pairCfg.max_per_promise,
      labels,
    });
  }
  pairs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (opts.limit !== undefined) pairs = pairs.slice(0, opts.limit);

  const promiseDir = resolve(root, 'src/data', term, 'promises');
  const promises = new Map<string, LinkPromise>();
  for (const id of new Set(pairs.map((p) => p.promise_id))) {
    const file = resolve(promiseDir, `${id}.json`);
    if (!existsSync(file)) throw new Error(`pair promise ${id} has no file ${file}`);
    const p = promiseTextSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    promises.set(id, { id, title: p.title, text: p.description });
  }

  const maxChars = Math.floor(config.evidence.max_tokens * config.evidence.chars_per_token);
  const briefsDir = config.evidence.briefs_dir
    ? resolve(root, config.evidence.briefs_dir)
    : undefined;
  const docEvidence = new Map<string, string>();
  const evidenceFor = (pair: LinkPair): string => {
    let base = docEvidence.get(pair.document_id);
    if (base === undefined) {
      let raw: string;
      try {
        raw = readText(resolve(textDir, `${pair.document_id}.xml`));
      } catch {
        throw new Error(
          `no cached text for document ${pair.document_id} in ${textDir} (fetch it first)`,
        );
      }
      base = renderEvidence(
        extractTier1(pair.document_id, pair.doktyp, raw),
        pair.document_title,
        maxChars,
      );
      docEvidence.set(pair.document_id, base);
    }
    if (!briefsDir) return base;
    const file = briefPath(briefsDir, pair.id);
    if (!existsSync(file)) return base;
    const brief = briefSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    return `${base}\n\n${renderBrief(brief)}`;
  };

  return { pairs, promises, evidenceFor };
}
