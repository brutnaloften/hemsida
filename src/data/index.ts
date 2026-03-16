import type { CollectionEntry } from "astro:content";

export type Promise = CollectionEntry<"promises">["data"];
