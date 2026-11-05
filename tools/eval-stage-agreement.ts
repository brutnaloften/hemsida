/**
 * Report agreement between the hand stages in pairs.json and a model's blind stages in model-labels.json.
 *   node --experimental-strip-types tools/eval-stage-agreement.ts [--term 2022-2026] [--model opus]
 * Only pairs with both a hand stage and a model stage count (only Opus has stages). See docs/eval-set.md.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson } from './lib/json.ts';
import { stageAgreement } from './lib/eval-set.ts';
import { evalFileSchema, modelLabelsFileSchema } from '../src/schema/eval.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    model: { type: 'string', default: 'opus' },
  },
});
const dir = resolve(root, 'src/data', values.term!, 'eval');
const pairs = evalFileSchema.parse(loadJson(resolve(dir, 'pairs.json'))).pairs;
const { labels } = modelLabelsFileSchema.parse(loadJson(resolve(dir, 'model-labels.json')));
const r = stageAgreement(pairs, labels, values.model!);
const handStages = pairs.filter((p) => p.stage).length;
console.log(
  `Hand stages: ${handStages}/${pairs.length}. Compared with ${values.model}: ${r.compared}.`,
);
if (r.compared)
  console.log(`Agreement: ${r.agree}/${r.compared} (${Math.round((100 * r.agree) / r.compared)}%)`);
for (const [k, n] of Object.entries(r.confusions)) console.log(`  ${k}: ${n}`);
