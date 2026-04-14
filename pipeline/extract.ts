/**
 * Step 2: Extract political promises from discovered articles.
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeArticle, wrapUntrusted } from "./sanitize.ts";
import {
  type Discovery,
  type Extraction,
  loadJson,
  validateDiscoveries,
  validateExtractions,
  writeJson,
} from "./schemas.ts";

const PROMPT = readFileSync(new URL("prompts/extract.txt", import.meta.url), "utf-8");

function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]") + 1;
  if (start === -1 || end <= start) return [];
  return JSON.parse(text.slice(start, end));
}

async function fetchArticle(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "BrutnaLoften/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    return await resp.text();
  } catch (e) {
    console.error(`Warning: failed to fetch ${url}: ${e}`);
    return null;
  }
}

async function extractFromArticle(
  client: Anthropic | null,
  article: Discovery,
  dryRun: boolean,
): Promise<Extraction[]> {
  if (dryRun) {
    console.error(`DRY RUN: would extract from ${article.url}`);
    return [
      {
        politician_or_party: "Testparti",
        promise_text: "Dry run test promise",
        direct_quote: null,
        date: article.found_date,
        source_url: article.url,
        confidence: "high",
      },
    ];
  }

  const html = await fetchArticle(article.url);
  if (!html) return [];

  const sanitized = sanitizeArticle(html);
  const wrapped = wrapUntrusted(sanitized);

  const response = await client!.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\nArticle URL: ${article.url}\n\n${wrapped}`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      return parseJsonArray(block.text) as Extraction[];
    }
  }
  return [];
}

const { values, positionals } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    output: { type: "string", short: "o", default: "extracted.json" },
  },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error("Usage: extract.ts <discoveries.json> [-o output.json] [--dry-run]");
  process.exit(1);
}

const discoveries = validateDiscoveries(loadJson(inputPath) as unknown[]);
const client = values["dry-run"] ? null : new Anthropic();

const allExtracted: Extraction[] = [];
for (const article of discoveries) {
  const extracted = await extractFromArticle(client, article, values["dry-run"]!);
  allExtracted.push(...extracted);
}

// Filter to high/medium confidence only
const filtered = allExtracted.filter((e) => e.confidence === "high" || e.confidence === "medium");
const validated = validateExtractions(filtered);

writeJson(values.output!, validated);
console.error(`Extracted ${validated.length} promises, written to ${values.output}`);
