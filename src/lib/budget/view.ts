/**
 * Level-agnostic view model for the budget explorer (docs/design/budget-explorer.md P1-P4, P12).
 *
 * Builds the spending tree (UO -> anslag) and the revenue tree (Skatter, netto -> huvudgrupper ->
 * titelgrupper -> titlar, plus typ 2000-6000) for one year, splits children by sign, groups small
 * items, builds the same-scale balance view and maps node ids to URL slugs. Pure: no React, no Astro.
 *
 * Node structure does not depend on the year (ids are stable across years, F7); only `value` does.
 * Amounts are mn kr, nominal. The government level ("stat") only appears in STAT_LEVEL.
 */
import {
  meta,
  anslagByKod,
  anslagForUo,
  areas,
  revenueTree,
  totalsForYear,
  uoUtfall,
  years,
} from '@/lib/budget/data';
import type { Anslag } from '@/schema/budget';
import { LABELS, shortNameForId } from '@/lib/budget/labels';
import {
  STAT_LEVEL,
  balanceFrom,
  baseOf,
  hrefFor,
  round1,
  type Balance,
  type BudgetNode,
  type BuildOptions,
  type PageView,
  type Side,
  pathTo,
  stripChildren,
  grossBase,
} from '@/lib/budget/core';

export * from '@/lib/budget/core';

function yearIndex(year: number): number {
  const i = years.indexOf(year);
  if (i === -1) throw new Error(`No budget data for ${year}`);
  return i;
}

// --- Slugs and hrefs -----------------------------------------------------------

/**
 * URL slug of an anslag within its UO: beteckning "1:11" -> "1-11", discontinued "1:3" with code
 * suffix 2024 -> "1-3-2024". Old six-character codes have no beteckning: "020104 2008" -> "020104-2008".
 */
export function anslagSlug(a: Pick<Anslag, 'kod' | 'beteckning'>): string {
  const [code, suffix] = a.kod.split(' ');
  const stem = a.beteckning ? a.beteckning.replace(':', '-') : code.toLowerCase();
  return suffix ? `${stem}-${suffix}` : stem;
}

let slugIndex: Map<string, string> | undefined;
/** "<uo>/<slug>" -> anslag kod, for every anslag including discontinued ones. */
function anslagBySlug(): Map<string, string> {
  if (!slugIndex) {
    slugIndex = new Map();
    for (const u of areas) {
      for (const a of anslagForUo(u.nr)) {
        const key = `${u.nr}/${anslagSlug(a)}`;
        if (slugIndex.has(key)) throw new Error(`Duplicate anslag slug ${key}`);
        slugIndex.set(key, a.kod);
      }
    }
  }
  return slugIndex;
}

/** URL segments below the side root for a node id: "uo:9" -> ["9"], "rev:1140-1160" -> ["1140-1160"]. */
export function pathForId(id: string): { side: Side; segments: string[] } | undefined {
  if (id === 'root:utgifter') return { side: 'utgifter', segments: [] };
  if (id === 'root:inkomster') return { side: 'inkomster', segments: [] };
  let m = /^uo:(\d+)$/.exec(id);
  if (m) return { side: 'utgifter', segments: [m[1]] };
  m = /^anslag:(.+)$/.exec(id);
  if (m) {
    const a = anslagByKod(m[1]);
    return a ? { side: 'utgifter', segments: [String(a.uo), anslagSlug(a)] } : undefined;
  }
  m = /^rev:(.+)$/.exec(id);
  if (m) return { side: 'inkomster', segments: [m[1]] };
  return undefined;
}

/** Inverse of pathForId. Returns undefined for paths that do not name an existing node. */
export function idForPath(side: Side, segments: string[]): string | undefined {
  if (side === 'utgifter') {
    if (segments.length === 1 && /^\d+$/.test(segments[0])) {
      const nr = Number(segments[0]);
      return areas.some((u) => u.nr === nr) ? `uo:${nr}` : undefined;
    }
    if (segments.length === 2) {
      const kod = anslagBySlug().get(`${segments[0]}/${segments[1]}`);
      return kod ? `anslag:${kod}` : undefined;
    }
    return undefined;
  }
  if (segments.length === 1) {
    const id = `rev:${segments[0]}`;
    return revenueIds().has(id) ? id : undefined;
  }
  return undefined;
}

function hrefForId(id: string, opts?: BuildOptions): string {
  const p = pathForId(id);
  if (!p) throw new Error(`No path for ${id}`);
  return hrefFor(p.side, p.segments, opts);
}

// --- Trees ---------------------------------------------------------------------

/**
 * Spending tree: root "Statens utgifter" with the 27 UO as children and the anslag (active and
 * discontinued) below them. The root value is the sum of UO 1-27 only; Riksgäldskontorets
 * nettoutlåning and the kassamässig korrigering are not nodes, they enter the balance view as
 * "Övriga poster" (see buildBalance).
 */
export function buildSpendingTree(year: number, opts?: BuildOptions): BudgetNode {
  return memoized(spendingMemo, year, opts, () => computeSpendingTree(year, opts));
}

/**
 * Trees with default options are built once per year: every static page of the explorer asks for them,
 * and building one walks all 814 anslag. Callers must not mutate the result.
 */
function memoized<T>(
  memo: Map<number, T>,
  year: number,
  opts: BuildOptions | undefined,
  build: () => T,
): T {
  if (opts) return build();
  let hit = memo.get(year);
  if (!hit) memo.set(year, (hit = build()));
  return hit;
}
const spendingMemo = new Map<number, BudgetNode>();
const revenueMemo = new Map<number, BudgetNode>();
const balanceMemo = new Map<number, Balance>();

