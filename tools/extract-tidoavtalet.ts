/**
 * One-time extraction of candidate promises from the Tidöavtalet PDF.
 * See docs/tido-extraction.md. Run with:
 *   node --experimental-strip-types tools/extract-tidoavtalet.ts [--dry-run] ...
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "./lib/claude.ts";
import { loadJson, validateArray, writeJson } from "./lib/json.ts";
import { processResumable } from "./lib/resume.ts";
import { sourceSchema } from "./lib/schema.ts";
import {
  buildParams,
  candidateEntrySchema,
  countPdfPages,
  extractChunk,
  makeChunks,
  mergeChunk,
  pdfToBase64,
  type CandidateEntry,
} from "./lib/tido-extract.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    pdf: { type: "string", default: resolve(root, "tools/out/tidoavtalet.pdf") },
    out: {
      type: "string",
      default: resolve(root, "src/data/2022-2026/candidates/tidoavtalet.json"),
    },
    cursor: { type: "string", default: resolve(root, "tools/out/tidoavtalet.processed") },
    pages: { type: "string" },
    "pages-per-chunk": { type: "string", default: "8" },
  },
});

const pdfPath = values.pdf!;
const outPath = values.out!;
const cursorPath = values.cursor!;

async function ensurePdf(path: string): Promise<void> {
  if (existsSync(path)) return;
  const source = sourceSchema.parse(loadJson(resolve(root, "src/data/sources/tidoavtalet.json")));
  for (const url of [source.url, source.archive]) {
    console.error(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    return;
  }
  throw new Error(`Could not download the PDF; place it at ${path} or pass --pdf`);
}

async function main(): Promise<void> {
  const dryRun = values["dry-run"];
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Export it, or use --dry-run to preview requests.");
    process.exit(1);
  }
  let totalPages = values.pages ? Number(values.pages) : null;
  if (!totalPages) {
    if (!dryRun) await ensurePdf(pdfPath);
    if (!existsSync(pdfPath)) {
      throw new Error(`PDF not found at ${pdfPath}; pass --pages N for a dry run without it`);
    }
    totalPages = countPdfPages(readFileSync(pdfPath));
    if (!totalPages) throw new Error("Could not detect the page count; pass --pages N");
  }
  const chunks = makeChunks(totalPages, Number(values["pages-per-chunk"]));

  if (dryRun) {
    console.log(`Dry run: ${chunks.length} requests, no API calls.`);
    for (const chunk of chunks) {
      console.log(`--- ${chunk.key} ---`);
      console.log(JSON.stringify(buildParams("<pdf base64 omitted>", chunk), null, 2));
    }
    return;
  }

  await ensurePdf(pdfPath);
  const pdfBase64 = pdfToBase64(pdfPath);
  const client = createClient();

  let entries: CandidateEntry[] = existsSync(outPath)
    ? validateArray(candidateEntrySchema, loadJson(outPath) as unknown[], "candidates")
    : [];
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(cursorPath), { recursive: true });

  const summary = await processResumable(chunks, {
    cursorPath,
    key: (c) => c.key,
    process: async (chunk) => {
      const taken = new Set(entries.filter((e) => e.chunk !== chunk.key).map((e) => e.promise.id));
      const fresh = await extractChunk(client, pdfBase64, chunk, taken);
      entries = mergeChunk(entries, chunk, fresh);
      writeJson(outPath, entries);
      console.error(`${chunk.key}: ${fresh.length} candidates`);
    },
  });
  console.error(`Done: ${JSON.stringify(summary)}; ${entries.length} candidates in ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
