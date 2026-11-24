import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { promiseSchema, statisticSeriesSchema, sourceSchema } from './schema/promise';
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

// Official statistics series that statistic evidence cites: src/data/<term>/statistics/*.json
const statistics = defineCollection({
  loader: glob({ pattern: '*/statistics/*.json', base: 'src/data' }),
  schema: statisticSeriesSchema,
});

export const collections = { promises, sources, terms, statistics };
