/**
 * Step 1: Discover recent Swedish political news articles using Claude web search.
 *
 * Uses structured outputs: Claude executes web searches (server-side), then
 * produces a final JSON object matching DiscoveryListSchema. No more reverse-
 * scanning text blocks for the first `[` — the SDK returns `parsed_output`
 * typed and validated.
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, createClient, loggedParse } from "./log.ts";
import {
  type Discovery,
  DiscoveryListSchema,
  validateDiscoveries,
  writeJson,
} from "./schemas.ts";

const PROMPT = readFileSync(new URL("prompts/discover.txt", import.meta.url), "utf-8");

async function discover(dryRun: boolean): Promise<Discovery[]> {
  const today = new Date().toISOString().slice(0, 10);

  if (dryRun) {
    console.error("DRY RUN: would call Claude API with web search tool");
    return [
      {
        url: "https://example.com/test-article",
        title: "Test: Politiskt löfte om infrastruktur",
        snippet: "Dry run test discovery",
        source_domain: "example.com",
        found_date: today,
      },
    ];
  }

  const client = createClient();
  const response = await loggedParse(client, "discover", {
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 10,
      },
    ],
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\nToday's date: ${today}`,
      },
    ],
    output_config: { format: zodOutputFormat(DiscoveryListSchema) },
  });

  if (!response.parsed_output) {
    // Likely pause_turn (server-tool iterations exhausted) or refusal — no
    // structured output to return. Log and exit with zero discoveries so the
    // workflow surfaces the issue instead of continuing on stale data.
    console.error(
      `Warning: no parsed_output from discover stage (stop_reason=${response.stop_reason})`,
    );
    return [];
  }
  return response.parsed_output.discoveries;
}

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    output: { type: "string", short: "o", default: "discoveries.json" },
  },
});

const discoveries = validateDiscoveries(await discover(values["dry-run"]!));
writeJson(values.output!, discoveries);
console.error(`Found ${discoveries.length} articles, written to ${values.output}`);
