import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { promiseSchema, sourceSchema } from './schema/promise';

// One directory per term: src/data/<term>/promises/*.json
const promises = defineCollection({
  loader: glob({ pattern: '*/promises/*.json', base: 'src/data' }),
  schema: promiseSchema,
});

// Origin documents that promises cite: src/data/sources/*.json
const sources = defineCollection({
  loader: glob({ pattern: '*.json', base: 'src/data/sources' }),
  schema: sourceSchema,
});

export const collections = { promises, sources };
