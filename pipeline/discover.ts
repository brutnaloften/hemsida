/**
 * Step 1: Discover recent Swedish political news articles using Claude web search.
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { type Discovery, validateDiscoveries, writeJson } from "./schemas.ts";

const PROMPT = readFileSync(new URL("prompts/discover.txt", import.meta.url), "utf-8");

function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]") + 1;
  if (start === -1 || end <= start) return [];
  return JSON.parse(text.slice(start, end));
}

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

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 10,
      } as any,
    ],
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\nToday's date: ${today}`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      return validateDiscoveries(parseJsonArray(block.text));
    }
  }

  console.error("Warning: no discoveries found in response");
  return [];
}

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    output: { type: "string", short: "o", default: "discoveries.json" },
  },
});

const discoveries = await discover(values["dry-run"]!);
writeJson(values.output!, discoveries);
console.error(`Found ${discoveries.length} articles, written to ${values.output}`);
