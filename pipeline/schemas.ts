/**
 * Zod schemas for pipeline data — single source of truth for the shapes that
 * flow between stages and between the pipeline and Claude.
 *
 * Runtime shape, TypeScript type, and the JSON schema sent to the API are all
 * derived from one schema object. Previously these were three separate
 * hand-maintained lists that drifted apart and silently dropped items whose
 * field names had paraphrased (e.g. `party` → `political_party`).
 *
 * Array responses: the Anthropic API requires structured-output schemas to be
 * objects at the top level, so each list payload is wrapped in an object with
 * a single array property (e.g. `{ extractions: [...] }`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";

// --- Stage I/O schemas ---------------------------------------------------

export const DiscoverySchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  source_domain: z.string(),
  found_date: z.string(),
});
export type Discovery = z.infer<typeof DiscoverySchema>;

export const DiscoveryListSchema = z.object({
  discoveries: z.array(DiscoverySchema),
});

export const ExtractionSchema = z.object({
  politician_or_party: z.string(),
  promise_text: z.string(),
  direct_quote: z.string().nullable(),
  date: z.string(),
  source_url: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const ExtractionListSchema = z.object({
  extractions: z.array(ExtractionSchema),
});

export const MatchSchema = z.object({
  type: z.enum(["new", "update"]),
  existing_promise_id: z.string().nullable(),
  extracted_index: z.number().int(),
  reasoning: z.string(),
});
export type Match = z.infer<typeof MatchSchema>;

export const MatchListSchema = z.object({
  matches: z.array(MatchSchema),
});

export const UpdateSchema = z.object({
  promise_id: z.string(),
  new_status: z.string(),
  reasoning: z.string(),
  sources: z.array(z.string()),
  confidence: z.enum(["high", "medium"]),
});
export type Update = z.infer<typeof UpdateSchema>;

export const UpdateListSchema = z.object({
  updates: z.array(UpdateSchema),
});

// --- On-disk promise shape (mirrors src/content.config.ts) --------------

const PromiseSourceSchema = z.object({
  value: z.string(),
  archive: z.string(),
  broken: z.boolean().optional(),
});
export type PromiseSource = z.infer<typeof PromiseSourceSchema>;

const PromiseUpdateSchema = z.object({
  date: z.string(),
  status: z.string(),
  reasoning: z.string(),
  sources: z.array(PromiseSourceSchema),
  confidence: z.enum(["high", "medium"]).optional(),
});
export type PromiseUpdate = z.infer<typeof PromiseUpdateSchema>;

export const PromiseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  party: z.string(),
  status: z.string(),
  date: z.string(),
  sources: z.array(PromiseSourceSchema),
  tags: z.array(z.string()),
  updates: z.array(PromiseUpdateSchema).default([]),
});
export type Promise = z.infer<typeof PromiseSchema>;

// --- Per-item validators ------------------------------------------------
//
// Used for data loaded from disk (resume state, matches.json, extracted.json).
// For data coming from the API, `client.messages.parse()` already validates
// against the schema — these helpers only exist for file I/O.
//
// Semantics: invalid items are logged and dropped (not thrown). This preserves
// the prior skip-and-warn behavior that the rest of the pipeline assumes.

function validateArray<T>(schema: z.ZodType<T>, data: unknown[], label: string): T[] {
  const validated: T[] = [];
  for (const [i, item] of data.entries()) {
    const result = schema.safeParse(item);
    if (!result.success) {
      console.error(
        `Warning: ${label}[${i}] invalid (${result.error.issues.map((e) => e.path.join(".") + ": " + e.message).join("; ")}), skipping`,
      );
      continue;
    }
    validated.push(result.data);
  }
  return validated;
}

export function validateDiscoveries(data: unknown[]): Discovery[] {
  return validateArray(DiscoverySchema, data, "discovery");
}
export function validateExtractions(data: unknown[]): Extraction[] {
  return validateArray(ExtractionSchema, data, "extraction");
}
export function validateMatches(data: unknown[]): Match[] {
  return validateArray(MatchSchema, data, "match");
}
export function validateUpdates(data: unknown[]): Update[] {
  return validateArray(UpdateSchema, data, "update");
}

export function validatePromise(data: unknown): data is Promise {
  const result = PromiseSchema.safeParse(data);
  if (!result.success) {
    console.error(
      `Warning: promise invalid (${result.error.issues.map((e) => e.path.join(".") + ": " + e.message).join("; ")})`,
    );
    return false;
  }
  return true;
}

// --- I/O helpers --------------------------------------------------------

export function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}
