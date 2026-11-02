import { getCollection } from 'astro:content';
import { PARTIES } from '@/schema/promise';
import { hasAgreementPoints } from '@/lib/agreement-page';
import { getTerms } from '@/lib/term-data';

/** getStaticPaths for `[term]/...` routes: one path per term record. */
export async function termPaths() {
  return (await getTerms()).map((t) => ({ params: { term: t.id } }));
}

/** getStaticPaths for `[term]/partier/[party]`: every party in every term. */
export async function termPartyPaths() {
  return (await getTerms()).flatMap((t) =>
    PARTIES.map((p) => ({ params: { term: t.id, party: p.toLowerCase() }, props: { party: p } })),
  );
}

/**
 * getStaticPaths for `[term]/overenskommelse/[agreement]`: only agreements the term record lists
 * that have a source and at least one point, so terms without agreements generate no route.
 */
export async function termAgreementPaths() {
  const sources = new Set((await getCollection('sources')).map((e) => e.data.id));
  const promises = (await getCollection('promises')).map((e) => e.data);
  return (await getTerms()).flatMap((t) => {
    const ofTerm = promises.filter((p) => p.term === t.id);
    return t.agreements
      .filter((id) => sources.has(id) && hasAgreementPoints(id, ofTerm))
      .map((id) => ({ params: { term: t.id, agreement: id } }));
  });
}
