import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { legacyPromiseSchema, sourceSchema } from './schema/promise';

// One directory per term: src/data/<term>/promises/*.json
const promises = defineCollection({
  loader: glob({ pattern: '*/promises/*.json', base: 'src/data' }),
  // v1 shape until hemsida-bzj.5 migrates the remaining files to promiseSchema.
  schema: legacyPromiseSchema,
});

// Origin documents that promises cite: src/data/sources/*.json
const sources = defineCollection({
  loader: glob({ pattern: '*.json', base: 'src/data/sources' }),
  schema: sourceSchema,
});

export const collections = { promises, sources };
