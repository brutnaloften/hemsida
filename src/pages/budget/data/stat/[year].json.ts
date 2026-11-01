import type { APIRoute, GetStaticPaths } from 'astro';
import { totalsForYear, years } from '@/lib/budget/data';
import { buildRevenueTree, buildSpendingTree } from '@/lib/budget/view';
import { flattenTrees, type YearFile } from '@/lib/budget/tree';

export const getStaticPaths: GetStaticPaths = () =>
  years.map((year) => ({ params: { year: String(year) } }));

/** Values of every node of the government level for one year, in the order of names.json. */
export const GET: APIRoute = ({ params }) => {
  const year = Number(params.year);
  const { values } = flattenTrees(buildSpendingTree(year), buildRevenueTree(year));
  const body: YearFile = { year, totals: totalsForYear(year), values };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
