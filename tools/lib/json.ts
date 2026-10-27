/**
 * JSON file I/O and Zod validation helpers.
 *
 * Pattern: each data shape is one Zod schema, and its runtime check,
 * TypeScript type (`z.infer`) and the JSON schema sent to the API
 * (`zodOutputFormat(schema)`) are all derived from it. Keeping three
 * hand-maintained lists in sync drifted in the old pipeline and silently
 * dropped items whose field names had been paraphrased.
 *
 * Array responses: the Anthropic API requires structured-output schemas to be
 * objects at the top level, so wrap list payloads in an object with a single
 * array property (e.g. `{ candidates: [...] }`).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { z } from 'zod/v4';

/**
 * Validate each item of an array loaded from disk. Invalid items are logged
 * and dropped (not thrown), so one bad record doesn't abort a whole run.
 *
 * For data coming from the API, `client.messages.parse()` already validates
 * against the schema — this is only for file I/O.
 */
export function validateArray<T>(schema: z.ZodType<T>, data: unknown[], label: string): T[] {
  const validated: T[] = [];
  for (const [i, item] of data.entries()) {
    const result = schema.safeParse(item);
    if (!result.success) {
      console.error(`Warning: ${label}[${i}] invalid (${formatIssues(result.error)}), skipping`);
      continue;
    }
    validated.push(result.data);
  }
  return validated;
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((e) => e.path.join('.') + ': ' + e.message).join('; ');
}

export function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
