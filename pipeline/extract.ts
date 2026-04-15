/**
 * Step 2: Extract political promises from discovered articles.
 *
 * This stage is resilient to transient API errors (rate limit, overload):
 * it saves results after every article and a re-run will resume from
 * where it left off, so hitting the TPM ceiling mid-run doesn't cost the
 * work already done.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, createClient, isTransientApiError, loggedParse } from "./log.ts";
import { sanitizeArticle, wrapUntrusted } from "./sanitize.ts";
import {
  type Discovery,
  type Extraction,
  ExtractionListSchema,
  loadJson,
  validateDiscoveries,
  validateExtractions,
  writeJson,
} from "./schemas.ts";

const PROMPT = readFileSync(new URL("prompts/extract.txt", import.meta.url), "utf-8");
const OUTPUT_FORMAT = zodOutputFormat(ExtractionListSchema);

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

  const response = await loggedParse(client!, `extract: ${article.url}`, {
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\nArticle URL: ${article.url}\n\n${wrapped}`,
      },
    ],
    output_config: { format: OUTPUT_FORMAT },
  });

  // parsed_output is undefined only if Claude refused (stop_reason "refusal")
  // or hit max_tokens mid-output. Both are non-transient and skip-worthy.
  if (!response.parsed_output) {
    console.error(
      `Warning: no parsed_output for ${article.url} (stop_reason=${response.stop_reason}); skipping`,
    );
    return [];
  }
  return response.parsed_output.extractions;
}

// --- Resume support -----------------------------------------------------
// A plain-text side-car file lists the URLs already successfully attempted.
// We append to it after each article so a crash or TPM wipeout leaves a
// usable cursor. Tracking attempts (not just successful extractions)
// means articles that yielded zero promises aren't retried either.

function loadProcessedUrls(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const urls = readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return new Set(urls);
}

function markProcessed(path: string, url: string): void {
  appendFileSync(path, url + "\n");
}

// --- Main ---------------------------------------------------------------

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

const outputPath = values.output!;
const processedPath = `${outputPath}.processed`;
const dryRun = values["dry-run"]!;

const discoveries = validateDiscoveries(loadJson(inputPath) as unknown[]);
const client = dryRun ? null : createClient();

// Resume: load prior results and the processed-URL cursor.
const existing: Extraction[] = existsSync(outputPath)
  ? validateExtractions(loadJson(outputPath) as unknown[])
  : [];
const processedUrls = loadProcessedUrls(processedPath);
if (existing.length || processedUrls.size) {
  console.error(
    `Resume: ${existing.length} extractions loaded, ${processedUrls.size} URLs already attempted`,
  );
}

const allExtracted: Extraction[] = [...existing];
let skippedTransient = 0;

for (const article of discoveries) {
  if (processedUrls.has(article.url)) {
    console.error(`Skip (already processed): ${article.url}`);
    continue;
  }

  let extracted: Extraction[];
  try {
    extracted = await extractFromArticle(client, article, dryRun);
  } catch (err) {
    if (isTransientApiError(err)) {
      console.error(`Transient error on ${article.url}; skipping this article.`);
      skippedTransient++;
      continue;
    }
    // Non-transient: bubble up and fail the stage. Results so far are
    // already on disk from the last successful incremental save.
    throw err;
  }

  // Filter to high/medium confidence and validate before persisting.
  const kept = validateExtractions(
    extracted.filter((e) => e.confidence === "high" || e.confidence === "medium"),
  );
  allExtracted.push(...kept);

  // Incremental save — if the next call 429s, we don't lose this one.
  writeJson(outputPath, allExtracted);
  if (!dryRun) markProcessed(processedPath, article.url);
  processedUrls.add(article.url);
}

console.error(
  `Extracted ${allExtracted.length} promises (skipped ${skippedTransient} transient-error articles), written to ${outputPath}`,
);
