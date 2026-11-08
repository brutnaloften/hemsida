/**
 * Deterministic document sharding for scoring runs: several people (or accounts) each score a disjoint
 * slice of the corpus and merge via score-cache deltas. A document's shard depends only on its id.
 */
import { createHash } from 'node:crypto';

export interface Shard {
  /** 1-based shard number, 1..count. */
  index: number;
  count: number;
}

/** Parse `i/n` (1 <= i <= n). */
export function parseShard(spec: string): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(spec);
  const index = m ? Number(m[1]) : NaN;
  const count = m ? Number(m[2]) : NaN;
  if (!m || count < 1 || index < 1 || index > count)
    throw new Error(`--shard must look like i/n with 1 <= i <= n, got "${spec}"`);
  return { index, count };
}

/** 0-based shard of a document id: first 6 bytes of sha256 (as a number) mod n. */
export function shardOf(documentId: string, count: number): number {
  const digest = createHash('sha256').update(documentId).digest();
  return digest.readUIntBE(0, 6) % count;
}

export function inShard(documentId: string, shard: Shard): boolean {
  return shardOf(documentId, shard.count) === shard.index - 1;
}
