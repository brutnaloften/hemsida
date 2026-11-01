import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { BalanceView } from '@/components/budget/BalanceView';
import type { Crumb } from '@/components/budget/Breadcrumbs';
import { DrillView } from '@/components/budget/DrillView';
import type { Openable } from '@/components/budget/types';
import type { YearOption } from '@/components/budget/YearSelect';
import {
  balanceFrom,
  baseOf,
  levelHref,
  pathTo,
  splitChildren,
  type Balance,
  type BudgetNode,
} from '@/lib/budget/core';
import { treesFromFiles, type NamesFile, type YearFile } from '@/lib/budget/tree';

type View = { year: number; nodeId: string | null; mindre: number };
type Trees = ReturnType<typeof treesFromFiles> & { totals: YearFile['totals'] };

const BASE = baseOf();
const BUDGET = `${BASE}budget/`;
const DATA = `${BUDGET}data/stat/`;

// --- Lazy data: names.json once, one small file per year (P1, P14) -----------------------------

let namesPromise: Promise<NamesFile> | undefined;
const yearPromises = new Map<number, Promise<YearFile>>();
const treesCache = new Map<number, Trees>();
let namesLoaded: NamesFile | undefined;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

function cached<T>(promise: Promise<T> | undefined, load: () => Promise<T>): Promise<T> {
  return promise ?? load();
}

async function ensure(year: number): Promise<Trees> {
  namesPromise = cached(namesPromise, () =>
    getJson<NamesFile>(`${DATA}names.json`).catch((e) => {
      namesPromise = undefined;
      throw e;
    }),
  );
  let yearPromise = yearPromises.get(year);
  if (!yearPromise) {
    yearPromise = getJson<YearFile>(`${DATA}${year}.json`).catch((e) => {
      yearPromises.delete(year);
      throw e;
    });
    yearPromises.set(year, yearPromise);
  }
  const [names, file] = await Promise.all([namesPromise, yearPromise]);
  namesLoaded = names;
  let trees = treesCache.get(year);
  if (!trees) {
    trees = { ...treesFromFiles(names, file), totals: file.totals };
    treesCache.set(year, trees);
  }
  return trees;
}

// --- Helpers -------------------------------------------------------------------------------------

const sideOf = (id: string): 'utgifter' | 'inkomster' =>
  /^(uo:|anslag:|root:utgifter)/.test(id) ? 'utgifter' : 'inkomster';

/** Walk `mindre` levels into "Mindre poster" below `node`. */
function resolveMindre(node: BudgetNode, mindre: number): BudgetNode {
  let current = node;
  for (let i = 0; i < mindre; i++) {
    const smaller = splitChildren(current).boxes.find((b) => b.kind === 'smaller');
    if (!smaller) break;
    current = smaller;
  }
  return current;
}

/** Node id of the page at `path` below budget/ ("stat/utgifter/9"), from the names file. */
function nodeIdForPath(names: NamesFile, path: string): string | null {
  const root = (i: number) => (i >= names.revenueRoot ? names.revenueRoot : 0);
  const row = names.rows.find(
    (r, i) => (r[2] < 0 ? r[3] : `${names.rows[root(i)][3]}/${r[3]}`) === path,
  );
  return row ? row[0] : null;
}

