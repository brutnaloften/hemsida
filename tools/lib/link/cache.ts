/** Content-addressed judgement cache (hemsida-4np.5): one JSON file per request key, written atomically. */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from '../json.ts';
import { judgementSchema, type Judgement } from './judge.ts';

export interface LinkCacheEntry {
  judgement: Judgement;
  input_tokens: number;
}
export interface LinkCache {
  has(key: string): boolean;
  get(key: string): LinkCacheEntry | undefined;
  put(key: string, entry: LinkCacheEntry): void;
}

const entrySchema = z.strictObject({ judgement: judgementSchema, input_tokens: z.number() });

export function createFileCache(dir: string): LinkCache {
  mkdirSync(dir, { recursive: true });
  const path = (key: string) => {
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error(`bad cache key: ${key}`);
    return resolve(dir, `${key}.json`);
  };
  return {
    has: (key) => existsSync(path(key)),
    get: (key) =>
      existsSync(path(key))
        ? entrySchema.parse(JSON.parse(readFileSync(path(key), 'utf8')))
        : undefined,
    put: (key, entry) => writeJsonAtomic(path(key), entry),
  };
}

export function createMemoryCache(): LinkCache & { size(): number } {
  const m = new Map<string, LinkCacheEntry>();
  return {
    has: (k) => m.has(k),
    get: (k) => m.get(k),
    put: (k, e) => void m.set(k, e),
    size: () => m.size,
  };
}
