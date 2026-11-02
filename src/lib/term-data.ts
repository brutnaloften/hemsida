import { getCollection } from 'astro:content';
import { defaultTerm, sortTerms, termOfFilePath, type TermInfo } from '@/lib/terms';
import type { Term } from '@/schema/term';

/** All term records, oldest first, with their promise counts. */
export async function getTerms(): Promise<(Term & TermInfo)[]> {
  const counts = new Map<string, number>();
  for (const e of await getCollection('promises')) {
    const t = termOfFilePath(e.filePath ?? '');
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return sortTerms((await getCollection('terms')).map((e) => e.data)).map((t) => ({
    ...t,
    promiseCount: counts.get(t.id) ?? 0,
  }));
}

/** Latest term with data. */
export async function getDefaultTerm(): Promise<string> {
  return defaultTerm(await getTerms());
}
