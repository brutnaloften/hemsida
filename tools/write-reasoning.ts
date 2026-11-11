/**
 * Replace the placeholder reasoning of model-set verdicts with plain Swedish.
 *   node --experimental-strip-types tools/write-reasoning.ts --run <link-run> [--term 2022-2026]
 *     [--id-prefix tido-] [--only <promise-id>] [--model claude-sonnet-5-5] [--concurrency 4]
 *     [--limit n] [--dry-run]
 * Runs through the local Claude Code login (Agent SDK), refuses an API key like the other claude tools.
 * Results are cached in tools/out/reasoning-cache by hash of model, prompt version, promise and
 * evidence, so a rerun only pays for promises whose evidence changed (a cached text that fails the
 * current validator is written again). Run `pnpm fmt` afterwards.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson, writeJsonAtomic } from './lib/json.ts';
import { isRiksdagEvidence, promiseSchema } from './lib/schema.ts';
import {
  REASONING_JSON_SCHEMA,
  buildReasoningPrompt,
  reasoningInstructions,
  reasoningKey,
  reasoningProblems,
  reasoningSchema,
  type ReasoningItem,
} from './lib/write-reasoning.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    run: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string', default: '' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    concurrency: { type: 'string', default: '4' },
    limit: { type: 'string' },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.run) throw new Error('usage: write-reasoning.ts --run <link-run> [--dry-run]');
if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  throw new Error(
    'ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN is set; unset it to use the subscription login',
  );

type Judgement = { reason: string; stage?: 'definitive' | 'preparatory' | 'background' };
type Row = { promise_id: string; document_id: string; judgement: Judgement };
// Several runs may be given, comma separated (e.g. the main run and a re-link of split promises).
const rows = values.run.split(',').flatMap((run) => {
  const raw = loadJson(resolve(root, 'tools/out/link-runs', run, 'results.json')) as
    | Row[]
    | { results: Row[] };
  return Array.isArray(raw) ? raw : raw.results;
});
const judgementBy = new Map(rows.map((r) => [`${r.promise_id}:${r.document_id}`, r.judgement]));

const cacheDir = resolve(root, 'tools/out/reasoning-cache');
mkdirSync(cacheDir, { recursive: true });
const dir = resolve(root, 'src/data', values.term!, 'promises');

interface Job {
  file: string;
  raw: object;
  prompt: string;
  instructions: string;
  key: string;
  designations: string[];
}
const jobs: Job[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  if (!file.replace(/\.json$/, '').startsWith(values['id-prefix']!)) continue;
  if (values.only && file !== `${values.only}.json`) continue;
  const rawPromise = loadJson(resolve(dir, file)) as { verdict: unknown };
  const p = promiseSchema.parse(rawPromise);
  if (p.verdict.assessedBy !== 'ai' || p.verdict.value !== 'in_progress') continue;
  const riksdag = p.evidence.filter(isRiksdagEvidence);
  const items: ReasoningItem[] = riksdag.map((e) => ({
    kind: e.kind,
    date: e.date,
    title: e.title,
    relevance: e.relevance,
    // A betänkande without a judgement was added because it decides a linked proposition.
    ...(judgementBy.get(`${p.id}:${e.dok_id}`)?.stage
      ? { stage: judgementBy.get(`${p.id}:${e.dok_id}`)!.stage! }
      : e.kind === 'bet' && { stage: 'definitive' as const }),
    note:
      judgementBy.get(`${p.id}:${e.dok_id}`)?.reason ??
      (e.kind === 'bet' ? 'Riksdagens beslut om en proposition som hör till löftet.' : ''),
  }));
  const prompt = buildReasoningPrompt(p, items);
  const instructions = reasoningInstructions(items);
  jobs.push({
    file,
    raw: rawPromise,
    prompt,
    instructions,
    key: reasoningKey(values.model!, prompt, instructions),
    designations: riksdag.map((e) => e.designation),
  });
}
const limit = values.limit ? Number(values.limit) : jobs.length;
const todo = jobs.slice(0, limit);
const cachePath = (k: string) => resolve(cacheDir, `${k}.json`);
// A cached text that no longer passes the rules (they get stricter) is written again.
const cachedText = (j: Job): string | undefined =>
  existsSync(cachePath(j.key))
    ? reasoningSchema.parse(JSON.parse(readFileSync(cachePath(j.key), 'utf8'))).reasoning
    : undefined;
const usable = (j: Job): boolean => {
  const text = cachedText(j);
  return text !== undefined && reasoningProblems(text, j.designations).length === 0;
};
const uncached = todo.filter((j) => !usable(j));
console.log(
  `${todo.length} promises, ${todo.length - uncached.length} cached, ${uncached.length} to write`,
);
if (values['dry-run']) process.exit(0);

async function write(job: Job): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    for await (const message of query({
      prompt: job.prompt,
      options: {
        model: values.model!,
        settingSources: [],
        tools: [],
        maxTurns: 1,
        thinking: { type: 'disabled' },
        systemPrompt: job.instructions,
        outputFormat: { type: 'json_schema', schema: REASONING_JSON_SCHEMA },
      },
    })) {
      if (message.type !== 'result') continue;
      if (message.subtype !== 'success' || message.is_error) {
        throw new Error(
          `claude: ${message.subtype} ${String((message as { result?: string }).result ?? '')}`,
        );
      }
      const parsed = reasoningSchema.safeParse(message.structured_output);
      if (!parsed.success) break;
      const problems = reasoningProblems(parsed.data.reasoning, job.designations);
      if (problems.length === 0) {
        writeJsonAtomic(cachePath(job.key), parsed.data);
        return;
      }
      console.error(`${job.file}: attempt ${attempt} rejected (${problems.join(', ')})`);
      break;
    }
  }
  console.error(`${job.file}: gave up, keeping the placeholder`);
}

let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: Math.max(1, Number(values.concurrency)) }, async () => {
    while (next < uncached.length) {
      const job = uncached[next++]!;
      try {
        await write(job);
      } catch (err) {
        // One failed request must not lose the others; a rerun retries it.
        console.error(`${job.file}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (++done % 20 === 0) console.log(`${done}/${uncached.length}`);
    }
  }),
);

let updated = 0;
for (const job of todo) {
  if (!usable(job)) continue;
  const { reasoning } = reasoningSchema.parse(JSON.parse(readFileSync(cachePath(job.key), 'utf8')));
  const doc = job.raw as { verdict: { reasoning: string } };
  if (doc.verdict.reasoning === reasoning) continue;
  doc.verdict.reasoning = reasoning;
  writeJson(resolve(dir, job.file), doc);
  updated++;
}
console.log(`${updated} promise files updated`);
