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
  anslagByKod,
  anslagForUo,
  areas,
  revenueTree,
  totalsForYear,
  uoUtfall,
  years,
  type YearTotals,
} from '@/lib/budget/data';
import type { Anslag } from '@/schema/budget';
import { LABELS, shortNameForId, smallerLabel } from '@/lib/budget/labels';

// --- Types -------------------------------------------------------------------

export type BudgetLevel = {
  id: string;
  name: string;
  outLabel: string;
  inLabel: string;
};

export const STAT_LEVEL: BudgetLevel = {
  id: 'stat',
  name: 'Staten',
  outLabel: 'Statens utgifter',
  inLabel: 'Statens inkomster',
};

/** Path segment of the two sides. */
export type Side = 'utgifter' | 'inkomster';

export type NodeKind = 'group' | 'leaf' | 'other' | 'smaller' | 'saldo';

export type BudgetNode = {
  /** Stable across years: "uo:9", "anslag:0901011", "anslag:0501003 2024", "rev:1100", "rev:skatter". */
  id: string;
  /** Full official name. */
  name: string;
  /** Box label only. */
  shortName?: string;
  /** BASE_URL + budget/<level>/<side>/<slug>/ */
  href: string;
  /** Signed, mn kr, for the year the tree was built for. null: no value that year. */
  value: number | null;
  children?: BudgetNode[];
  kind?: NodeKind;
};

export type BuildOptions = {
  level?: BudgetLevel;
  /** Site base path with a trailing slash. Defaults to import.meta.env.BASE_URL. */
  base?: string;
};

