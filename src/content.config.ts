import { defineCollection } from "astro:content";
import { z } from "zod";
import { file } from "astro/loaders";

const promises = defineCollection({
  loader: file("src/data/promises.json"),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    party: z.string(),
    status: z.string(),
    date: z.string(),
    sources: z.array(
      z.object({ value: z.string(), archive: z.string(), broken: z.boolean().optional() }),
    ),
    tags: z.array(z.string()),
  }),
});

export const collections = { promises };
