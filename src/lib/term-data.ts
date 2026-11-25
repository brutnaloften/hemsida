import { getCollection } from 'astro:content';
import { isTermComplete, verdictCounts } from '@/lib/party-stats';
import { defaultTerm, sortTerms, termOfFilePath, type TermInfo } from '@/lib/terms';
import type { VERDICTS } from '@/schema/promise';
import type { Term } from '@/schema/term';

type VerdictValue = (typeof VERDICTS)[number];

/** All term records, oldest first, with their promise counts and completeness. */
export async function getTerms(): Promise<(Term & TermInfo)[]> {
  const byTerm = new Map<string, { verdict: { value: VerdictValue } }[]>();
  for (const e of await getCollection('promises')) {
    const t = termOfFilePath(e.filePath ?? '');
    if (t) byTerm.set(t, [...(byTerm.get(t) ?? []), e.data]);
  }
  return sortTerms((await getCollection('terms')).map((e) => e.data)).map((t) => ({
    ...t,
    promiseCount: byTerm.get(t.id)?.length ?? 0,
    complete: isTermComplete(verdictCounts(byTerm.get(t.id) ?? [])),
  }));
}

/** Latest term with data. */
export async function getDefaultTerm(): Promise<string> {
  return defaultTerm(await getTerms());
}
