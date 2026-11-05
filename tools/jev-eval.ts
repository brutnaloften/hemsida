/**
 * Score the hand-labelled eval pairs with Jev over the FULL text of each document (hemsida-4np.12).
 *   node --experimental-strip-types --env-file=.env tools/jev-eval.ts [--pairs <pairs.json>] [--max-chars 60000]
 *
 * Per document, the text is split into chunks and every promise in the eval set is asked as a yes/no
 * question against each chunk, so a document is read once for all promises. A pair's score is the highest
 * chunk probability for its own promise. Needs JEV_TOKEN and the text cache from fetch-riksdag-text.ts.
 * Writes tools/out/jev-eval/results.json (gitignored) and prints AUC, per-class scores and misses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { askJev, auc, chunkParagraphs, JevError, type NoulQuestion } from './lib/jev.ts';
import { parseRiksdagText } from './lib/riksdag-text.ts';
import { evalFileSchema } from '../src/schema/eval.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    pairs: { type: 'string', default: resolve(root, 'src/data/2022-2026/eval/pairs.json') },
    'max-chars': { type: 'string', default: '40000' },
    out: { type: 'string', default: resolve(root, 'tools/out/jev-eval') },
  },
});
const token = process.env.JEV_TOKEN;
if (!token) throw new Error('JEV_TOKEN is not set (run with --env-file=.env)');
const file = evalFileSchema.parse(JSON.parse(readFileSync(values.pairs!, 'utf8')));
const maxChars = Number(values['max-chars']);

const promises = new Map<string, NoulQuestion>();
for (const p of file.pairs) {
  promises.set(p.promise_id, {
    type: 'noul',
    instructions: `Beskriver eller genomför dokumentet något som hör till detta vallöfte? Löfte: ${p.promise_title}. ${p.promise_text}`,
  });
}
const questions = Object.fromEntries(promises);

mkdirSync(values.out!, { recursive: true });
/** Ask about one chunk; if the request is too long for Jev, split the chunk in half and ask both halves. */
async function scoreChunk(
  state: string,
): Promise<{ scores: Record<string, number>; tokens: number; requests: number }> {
  try {
    const res = await askJev(token!, state, questions);
    const scores = Object.fromEntries(Object.entries(res.answers).map(([k, a]) => [k, a.noul]));
    return { scores, tokens: res.usage.input_tokens, requests: 1 };
  } catch (err) {
    if (!(err instanceof JevError && err.tooLong) || state.length < 2000) throw err;
    const mid = state.lastIndexOf('\n', state.length / 2);
    const [a, b] = [state.slice(0, mid), state.slice(mid + 1)];
    const [x, y] = [await scoreChunk(a), await scoreChunk(b)];
    const scores: Record<string, number> = { ...x.scores };
    for (const [k, v] of Object.entries(y.scores)) scores[k] = Math.max(scores[k] ?? 0, v);
    return { scores, tokens: x.tokens + y.tokens, requests: x.requests + y.requests };
  }
}

const docs = [...new Set(file.pairs.map((p) => p.document_id))];
const byDoc = new Map<string, { scores: Record<string, number>; chunks: number; tokens: number }>();
let requests = 0;
for (const id of docs) {
  const cached = resolve(values.out!, `doc-${id}.json`);
  if (existsSync(cached)) {
    byDoc.set(id, JSON.parse(readFileSync(cached, 'utf8')));
    continue;
  }
  const raw = readFileSync(resolve(root, 'tools/out/riksdag-text', `${id}.xml`), 'utf8');
  const title = file.pairs.find((p) => p.document_id === id)!.document_title;
  const chunks = chunkParagraphs(
    parseRiksdagText(raw).map((p) => p.text),
    maxChars,
  );
  const scores: Record<string, number> = {};
  let tokens = 0;
  for (const [i, chunk] of chunks.entries()) {
    const res = await scoreChunk(`Dokument: ${title}\n\n${chunk}`);
    requests += res.requests;
    tokens += res.tokens;
    for (const [k, v] of Object.entries(res.scores)) scores[k] = Math.max(scores[k] ?? 0, v);
    if (chunks.length > 5 && i % 5 === 4) console.error(`${id}: ${i + 1}/${chunks.length}`);
  }
  byDoc.set(id, { scores, chunks: chunks.length, tokens });
  writeFileSync(cached, JSON.stringify({ scores, chunks: chunks.length, tokens }));
  console.error(`${id}: ${chunks.length} chunks, ${tokens} input tokens`);
}

const rows = file.pairs.map((p) => {
  const d = byDoc.get(p.document_id)!;
  const own = d.scores[p.promise_id] ?? 0;
  const rank = 1 + Object.values(d.scores).filter((s) => s > own).length;
  return {
    id: p.id,
    label: p.label,
    score: own,
    rank_in_doc: rank,
    of: Object.keys(d.scores).length,
  };
});
const totalTokens = [...byDoc.values()].reduce((a, d) => a + d.tokens, 0);
writeFileSync(
  resolve(values.out!, 'results.json'),
  JSON.stringify({ requests, totalTokens, questions: promises.size, rows }, null, 1),
);

const pos = rows.filter((r) => r.label === 'match' || r.label === 'partial').map((r) => r.score);
const neg = rows.filter((r) => r.label === 'no_match').map((r) => r.score);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log(
  `${requests} requests, ${totalTokens} input tokens, ${promises.size} questions per request`,
);
console.log(`AUC (match|partial vs no_match): ${auc(pos, neg).toFixed(3)}`);
for (const l of ['match', 'partial', 'contradicts', 'no_match']) {
  const s = rows.filter((r) => r.label === l).map((r) => r.score);
  if (s.length)
    console.log(
      `${l}: n=${s.length}, mean ${mean(s).toFixed(2)}, min ${Math.min(...s).toFixed(2)}, max ${Math.max(...s).toFixed(2)}`,
    );
}
console.log('\nlowest-scoring positives and highest-scoring negatives:');
const show = (r: (typeof rows)[number]) =>
  `${r.score.toFixed(2)} rank ${r.rank_in_doc}/${r.of} ${r.label} ${r.id}`;
for (const r of rows
  .filter((r) => r.label === 'match' || r.label === 'partial')
  .sort((a, b) => a.score - b.score)
  .slice(0, 8))
  console.log(show(r));
console.log('--');
for (const r of rows
  .filter((r) => r.label === 'no_match')
  .sort((a, b) => b.score - a.score)
  .slice(0, 6))
  console.log(show(r));
