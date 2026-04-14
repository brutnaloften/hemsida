/**
 * JSON schemas and validation for pipeline data.
 */

import { readFileSync, writeFileSync } from "node:fs";

// --- Type definitions ---

export interface Discovery {
  url: string;
  title: string;
  snippet: string;
  source_domain: string;
  found_date: string;
}

export interface Extraction {
  politician_or_party: string;
  promise_text: string;
  direct_quote: string | null;
  date: string;
  source_url: string;
  confidence: "high" | "medium" | "low";
}

export interface Match {
  type: "new" | "update";
  existing_promise_id: string | null;
  extracted_index: number;
  reasoning: string;
}

export interface Update {
  promise_id: string;
  new_status: string;
  reasoning: string;
  sources: string[];
  confidence: "high" | "medium";
}

export interface PromiseSource {
  value: string;
  archive: string;
  broken?: boolean;
}

export interface Promise {
  id: string;
  name: string;
  description: string;
  party: string;
  status: string;
  date: string;
  sources: PromiseSource[];
  tags: string[];
}

// --- Validation ---

const DISCOVERY_FIELDS = ["url", "title", "snippet", "source_domain", "found_date"];
const EXTRACTION_FIELDS = ["politician_or_party", "promise_text", "direct_quote", "date", "source_url", "confidence"];
const MATCH_FIELDS = ["type", "existing_promise_id", "extracted_index", "reasoning"];
const UPDATE_FIELDS = ["promise_id", "new_status", "reasoning", "sources", "confidence"];
const PROMISE_FIELDS = ["id", "name", "description", "party", "status", "date", "sources", "tags"];

function hasFields(obj: Record<string, unknown>, fields: string[]): string[] {
  return fields.filter((f) => !(f in obj));
}

export function validateDiscoveries(data: unknown[]): Discovery[] {
  const validated: Discovery[] = [];
  for (const item of data) {
    const missing = hasFields(item as Record<string, unknown>, DISCOVERY_FIELDS);
    if (missing.length) {
      console.error(`Warning: discovery missing fields [${missing}], skipping`);
      continue;
    }
    validated.push(item as Discovery);
  }
  return validated;
}

export function validateExtractions(data: unknown[]): Extraction[] {
  const validated: Extraction[] = [];
  for (const item of data) {
    const obj = item as Record<string, unknown>;
    const missing = hasFields(obj, EXTRACTION_FIELDS);
    if (missing.length) {
      console.error(`Warning: extraction missing fields [${missing}], skipping`);
      continue;
    }
    if (!["high", "medium", "low"].includes(obj.confidence as string)) {
      console.error(`Warning: invalid confidence '${obj.confidence}', skipping`);
      continue;
    }
    validated.push(item as Extraction);
  }
  return validated;
}

export function validateMatches(data: unknown[]): Match[] {
  const validated: Match[] = [];
  for (const item of data) {
    const obj = item as Record<string, unknown>;
    const missing = hasFields(obj, MATCH_FIELDS);
    if (missing.length) {
      console.error(`Warning: match missing fields [${missing}], skipping`);
      continue;
    }
    if (!["new", "update"].includes(obj.type as string)) {
      console.error(`Warning: invalid match type '${obj.type}', skipping`);
      continue;
    }
    validated.push(item as Match);
  }
  return validated;
}

export function validateUpdates(data: unknown[]): Update[] {
  const validated: Update[] = [];
  for (const item of data) {
    const obj = item as Record<string, unknown>;
    const missing = hasFields(obj, UPDATE_FIELDS);
    if (missing.length) {
      console.error(`Warning: update missing fields [${missing}], skipping`);
      continue;
    }
    if (!["high", "medium"].includes(obj.confidence as string)) {
      console.error(`Warning: update confidence '${obj.confidence}' too low, skipping`);
      continue;
    }
    validated.push(item as Update);
  }
  return validated;
}

export function validatePromise(data: unknown): data is Promise {
  const obj = data as Record<string, unknown>;
  const missing = hasFields(obj, PROMISE_FIELDS);
  if (missing.length) {
    console.error(`Warning: promise missing fields [${missing}]`);
    return false;
  }
  return true;
}

// --- I/O helpers ---

export function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}
