/** Content-addressed result cache (hemsida-vzn): one JSON file per request key, written atomically. */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeJsonAtomic } from '../json.ts';

export interface CacheEntry {
  answers: Record<string, number>;
  input_tokens: number;
  /** API calls it took (more than 1 when the state had to be split). */
  api_requests: number;
}
export interface ResultCache {
  has(key: string): boolean;
  get(key: string): CacheEntry | undefined;
  put(key: string, entry: CacheEntry): void;
}

export function createFileCache(dir: string): ResultCache {
  mkdirSync(dir, { recursive: true });
  const path = (key: string) => {
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error(`bad cache key: ${key}`);
    return resolve(dir, `${key}.json`);
  };
  return {
    has: (key) => existsSync(path(key)),
    get: (key) => (existsSync(path(key)) ? JSON.parse(readFileSync(path(key), 'utf8')) : undefined),
    put: (key, entry) => writeJsonAtomic(path(key), entry),
  };
}

export function createMemoryCache(): ResultCache & { size(): number } {
  const m = new Map<string, CacheEntry>();
  return {
    has: (k) => m.has(k),
    get: (k) => m.get(k),
    put: (k, e) => void m.set(k, e),
    size: () => m.size,
  };
}
