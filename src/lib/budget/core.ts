/**
 * Pure core of the budget view model: node types, hrefs, the sign split with small-item grouping
 * and the same-scale balance assembly. No data imports at runtime, so the browser island can use
 * it without shipping the committed JSON (docs/design/budget-explorer.md P1-P4, P14).
 * view.ts re-exports everything here and adds the data-backed tree builders.
 */
import type { YearTotals } from '@/lib/budget/data';
import { LABELS, smallerLabel } from '@/lib/budget/labels';

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
  /** Set on a parent stripped of its children: the positive children's sum (see grossBase). */
  childBase?: number;
};

export type BuildOptions = {
  level?: BudgetLevel;
  /** Site base path with a trailing slash. Defaults to import.meta.env.BASE_URL. */
  base?: string;
};

export function baseOf(opts?: BuildOptions): string {
  return (opts?.base ?? import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;

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
 * The base the shares of a node's children are taken of: the sum of its positive children, the same
 * number the treemap boxes add up to (P3). For a node with a net value (a UO whose anslag include
 * negative ones) this differs from `value`. Falls back to `value` when the children are unknown.
 */
export function grossBase(n: BudgetNode): number {
  if (n.children) return splitChildren(n).base;
  return n.childBase ?? n.value ?? 0;
}

/**
 * Meta description of a node's page for a year. Shared by the static page and the island, which
 * rewrites it when the view climbs to another node.
 */
export function describeNode(
  node: BudgetNode,
  year: number,
  side: Side,
  present: boolean,
  amountWords: string,
): string {
  const sideLabel = side === 'utgifter' ? 'statens utgifter' : 'statens inkomster';
  return present
    ? `${node.name}: ${amountWords} ${year}, enligt utfallet från Ekonomistyrningsverket.`
    : `${node.name} i ${sideLabel}, utfall per år från Ekonomistyrningsverket.`;
}

/**
 * Explains why a side root's total differs from the base its children's shares are taken of
 * (spending: the UO sum 1 402,3 vs statens utgifter 1 405,8). Undefined when they agree.
 */
export function sideGap(
  side: Side,
  rootValue: number,
  sideTotal: number,
): { gap: number; text: string } | undefined {
  const gap = round1(sideTotal - rootValue);
  if (gap === 0) return undefined;
  return {
    gap,
    text:
      side === 'utgifter'
        ? 'Procenten på de följande sidorna räknas av statens totala utgifter, som även omfattar övriga poster: Riksgäldskontorets nettoutlåning och en kassamässig korrigering.'
        : 'Procenten på de följande sidorna räknas av statens totala inkomster, som även omfattar övriga poster som inte ingår i rutorna.',
  };
}

/** A node without its subtree. */
export function stripChildren(n: BudgetNode): BudgetNode {
  const { children: _children, ...rest } = n;
  return rest;
}

/**
 * What a statically rendered drill or leaf page hands to the island: the chain from the side root to
 * the page's node (only the last one keeps its children) and the side total for the "av statens ..." share.
 */
export type PageView = {
  nodeId: string;
  side: Side;
  chain: BudgetNode[];
  sideTotal: number;
};

/** Discontinued anslag carry their last year as a code suffix: "anslag:0107002 2024" -> 2024. */
export function discontinuedAfter(id: string): number | null {
  const m = /^anslag:\S+ (\d{4})$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** False when the node has no value in `year` or the anslag had already been discontinued. */
export function existsIn(node: BudgetNode, year: number): boolean {
  if (node.value === null) return false;
  const last = discontinuedAfter(node.id);
  return last === null || year <= last;
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
export function balanceFrom(
  year: number,
  totals: YearTotals,
  spendingRoot: BudgetNode,
  revenueRoot: BudgetNode,
  opts?: BuildOptions,
): Balance {
  const level = opts?.level ?? STAT_LEVEL;
  const spending = splitChildren(spendingRoot, { group: false });
  const revenue = splitChildren(revenueRoot, { group: false });

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

/**
 * The balance view without the subtrees below its boxes: all the island needs to draw it. The
 * subtrees (every anslag) would otherwise be serialised into the page as island props.
 */
export function withoutChildren(balance: Balance): Balance {
  const slim = stripChildren;
  const column = (c: BalanceColumn): BalanceColumn => ({ ...c, items: c.items.map(slim) });
  return {
    ...balance,
    out: column(balance.out),
    in: column(balance.in),
    saldo: slim(balance.saldo),
    ovriga: balance.ovriga && slim(balance.ovriga),
  };
}
