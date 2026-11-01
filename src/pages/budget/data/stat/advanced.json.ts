import type { APIRoute } from 'astro';
import { buildAdvancedFile } from '@/lib/budget/advanced-data';

/** Series, budget, codes, KPI and GDP for advanced mode; fetched only when the switch is on. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildAdvancedFile()), {
    headers: { 'Content-Type': 'application/json' },
  });