function urlFor(view: View, latest: number, trees: Trees | undefined): string {
  const params = new URLSearchParams();
  if (view.year !== latest) params.set('ar', String(view.year));
  let path: string;
  if (view.nodeId && trees) {
    path = trees.byId.get(view.nodeId)?.href ?? levelHref();
    if (view.mindre > 0) params.set('mindre', String(view.mindre));
  } else {
    path = /\/budget\/(stat\/)?$/.test(window.location.pathname)
      ? window.location.pathname
      : levelHref();
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function plainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

// --- The island ----------------------------------------------------------------------------------

type Props = {
  /** The balance view of the latest year, rendered at build time. */
  initial: Balance;
  years: YearOption[];
};

/**
 * The budget explorer island. The static page renders the balance view of the latest year; this
 * component hydrates it and handles year changes and drilling client-side with history.pushState
 * (P1). Without JavaScript every box is an ordinary link and the page is complete as it is.
 */
export default function BudgetExplorer({ initial, years }: Props) {
  const latest = initial.year;
  const [view, setView] = useState<View>({ year: latest, nodeId: null, mindre: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [failed, setFailed] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const go = useCallback(
    async (target: View, opts: { push: boolean; focus: boolean; href?: string }): Promise<void> => {
      let trees: Trees;
      try {
        trees = await ensure(target.year);
      } catch {
        if (opts.href) window.location.assign(opts.href);
        else setFailed(true);
        return;
      }
      setFailed(false);
      let { nodeId, mindre } = target;
      let message: string | null = null;
      if (nodeId) {
        const root = sideOf(nodeId) === 'utgifter' ? trees.spending : trees.revenue;
        const chain = pathTo(root, nodeId);
        if (!chain) {
          nodeId = null;
          mindre = 0;
        } else if (chain[chain.length - 1].value === null) {
          const kept = [...chain].reverse().find((n) => n.value !== null);
          const lost = chain[chain.length - 1];
          nodeId = kept?.id ?? null;
          mindre = 0;
          message = `${lost.name} fanns inte ${target.year}. Visar ${kept?.name ?? 'Statens budget'} i stället.`;
        }
      }
      const next: View = { year: target.year, nodeId, mindre };
      const node = nodeId ? trees.byId.get(nodeId) : undefined;
      const shown = node ? resolveMindre(node, mindre) : undefined;
      const title = shown ? shown.name : `Statens budget`;
      const count = shown?.children?.length;
      setView(next);
      setNotice(message);
      setAnnouncement(`Visar ${title} ${next.year}${count ? `, ${count} poster` : ''}.`);
      document.title = `${title} ${next.year} – Brutna Löften`;
      const url = urlFor(next, latest, trees);
      if (opts.push) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
      if (opts.focus) setFocusTick((t) => t + 1);
    },
    [latest],
  );

  // A deep link such as ?ar=2020 (or a path below /budget/stat/) opens that view after hydration.
  const fromLocation = useCallback(async (): Promise<View | null> => {
    const params = new URLSearchParams(window.location.search);
    const ar = Number(params.get('ar'));
    const year = years.some((y) => y.year === ar) ? ar : latest;
    const rest = window.location.pathname.startsWith(BUDGET)
      ? window.location.pathname.slice(BUDGET.length).replace(/\/$/, '')
      : '';
    let nodeId: string | null = null;
    if (rest !== '' && rest !== 'stat') {
      try {
        await ensure(year);
      } catch {
        return null;
      }
      nodeId = namesLoaded ? nodeIdForPath(namesLoaded, rest) : null;
    }
    return { year, nodeId, mindre: Number(params.get('mindre')) || 0 };
  }, [years, latest]);

  useEffect(() => {
    const restore = (focus: boolean) => {
      void fromLocation().then((v) => {
        if (v) void go(v, { push: false, focus });
      });
    };
    const params = new URLSearchParams(window.location.search);
    const rest = window.location.pathname.slice(BUDGET.length).replace(/\/$/, '');
    if (params.has('ar') || (rest !== '' && rest !== 'stat')) restore(false);
    const onPop = () => restore(true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fromLocation, go]);

  useEffect(() => {
    if (focusTick > 0) h1Ref.current?.focus();
  }, [focusTick]);

  const onOpen = (target: Openable, e: MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return;
    // Leaves have their own pages (not part of the island); the browser follows the link.
    if (target.kind === 'leaf') return;
    let nodeId = target.id;
    let mindre = 0;
    if (target.kind === 'smaller') {
      mindre = (nodeId.match(/smaller:/g) ?? []).length;
      nodeId = nodeId.replace(/^(smaller:)+/, '');
    }
    e.preventDefault();
    void go({ year: view.year, nodeId, mindre }, { push: true, focus: true, href: target.href });
  };

  const onCrumb = (crumb: Crumb, e: MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    void go(
      { year: view.year, nodeId: crumb.nodeId, mindre: 0 },
      { push: true, focus: true, href: crumb.href },
    );
  };

  const onYear = (year: number) => {
    void go({ ...view, year }, { push: true, focus: false });
  };

  const preliminary = years.find((y) => y.year === view.year)?.preliminary ?? false;
  const trees = treesCache.get(view.year);
  let body;
  if (view.nodeId && trees) {
    const node = trees.byId.get(view.nodeId);
    const side = sideOf(view.nodeId);
    if (node) {
      const shown = resolveMindre(node, view.mindre);
      const chain = pathTo(side === 'utgifter' ? trees.spending : trees.revenue, node.id) ?? [node];
      const level = initial.level;
      const crumbs: Crumb[] = [
        { label: 'Budget', href: BUDGET, nodeId: null },
        { label: level.name, href: levelHref(), nodeId: null },
        ...chain.map((n, i): Crumb => ({
          label: i === 0 ? (side === 'utgifter' ? 'Utgifter' : 'Inkomster') : n.name,
          href: n.href,
          nodeId: n.id,
        })),
      ];
      if (shown !== node) {
        crumbs.push({ label: 'Mindre poster', href: shown.href, nodeId: node.id });
      }
      body = (
        <DrillView
          node={shown}
          side={side}
          year={view.year}
          sideTotal={side === 'utgifter' ? trees.totals.utgifter : trees.totals.inkomster}
          crumbs={crumbs}
          years={years}
          preliminary={preliminary && side === 'inkomster'}
          onYear={onYear}
          onOpen={onOpen}
          onCrumb={onCrumb}
          h1Ref={h1Ref}
        />
      );
    }
  }
  if (!body) {
    const balance =
      view.year === latest || !trees
        ? initial
        : balanceFrom(view.year, trees.totals, trees.spending, trees.revenue, {
            level: initial.level,
          });
    body = (
      <BalanceView
        balance={balance}
        years={years}
        preliminary={preliminary}
        onYear={onYear}
        onOpen={onOpen}
        onCrumb={onCrumb}
        h1Ref={h1Ref}
      />
    );
  }

  return (
    <div>
      {notice && (
        <p
          role="status"
          className="mb-3 flex items-start justify-between gap-3 rounded-md border bg-muted px-3 py-2 text-sm"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Stäng
          </button>
        </p>
      )}
      {failed && (
        <p role="alert" className="mb-3 rounded-md border border-destructive px-3 py-2 text-sm">
          Det gick inte att hämta siffrorna för det året. Försök igen.
        </p>
      )}
      {body}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
