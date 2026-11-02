import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { promiseSchema, sourceSchema } from './schema/promise';
import { termSchema } from './schema/term';

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

// Term records (government, support, opposition, agreements): src/data/<term>/term.json
const terms = defineCollection({
  loader: glob({ pattern: '*/term.json', base: 'src/data' }),
  schema: termSchema,
});

export const collections = { promises, sources, terms };