function computeSpendingTree(year: number, opts?: BuildOptions): BudgetNode {
  const level = opts?.level ?? STAT_LEVEL;
  const i = yearIndex(year);
  const uoNodes = areas.map((u): BudgetNode => {
    const id = `uo:${u.nr}`;
    const children = anslagForUo(u.nr).map((a): BudgetNode => ({
      id: `anslag:${a.kod}`,
      name: a.namn,
      href: hrefForId(`anslag:${a.kod}`, opts),
      value: a.utfall[i],
      kind: 'leaf',
    }));
    return {
      id,
      name: u.namn,
      shortName: shortNameForId(id),
      href: hrefForId(id, opts),
      value: uoUtfall(u.nr, year),
      children,
      kind: 'group',
    };
  });
  return {
    id: 'root:utgifter',
    name: level.outLabel,
    href: hrefFor('utgifter', [], opts),
    value: round1(uoNodes.reduce((s, u) => s + (u.value ?? 0), 0)),
    children: uoNodes,
    kind: 'group',
  };
}

/** Typ whose sum is netted into "Skatter, netto": skatter, avräkningar and krediteringar på skattekonto. */
export const SKATTER_TYPER = ['1000', '7000', '8000'];

type RevNode = ReturnType<typeof revenueTree>[number];

function revNode(n: RevNode, i: number, opts?: BuildOptions): BudgetNode {
  const id = `rev:${n.kod}`;
  const children = n.children.map((c) => revNode(c, i, opts));
  return {
    id,
    name: n.namn,
    href: hrefForId(id, opts),
    value: round1(n.utfall[i]),
    ...(children.length ? { children, kind: 'group' as const } : { kind: 'leaf' as const }),
  };
}

/**
 * Revenue tree: root "Statens inkomster" with "Skatter, netto" (typ 1000 + 7000 + 8000, whose
 * huvudgrupper are its children) and the typ 2000-6000 as direct children, each going
 * huvudgrupp -> titelgrupp -> titel. The root value is the sum of all titlar, so it equals
 * totalsForYear().inkomster.
 */
export function buildRevenueTree(year: number, opts?: BuildOptions): BudgetNode {
  return memoized(revenueMemo, year, opts, () => computeRevenueTree(year, opts));
}

function computeRevenueTree(year: number, opts?: BuildOptions): BudgetNode {
  const level = opts?.level ?? STAT_LEVEL;
  const i = yearIndex(year);
  const typer = revenueTree();
  const netted = typer.filter((t) => SKATTER_TYPER.includes(t.kod));
  const skatter: BudgetNode = {
    id: 'rev:skatter',
    name: LABELS.skatterNetto,
    href: hrefForId('rev:skatter', opts),
    value: round1(netted.reduce((s, t) => s + t.utfall[i], 0)),
    children: netted.flatMap((t) => t.children.map((h) => revNode(h, i, opts))),
    kind: 'group',
  };
  const rest = typer.filter((t) => !SKATTER_TYPER.includes(t.kod)).map((t) => revNode(t, i, opts));
  const children = [skatter, ...rest];
  return {
    id: 'root:inkomster',
    name: level.inLabel,
    href: hrefFor('inkomster', [], opts),
    value: round1(children.reduce((s, c) => s + (c.value ?? 0), 0)),
    children,
    kind: 'group',
  };
}

let revenueIdCache: Set<string> | undefined;
function revenueIds(): Set<string> {
  if (!revenueIdCache) {
    revenueIdCache = new Set();
    const walk = (n: BudgetNode) => {
      revenueIdCache!.add(n.id);
      n.children?.forEach(walk);
    };
    walk(buildRevenueTree(years[years.length - 1], { base: '/' }));
  }
  return revenueIdCache;
}

/** Year selector options; revenue and spending are preliminary independently of each other. */
export function yearOptions(): {
  year: number;
  revenuePreliminary: boolean;
  spendingPreliminary: boolean;
}[] {
  return years.map((year) => ({
    year,
    revenuePreliminary: meta.yearStatus.revenue[String(year)] !== 'final',
    spendingPreliminary: meta.yearStatus.expenditure[String(year)] !== 'final',
  }));
}

/**
 * Island props for a static drill or leaf page of `year`: the chain root -> node. Ancestors lose their
 * subtrees. Throws on an unknown id.
 */
export function buildPageView(year: number, nodeId: string, opts?: BuildOptions): PageView {
  const p = pathForId(nodeId);
  if (!p) throw new Error(`No page for ${nodeId}`);
  const root = p.side === 'utgifter' ? buildSpendingTree(year, opts) : buildRevenueTree(year, opts);
  const chain = pathTo(root, nodeId);
  if (!chain) throw new Error(`${nodeId} is not in the ${p.side} tree`);
  const totals = totalsForYear(year);
  return {
    nodeId,
    side: p.side,
    chain: chain.map((n, i) =>
      i === chain.length - 1 ? n : { ...stripChildren(n), childBase: grossBase(n) },
    ),
    sideTotal: p.side === 'utgifter' ? totals.utgifter : totals.inkomster,
  };
}

/** Same-scale balance view of one year from the committed data (see balanceFrom). */
export function buildBalance(year: number, opts?: BuildOptions): Balance {
  return memoized(balanceMemo, year, opts, () =>
    balanceFrom(
      year,
      totalsForYear(year),
      buildSpendingTree(year, opts),
      buildRevenueTree(year, opts),
      opts,
    ),
  );
}
