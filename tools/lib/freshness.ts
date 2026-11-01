/**
 * Freshness manifest: one entry per ingested dataset in `src/data/freshness.json`, written by the
 * ingest tools. `tools/check-freshness.ts` (hemsida-8a2.2) compares it against release calendars.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod/v4';
import { formatIssues, writeJson } from './json.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const freshnessEntrySchema = z.strictObject({
  /** URL of the upstream source the data was fetched from. */
  source: z.url(),
  /** Date (YYYY-MM-DD) of the fetch. */
  fetchedAt: isoDate,
  /** Latest period the data covers: a year ("2025"), a month ("2026-09") or a date. */
  latestPeriod: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/),
});
export type FreshnessEntry = z.infer<typeof freshnessEntrySchema>;

export const freshnessManifestSchema = z.strictObject({
  datasets: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]*$/), freshnessEntrySchema),
});
export type FreshnessManifest = z.infer<typeof freshnessManifestSchema>;

export function defaultManifestPath(root: string): string {
  return resolve(root, 'src/data/freshness.json');
}

/** Missing file is an empty manifest; an invalid one throws (fail loudly, never overwrite). */
export function loadManifest(path: string): FreshnessManifest {
  if (!existsSync(path)) return { datasets: {} };
  const parsed = freshnessManifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')));
  if (!parsed.success) {
    throw new Error(`Invalid freshness manifest ${path}: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

/** Pure: returns a new manifest with `id` set, datasets sorted by id for stable diffs. */
export function withEntry(
  manifest: FreshnessManifest,
  id: string,
  entry: FreshnessEntry,
): FreshnessManifest {
  const datasets = { ...manifest.datasets, [id]: entry };
  const sorted = Object.fromEntries(
    Object.entries(datasets).sort(([a], [b]) => a.localeCompare(b)),
  );
  return freshnessManifestSchema.parse({ datasets: sorted });
}

export function recordFreshness(path: string, id: string, entry: FreshnessEntry): void {
  writeJson(path, withEntry(loadManifest(path), id, entry));
}
