import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { legacyPromiseSchema } from "./schema/promise";

const promises = defineCollection({
  loader: glob({ pattern: "*.json", base: "src/data/promises" }),
  // v1 shape until hemsida-bzj.3 migrates the data to promiseSchema.
  schema: legacyPromiseSchema,
});

export const collections = { promises };
