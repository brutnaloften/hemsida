/**
 * Replace the placeholder reasoning of model-set verdicts with plain Swedish.
 *   node --experimental-strip-types tools/write-reasoning.ts --run <link-run> [--term 2022-2026]
 *     [--id-prefix tido-] [--only <promise-id>] [--model claude-sonnet-5-5] [--concurrency 4]
 *     [--limit n] [--dry-run] [--pin <promise-id> --text <hand-written reasoning>] [--repin-stale]
 * A hand-corrected text is kept with --pin: it is validated, stored in the cache under the promise's
 * current prompt key and recorded with that key in tools/reasoning-pins.json (committed). Every run
 * re-applies the pins whose key still matches, so a rerun reproduces the text; once the evidence
 * changes the key changes, the pin is reported as stale and the model writes a new text.
 * After a deliberate change of the instructions (every key changes) --repin-stale re-keys the pins
 * that still pass the validator; check with --dry-run beforehand that none was stale for other reasons.
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
  hasLawInForce,
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
    pin: { type: 'string' },
    'repin-stale': { type: 'boolean', default: false },
    text: { type: 'string' },
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
  lawInForce: boolean;
  coverage?: 'unconfirmed_full' | 'partial';
  /** An inquiry promise (type inquiry): the text is about the directive, never a law. */
  inquiry: boolean;
  /** Budget, other_action, outcome or vague promise without a law: no law talk, no absence claims. */
  nonLegislative: boolean;
  manifesto: boolean;
}
const REASONED_VERDICTS: readonly string[] = ['in_progress', 'fulfilled', 'partially_fulfilled'];
const today = new Date().toISOString().slice(0, 10);
const jobs: Job[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  if (!file.replace(/\.json$/, '').startsWith(values['id-prefix']!)) continue;
  if (values.only && file !== `${values.only}.json`) continue;
  const rawPromise = loadJson(resolve(dir, file)) as { verdict: unknown };
  const p = promiseSchema.parse(rawPromise);
  if (p.verdict.assessedBy !== 'ai' || !REASONED_VERDICTS.includes(p.verdict.value)) continue;
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
    // A law (sfs) has no link-run judgement; its note says what the law does not cover.
    note:
      judgementBy.get(`${p.id}:${e.dok_id}`)?.reason ??
      e.note ??
      (e.kind === 'bet' ? 'Riksdagens beslut om en proposition som hör till löftet.' : ''),
  }));
  // Not from the Tidö agreement: absence claims about linked documents cannot be verified.
  const manifesto = (p.source as { id?: string }).id !== 'tidoavtalet';
  const inquiry = p.type === 'inquiry' && p.verdict.value !== 'in_progress';
  if (
    p.verdict.value !== 'in_progress' &&
    !items.some((i) => i.kind === (p.type === 'inquiry' ? 'dir' : 'sfs'))
  ) {
    console.warn(
      `WARNING ${file}: verdict ${p.verdict.value} but no ${p.type === 'inquiry' ? 'dir' : 'sfs'} evidence; skipped`,
    );
    continue;
  }
  const prompt = buildReasoningPrompt(p, items, today, inquiry);
  const instructions = reasoningInstructions(items, p.verdict.value, today, p.type, manifesto);
  jobs.push({
    file,
    raw: rawPromise,
    prompt,
    instructions,
    key: reasoningKey(values.model!, prompt, instructions),
    designations: riksdag.map((e) => e.designation),
    lawInForce: hasLawInForce(items, today),
    inquiry,
    manifesto,
    nonLegislative:
      manifesto && p.verdict.value === 'in_progress' && !items.some((i) => i.kind === 'sfs'),
    coverage:
      p.verdict.value === 'partially_fulfilled' ||
      // A manifesto promise in progress rests on an inquiry or proposal, never on the full promise.
      (manifesto && p.verdict.value === 'in_progress' && !items.some((i) => i.kind === 'sfs'))
        ? 'partial'
        : p.verdict.value === 'in_progress' &&
            items.some((i) => i.kind === 'sfs' && i.relevance === 'full')
          ? 'unconfirmed_full'
          : undefined,
  });
}
const cachePath = (k: string) => resolve(cacheDir, `${k}.json`);
const pinsPath = resolve(root, 'tools/reasoning-pins.json');
const pins: Record<string, { key: string; reasoning: string }> = existsSync(pinsPath)
  ? (loadJson(pinsPath) as typeof pins)
  : {};
if (values.pin) {
  const job = jobs.find((j) => j.file === `${values.pin}.json`);
  if (!job || !values.text)
    throw new Error(`--pin needs --text and a reasoned promise ${values.pin}`);
  const problems = reasoningProblems(
    values.text,
    job.designations,
    job.lawInForce,
    job.coverage,
    job.inquiry,
    job.nonLegislative,
    job.manifesto,
  );
  if (problems.length > 0) throw new Error(`pinned text rejected: ${problems.join(', ')}`);
  pins[values.pin] = { key: job.key, reasoning: values.text };
  writeJson(pinsPath, pins);
}
for (const job of jobs) {
  const id = job.file.replace(/\.json$/, '');
  const pin = pins[id];
  if (!pin) continue;
  if (pin.key !== job.key && values['repin-stale']) {
    // After a deliberate change of the instructions: keep the hand text if it still passes the rules.
    const problems = reasoningProblems(
      pin.reasoning,
      job.designations,
      job.lawInForce,
      job.coverage,
      job.inquiry,
    );
    if (problems.length > 0) {
      console.warn(`pin for ${id} not carried over: ${problems.join(', ')}`);
      continue;
    }
    pins[id] = { key: job.key, reasoning: pin.reasoning };
    writeJson(pinsPath, pins);
    console.log(`pin for ${id} re-keyed`);
  } else if (pin.key !== job.key) {
    console.warn(`pin for ${id} is stale (evidence changed); the model writes a new text`);
    continue;
  }
  const problems = reasoningProblems(
    pin.reasoning,
    job.designations,
    job.lawInForce,
    job.coverage,
    job.inquiry,
    job.nonLegislative,
    job.manifesto,
  );
  if (problems.length > 0) throw new Error(`pin for ${id} rejected: ${problems.join(', ')}`);
  writeJsonAtomic(cachePath(job.key), { reasoning: pin.reasoning });
}
const limit = values.limit ? Number(values.limit) : jobs.length;
const todo = jobs.slice(0, limit);
// A cached text that no longer passes the rules (they get stricter) is written again.
const cachedText = (j: Job): string | undefined =>
  existsSync(cachePath(j.key))
    ? reasoningSchema.parse(JSON.parse(readFileSync(cachePath(j.key), 'utf8'))).reasoning
    : undefined;
const usable = (j: Job): boolean => {
  const text = cachedText(j);
  return (
    text !== undefined &&
    reasoningProblems(
      text,
      j.designations,
      j.lawInForce,
      j.coverage,
      j.inquiry,
      j.nonLegislative,
      j.manifesto,
    ).length === 0
  );
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
      const problems = reasoningProblems(
        parsed.data.reasoning,
        job.designations,
        job.lawInForce,
        job.coverage,
        job.inquiry,
        job.nonLegislative,
        job.manifesto,
      );
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