function baseOf(opts?: BuildOptions): string {
  return (opts?.base ?? import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function yearIndex(year: number): number {
  const i = years.indexOf(year);
  if (i === -1) throw new Error(`No budget data for ${year}`);
  return i;
}

// --- Slugs and hrefs -----------------------------------------------------------

/** href of a side root or of a node below it: BASE + budget/<level>/<side>/<segments>/ */
export function hrefFor(side: Side, segments: string[] = [], opts?: BuildOptions): string {
  const level = opts?.level ?? STAT_LEVEL;
  return `${baseOf(opts)}budget/${level.id}/${side}/${segments.length ? segments.join('/') + '/' : ''}`;
}

/** href of the level's balance page. */
export function levelHref(opts?: BuildOptions): string {
  return `${baseOf(opts)}budget/${(opts?.level ?? STAT_LEVEL).id}/`;
}

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
const SKATTER_TYPER = ['1000', '7000', '8000'];

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

/** Depth-first lookup by id. */
export function findNode(root: BudgetNode, id: string): BudgetNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

/** Root-to-node chain (inclusive) for breadcrumbs, or undefined when the id is not in the tree. */
export function pathTo(root: BudgetNode, id: string): BudgetNode[] | undefined {
  if (root.id === id) return [root];
  for (const c of root.children ?? []) {
    const hit = pathTo(c, id);
    if (hit) return [root, ...hit];
  }
  return undefined;
}

// --- Signed children split and small-item grouping ------------------------------

export type SplitOptions = {
  /** Children below this share of the view are grouped. Default 1 %. */
  minShare?: number;
  /** Group only when at least this many children are small. Default 3. */
  minCount?: number;
  /** Set false to get the ungrouped boxes. Default true. */
  group?: boolean;
};

export type NodeView = {
  node: BudgetNode;
  /** Children with value > 0, largest first (ties by id), small ones merged into a "smaller" node. */
  boxes: BudgetNode[];
  /** Children with value < 0, most negative first. Drawn as the minus strip, never as area. */
  strip: BudgetNode[];
  /** Children with value 0 or null: listed in the table only. */
  table: BudgetNode[];
  /** Sum of the boxes: the percent base of the view (P3). */
  base: number;
  /** Sum of the strip (<= 0). */
  stripTotal: number;
};

const bySizeDesc = (a: BudgetNode, b: BudgetNode): number =>
  (b.value ?? 0) - (a.value ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The "Mindre poster" node for `small` children of `parent`. */
function smallerNode(parent: BudgetNode, small: BudgetNode[]): BudgetNode {
  const depth = parent.id.split(':').filter((p) => p === 'smaller').length + 1;
  return {
    id: `smaller:${parent.id}`,
    name: smallerLabel(small.length),
    href: `${parent.href.split('?')[0]}?mindre=${depth}`,
    value: round1(small.reduce((s, c) => s + (c.value ?? 0), 0)),
    children: [...small].sort(bySizeDesc),
    kind: 'smaller',
  };
}

/**
 * Split a node's children by sign (P3) and group the small positive ones (P4). The boxes plus the
 * strip add up to the node's value when all its children are present.
 */
export function splitChildren(node: BudgetNode, opts: SplitOptions = {}): NodeView {
  const { minShare = 0.01, minCount = 3, group = true } = opts;
  const kids = node.children ?? [];
  const positive = kids.filter((c) => (c.value ?? 0) > 0).sort(bySizeDesc);
  const strip = kids.filter((c) => (c.value ?? 0) < 0).sort((a, b) => a.value! - b.value!);
  const table = kids.filter((c) => !c.value);
  const base = round1(positive.reduce((s, c) => s + c.value!, 0));

  let boxes = positive;
  if (group && base > 0) {
    const small = positive.filter((c) => c.value! / base < minShare);
    if (small.length >= minCount) {
      boxes = [...positive.filter((c) => !small.includes(c)), smallerNode(node, small)];
    }
  }
  return {
    node,
    boxes,
    strip,
    table,
    base,
    stripTotal: round1(strip.reduce((s, c) => s + c.value!, 0)),
  };
}

// --- Balance view (P2) -----------------------------------------------------------

export type BalanceColumn = {
  side: Side;
  /** Boxes in the column: positive items, then "Övriga poster" if on this side, then the saldo box. */
  items: BudgetNode[];
  /** Sum of the items. Equal in both columns, so the columns are the same height at the same scale. */
  total: number;
};

export type Balance = {
  year: number;
  level: BudgetLevel;
  /** Official headline numbers, from totalsForYear. */
  totals: YearTotals;
  out: BalanceColumn;
  in: BalanceColumn;
  /** The hatched saldo box: "Underskott" in the inkomster column, "Överskott" in the utgifter column. */
  saldo: BudgetNode;
  /** "Övriga poster, netto" or null when it is exactly zero. On the side where it is positive. */
  ovriga: BudgetNode | null;
};

/**
 * Same-scale balance view. Every box is positive. Utgifter column: UO with a positive outcome.
 * Inkomster column: Skatter, netto and typ 2000-6000 (positive ones). Everything that is not a
 * positive box (nettoutlåning, kassamässig korrigering, negative UO, a non-positive revenue typ)
 * nets into "Övriga poster", placed on the side where it is positive. The saldo box fills the
 * shorter column, so both columns total the same.
 */
export function buildBalance(year: number, opts?: BuildOptions): Balance {
  const level = opts?.level ?? STAT_LEVEL;
  const totals = totalsForYear(year);
  const spending = splitChildren(buildSpendingTree(year, opts), { group: false });
  const revenue = splitChildren(buildRevenueTree(year, opts), { group: false });

  const outItems = [...spending.boxes];
  const inItems = [...revenue.boxes];

  const ovrigValue = round1(totals.utgifter - spending.base - (totals.inkomster - revenue.base));
  let ovriga: BudgetNode | null = null;
  if (ovrigValue !== 0) {
    const positive = ovrigValue > 0;
    ovriga = {
      id: 'other:ovriga',
      name: positive ? LABELS.ovrigaUtgift : LABELS.ovrigaMinskar,
      href: levelHref(opts),
      value: Math.abs(ovrigValue),
      kind: 'other',
    };
    (positive ? outItems : inItems).push(ovriga);
  }

  const deficit = totals.saldo < 0;
  const saldo: BudgetNode = {
    id: 'saldo',
    name: deficit ? LABELS.saldoUnderskott : LABELS.saldoOverskott,
    href: levelHref(opts),
    value: Math.abs(totals.saldo),
    kind: 'saldo',
  };
  if (saldo.value) (deficit ? inItems : outItems).push(saldo);

  const sum = (items: BudgetNode[]) => round1(items.reduce((s, c) => s + (c.value ?? 0), 0));
  return {
    year,
    level,
    totals,
    out: { side: 'utgifter', items: outItems, total: sum(outItems) },
    in: { side: 'inkomster', items: inItems, total: sum(inItems) },
    saldo,
    ovriga,
  };
}
