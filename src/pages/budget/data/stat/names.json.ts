import type { APIRoute } from 'astro';
import { latestYear } from '@/lib/budget/data';
import { buildRevenueTree, buildSpendingTree } from '@/lib/budget/view';
import { flattenTrees } from '@/lib/budget/tree';

/** Names, hierarchy and paths of every node of the government level; the same for all years. */
export const GET: APIRoute = () => {
  const { names } = flattenTrees(buildSpendingTree(latestYear), buildRevenueTree(latestYear));
  return new Response(JSON.stringify(names), {
    headers: { 'Content-Type': 'application/json' },
  });
};
