/**
 * Check the "nämns inte / saknas / framgår inte" claims in the reasoning of model-set verdicts against
 * the real document texts (hemsida-6vh). For each claim sentence a model first picks Swedish search
 * stems for the topic, the cited documents' full texts in tools/out/riksdag-text are searched for them,
 * and a second model call reads the best passages and says whether the claim is true (the topic is
 * absent), false (a cited document does discuss it) or borderline.
 *   node --experimental-strip-types tools/audit-absence-claims.ts [--term 2022-2026] [--id-prefix tido-]
 *     [--only <promise-id>] [--model claude-sonnet-5-5] [--concurrency 4] [--out <results.json>] [--dry-run]
 * Runs through the local Claude Code login (Agent SDK); refuses an API key like the other claude tools.
 * Results are cached in tools/out/absence-audit by hash of model, claim and passages.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson, writeJsonAtomic } from './lib/json.ts';
import { parseRiksdagText } from './lib/riksdag-text.ts';
import { isRiksdagEvidence, promiseSchema } from './lib/schema.ts';
import { absenceSentences } from './lib/write-reasoning.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string', default: 'tido-' },
    only: { type: 'string' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    concurrency: { type: 'string', default: '4' },
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  throw new Error(
    'ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN is set; unset it to use the subscription login',
  );

const dir = resolve(root, 'src/data', values.term!, 'promises');
const cacheDir = resolve(root, 'tools/out/absence-audit');
mkdirSync(cacheDir, { recursive: true });

interface Claim {
  id: string;
  verdict: string;
  title: string;
  description: string;
  sentence: string;
  docs: { designation: string; kind: string; dok_id: string }[];
}
const claims: Claim[] = [];
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const id = file.replace(/\.json$/, '');
  if (!id.startsWith(values['id-prefix']!)) continue;
  if (values.only && id !== values.only) continue;
  const p = promiseSchema.parse(loadJson(resolve(dir, file)));
  if (p.verdict.assessedBy !== 'ai') continue;
  const docs = p.evidence
    .filter(isRiksdagEvidence)
    .filter((e) => e.kind !== 'sfs')
    .map((e) => ({ designation: e.designation, kind: e.kind, dok_id: e.dok_id }));
  for (const sentence of absenceSentences(p.verdict.reasoning)) {
    claims.push({
      id,
      verdict: p.verdict.value,
      title: p.title,
      description: p.description,
      sentence,
      docs,
    });
  }
}
console.log(`${claims.length} absence claims in ${new Set(claims.map((c) => c.id)).size} promises`);
if (values['dry-run']) process.exit(0);

async function ask<T>(system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    for await (const message of query({
      prompt,
      options: {
        model: values.model!,
        settingSources: [],
        tools: [],
        maxTurns: 1,
        thinking: { type: 'disabled' },
        systemPrompt: system,
        outputFormat: { type: 'json_schema', schema },
      },
    })) {
      if (message.type !== 'result') continue;
      if (message.subtype === 'success' && !message.is_error && message.structured_output)
        return message.structured_output as T;
      break;
    }
  }
  throw new Error('claude: no structured output');
}

const paragraphCache = new Map<string, string[]>();
function paragraphs(dokId: string): string[] {
  let ps = paragraphCache.get(dokId);
  if (!ps) {
    const file = resolve(root, 'tools/out/riksdag-text', `${dokId}.xml`);
    ps = existsSync(file)
      ? parseRiksdagText(readFileSync(file, 'utf8'))
          .map((p) => p.text)
          .filter((t) => t.length > 40)
      : [];
    paragraphCache.set(dokId, ps);
  }
  return ps;
}

const STEM_SYSTEM = `Du får ett löfte och en mening ur en motivering som påstår att något "nämns inte" i löftets dokument. Ange 4 till 10 korta svenska söksträngar (små bokstäver, ordstammar utan ändelser, till exempel "ungdomsfängel", "maxtid", "sluten ungdomsvård", "små modulära") som skulle träffa en passage som behandlar just det som påstås saknas. Inkludera böjningsformer och synonymer som stammar. Svara som JSON.`;
const STEM_SCHEMA = {
  type: 'object',
  properties: { stems: { type: 'array', items: { type: 'string' } } },
  required: ['stems'],
  additionalProperties: false,
};
const JUDGE_SYSTEM = `Du granskar ett påstående om vad som saknas i ett antal riksdagsdokument. Du får ett löfte, en mening som påstår att något "nämns inte" / "saknas" / "framgår inte" i dokumenten, och de passager ur dokumentens fulltext som bäst matchar ämnet. Avgör:
- "false": minst en passage behandlar i sak det som påstås saknas (förslag, bedömning, beslut eller uppdrag om just det). Då är påståendet falskt.
- "true": passagerna visar inget i sak om det som påstås saknas (bara slumpträffar eller allmänna omnämnanden).
- "borderline": ämnet berörs men bara i förbigående, eller bara delvis, eller det är oklart om det motsvarar det som påstås saknas.
Sök i passagerna efter just det som meningen säger saknas. Läs noga, citera den passage som avgör. Svara som JSON med verdict, quote (kort ordagrant citat från passagen, tomt vid "true"), doc (beteckning, tomt vid "true") och why (en mening på engelska).`;
const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['false', 'true', 'borderline'] },
    quote: { type: 'string' },
    doc: { type: 'string' },
    why: { type: 'string' },
  },
  required: ['verdict', 'quote', 'doc', 'why'],
  additionalProperties: false,
};

interface Result {
  id: string;
  verdict: string;
  sentence: string;
  stems: string[];
  judgement: { verdict: 'false' | 'true' | 'borderline'; quote: string; doc: string; why: string };
}

async function audit(c: Claim): Promise<Result> {
  const { stems } = await ask<{ stems: string[] }>(
    STEM_SYSTEM,
    `Löfte: ${c.title}\n${c.description}\n\nMening: ${c.sentence}`,
    STEM_SCHEMA,
  );
  const lower = stems.map((s) => s.toLowerCase().trim()).filter((s) => s.length >= 3);
  const scored: { designation: string; text: string; score: number }[] = [];
  for (const d of c.docs) {
    const hits: { designation: string; text: string; score: number }[] = [];
    for (const text of paragraphs(d.dok_id)) {
      const l = text.toLowerCase();
      const score = lower.filter((s) => l.includes(s)).length;
      if (score > 0) hits.push({ designation: d.designation, text, score });
    }
    hits.sort((a, b) => b.score - a.score);
    scored.push(...hits.slice(0, 5));
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 12);
  const passages = top.length
    ? top.map((h, n) => `[${n + 1}] ${h.designation}: ${h.text.slice(0, 900)}`).join('\n\n')
    : '(inga passager i de angivna dokumenten innehåller söksträngarna)';
  const prompt = `Löfte: ${c.title}\n${c.description}\n\nPåstående: ${c.sentence}\n\nPassager:\n${passages}`;
  const key = createHash('sha256')
    .update(JSON.stringify([values.model, JUDGE_SYSTEM, prompt]))
    .digest('hex');
  const cachePath = resolve(cacheDir, `${key}.json`);
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8')) as Result;
  const judgement = await ask<Result['judgement']>(JUDGE_SYSTEM, prompt, JUDGE_SCHEMA);
  const result: Result = {
    id: c.id,
    verdict: c.verdict,
    sentence: c.sentence,
    stems: lower,
    judgement,
  };
  writeJsonAtomic(cachePath, result);
  return result;
}

const results: Result[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.max(1, Number(values.concurrency)) }, async () => {
    while (next < claims.length) {
      const c = claims[next++]!;
      try {
        results.push(await audit(c));
      } catch (err) {
        console.error(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }),
);
results.sort((a, b) => a.id.localeCompare(b.id));
const count = (v: string) => results.filter((r) => r.judgement.verdict === v).length;
console.log(
  `audited ${results.length}/${claims.length}: ${count('false')} false, ${count('borderline')} borderline, ${count('true')} true`,
);
for (const r of results.filter((r) => r.judgement.verdict !== 'true'))
  console.log(
    `${r.judgement.verdict.toUpperCase()} ${r.id} [${r.verdict}]: ${r.sentence}\n  ${r.judgement.doc}: ${r.judgement.quote.slice(0, 200)}\n  ${r.judgement.why}`,
  );
if (values.out) writeJson(resolve(values.out), results);
