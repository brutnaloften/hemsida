import { PARTIES } from '@/schema/promise';
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
