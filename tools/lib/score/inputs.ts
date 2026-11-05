/** Load the documents, promises and labelled pairs a config selects (hemsida-vzn). The only I/O besides the cache. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evalFileSchema } from '../../../src/schema/eval.ts';
import { parseRiksdagText } from '../riksdag-text.ts';
import type { ScoreConfig } from './config.ts';
import type { LabelledPair } from './report.ts';
import type { PlanDocument, PlanPromise } from './plan.ts';

export interface RunInputs {
  documents: PlanDocument[];
  promises: PlanPromise[];
  pairs: LabelledPair[];
}

/** `root` is the repo root, `textDir` the cached Riksdag text (`tools/out/riksdag-text`). */
export function loadInputs(config: ScoreConfig, root: string, textDir: string): RunInputs {
  const docCfg = config.inputs.documents;
  const evalFile = docCfg.pairs_file
    ? evalFileSchema.parse(JSON.parse(readFileSync(resolve(root, docCfg.pairs_file), 'utf8')))
    : undefined;
  const titles = new Map(evalFile?.pairs.map((p) => [p.document_id, p.document_title]));
  const ids = docCfg.kind === 'ids' ? docCfg.ids : [...titles.keys()];

  const documents = ids.map((id) => {
    let raw: string;
    try {
      raw = readFileSync(resolve(textDir, `${id}.xml`), 'utf8');
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
