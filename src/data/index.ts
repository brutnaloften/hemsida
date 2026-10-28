import type { CollectionEntry } from 'astro:content';

/** Promise as shown on the site: the v2 record plus its source's URLs and date. */
export type Promise = CollectionEntry<'promises'>['data'] & {
  sourceUrl: string;
  sourceArchive: string;
  date: string;
};
