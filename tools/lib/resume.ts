/**
 * Resumable per-item processing for long runs against the Claude API.
 *
 * A plain-text side-car file lists the keys of items already attempted.
 * It is appended to after each item, so a crash or a rate-limit wipeout
 * leaves a usable cursor and a re-run continues where it left off.
 * Tracking attempts (not just items that produced output) means items
 * that yielded nothing aren't retried either.
 *
 * `process` should save its own results incrementally (e.g. rewrite the
 * output file) before returning, so the cursor never runs ahead of the data.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { isTransientApiError } from './claude.ts';

export interface ResumeOptions<T> {
  /** Path of the side-car cursor file, e.g. `${outputPath}.processed`. */
  cursorPath: string;
  /** Stable, single-line key identifying an item (URL, document id, …). */
  key: (item: T) => string;
  process: (item: T) => Promise<void>;
}

export interface ResumeSummary {
  processed: number;
  alreadyDone: number;
  skippedTransient: number;
}

export function loadCursor(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const keys = readFileSync(path, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return new Set(keys);
}

/**
 * Run `process` on every item not already in the cursor. Transient API
 * errors (rate limit, overload, 5xx) skip the item without marking it, so
 * the next run retries it. Any other error is rethrown and aborts the run;
 * work done so far is already on disk.
 */
export async function processResumable<T>(
  items: Iterable<T>,
  { cursorPath, key, process }: ResumeOptions<T>,
): Promise<ResumeSummary> {
  const done = loadCursor(cursorPath);
  if (done.size) console.error(`Resume: ${done.size} items already attempted`);

  const summary: ResumeSummary = { processed: 0, alreadyDone: 0, skippedTransient: 0 };
  for (const item of items) {
    const k = key(item);
    if (done.has(k)) {
      summary.alreadyDone++;
      continue;
    }
    try {
      await process(item);
    } catch (err) {
      if (isTransientApiError(err)) {
        console.error(`Transient error on ${k}; skipping, will retry on next run.`);
        summary.skippedTransient++;
        continue;
      }
      throw err;
    }
    appendFileSync(cursorPath, k + '\n');
    done.add(k);
    summary.processed++;
  }
  return summary;
}
