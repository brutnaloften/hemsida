import { defineCollection } from "astro:content";
import { z } from "zod";
import { glob } from "astro/loaders";

const source = z.object({
  value: z.string(),
  archive: z.string(),
  broken: z.boolean().optional(),
});

const promises = defineCollection({
  loader: glob({ pattern: "*.json", base: "src/data/promises" }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    party: z.string(),
    status: z.string(),
    date: z.string(),
    sources: z.array(source),
    tags: z.array(z.string()),
    updates: z
      .array(
        z.object({
          date: z.string(),
          status: z.string(),
          reasoning: z.string(),
          sources: z.array(source),
          confidence: z.enum(["high", "medium"]).optional(),
        }),
      )
      .default([]),
  }),
});

export const collections = { promises };
