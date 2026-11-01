import { useMemo, type MouseEvent, type Ref } from 'react';
import type { Advanced, OpenHandler, Personal } from '@/components/budget/types';
import { Breadcrumbs, type Crumb } from '@/components/budget/Breadcrumbs';
import { DataTable } from '@/components/budget/DataTable';
import { makeBoxes, Treemap, type Box } from '@/components/budget/Treemap';
import { PrelimBadge } from '@/components/budget/PrelimBadge';
import { YearSelect, type YearOption } from '@/components/budget/YearSelect';
import {
  formatAmountWords,
  formatMdkr,
  formatPercentWords,
  formatPercent,
  shareOf,
} from '@/lib/budget/format';
import { formatPart, krWords, partOf } from '@/lib/budget/salary-view';
import { LABELS } from '@/lib/budget/labels';
import { hrefFor, levelHref, type Balance, type BalanceColumn } from '@/lib/budget/core';
import { columnAspect, layoutColumn, type Frame } from '@/lib/budget/treemap';

/** Container widths used for label tiers: the narrowest phone content (320 - 2 x 16) and a mid desktop. */
export const LABEL_WIDTH: Record<Frame, number> = { portrait: 288, landscape: 800 };

type Props = {
  balance: Balance;
  years: YearOption[];
  preliminary: boolean;
  onYear: (year: number) => void;
  onOpen: OpenHandler;
  onCrumb: (crumb: Crumb, event: MouseEvent<HTMLAnchorElement>) => void;
  h1Ref: Ref<HTMLHeadingElement>;
  personal?: Personal;
  advanced?: Advanced;
};

/** Explanations of "Övriga poster" (P2), read out in the box's accessible name. */
const OTHER_EXPLANATION = {
  minskar:
    'I statens redovisning minskar de här posterna utgifterna. Här visas de på inkomstsidan så att båda sidorna kan ritas som ytor.',
  utgift: 'Lån och kassamässiga justeringar som ingår i statens utgifter.',
} as const;

function columnBoxes(
  column: BalanceColumn,
  base: number,
  baseLabel: string,
  saldoBase: number,
  saldoLabel: string,
  /** The person's yearly share (P8) to show in kr on this column, or null for percent. */
  kr: number | null,
): Box[] {
  const aspect = { portrait: columnAspect('portrait'), landscape: columnAspect('landscape') };
  const layouts = {
    portrait: layoutColumn(column, aspect.portrait),
    landscape: layoutColumn(column, aspect.landscape),
  };
  const half = { portrait: LABEL_WIDTH.portrait / 2, landscape: LABEL_WIDTH.landscape / 2 };
  return makeBoxes(column.items, layouts, aspect, half, (n) => {
    const v = n.value ?? 0;
    const share = shareOf(v, n.kind === 'saldo' ? saldoBase : base);
    const percentWords = `${formatPercentWords(share)} av ${n.kind === 'saldo' ? saldoLabel : baseLabel}`;
    const plain = n.kind === 'saldo' || n.kind === 'other';
    // The saldo box shows nothing personal, to avoid implying "your share of the debt".
    const part = kr !== null && n.kind !== 'saldo' ? partOf(kr, v, base) : null;
    return {
      value:
        n.kind === 'saldo'
          ? `${n.name} ${formatMdkr(v)}`
          : part !== null
            ? formatPart(part)
            : formatPercent(share),
      aria: `${n.name}: ${percentWords}, ${formatAmountWords(v)}${
        part !== null ? `. Din del: ${krWords(part)} per år` : ''
      }${
        n.kind === 'other'
          ? `. ${OTHER_EXPLANATION[n.name === LABELS.ovrigaMinskar ? 'minskar' : 'utgift']}`
          : ''
      }`,
      link: !plain,
    };
  });
}

export function BalanceView({
  balance,
  years,
  preliminary,
  onYear,
  onOpen,
  onCrumb,
  h1Ref,
  personal,
  advanced,
}: Props) {
  const { totals, year, saldo } = balance;
  const deficit = totals.saldo < 0;
  const kr = personal?.total ?? null;
  const outBoxes = useMemo(
    () =>
      columnBoxes(
        balance.out,
        totals.utgifter,
        'statens utgifter',
        totals.utgifter,
        'utgifterna',
        kr,
      ),
    [balance, totals.utgifter, kr],
  );
  const inBoxes = useMemo(
    () =>
      columnBoxes(
        balance.in,
        totals.inkomster,
        'statens inkomster',
        totals.utgifter,
        'utgifterna',
        kr,
      ),
    [balance, totals.inkomster, kr],
  );
  const aspect = { portrait: columnAspect('portrait'), landscape: columnAspect('landscape') };
  const topOut = balance.out.items
    .filter((n) => n.kind === 'group' || n.kind === 'leaf')
    .slice(0, 5);
  const crumbs: Crumb[] = [
    {
      label: 'Budget',
      href: levelHref({ level: balance.level }).replace(/stat\/$/, ''),
      nodeId: null,
    },
    { label: balance.level.name, href: levelHref({ level: balance.level }), nodeId: null },
  ];
  const outHref = hrefFor('utgifter', [], { level: balance.level });
  const inHref = hrefFor('inkomster', [], { level: balance.level });

  return (
    <>
      <Breadcrumbs crumbs={crumbs} onOpen={onCrumb} />
      <h1 ref={h1Ref} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none md:text-3xl">
        Statens budget {year}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Staten gav ut {formatAmountWords(totals.utgifter)} och tog in{' '}
        {formatAmountWords(totals.inkomster)}. {deficit ? 'Underskottet' : 'Överskottet'} blev{' '}
        {formatAmountWords(Math.abs(totals.saldo))}.{' '}
        {deficit
          ? 'Staten lånade mellanskillnaden.'
          : 'Överskottet användes till att betala av på statsskulden.'}
      </p>
      {preliminary && (
        <div className="mt-2">
          <PrelimBadge />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <YearSelect years={years} value={year} onChange={onYear} />
        {personal?.panel}
        {advanced?.controls}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Klicka på en ruta för att se vad den består av.
      </p>
      <p className="sr-only">
        Ytorna är proportionella mot beloppen. Samma uppgifter finns i tabellen nedan.
      </p>

      <div className="mt-2 grid grid-cols-2 grid-rows-[auto_auto_auto] gap-x-2 sm:gap-x-4">
        <section aria-labelledby="budget-out-heading" className="row-span-3 grid grid-rows-subgrid">
          <h2 id="budget-out-heading" className="mb-1 text-sm font-semibold sm:text-base">
            <a
              href={outHref}
              onClick={(e) => onOpen({ id: 'root:utgifter', href: outHref }, e)}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Utgifter
            </a>{' '}
            <span className="block font-normal tabular-nums sm:inline">
              {formatMdkr(totals.utgifter)}
            </span>
          </h2>
          <Treemap
            label={`Utgifter ${year}, största först`}
            boxes={outBoxes}
            side="out"
            aspect={aspect}
            onOpen={onOpen}
          />
          <a
            href={outHref}
            onClick={(e) => onOpen({ id: 'root:utgifter', href: outHref }, e)}
            className="mt-2 inline-block text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Utforska utgifterna →
          </a>
        </section>
        <section aria-labelledby="budget-in-heading" className="row-span-3 grid grid-rows-subgrid">
          <div>
            <h2 id="budget-in-heading" className="mb-1 text-sm font-semibold sm:text-base">
              <a
                href={inHref}
                onClick={(e) => onOpen({ id: 'root:inkomster', href: inHref }, e)}
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Inkomster
              </a>{' '}
              <span className="block font-normal tabular-nums sm:inline">
                {formatMdkr(totals.inkomster)}
              </span>
            </h2>
            {preliminary && <PrelimBadge />}
          </div>
          <Treemap
            label={`Inkomster ${year}, största först`}
            boxes={inBoxes}
            side="in"
            aspect={aspect}
            onOpen={onOpen}
          />
          <a
            href={inHref}
            onClick={(e) => onOpen({ id: 'root:inkomster', href: inHref }, e)}
            className="mt-2 inline-block text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Utforska inkomsterna →
          </a>
        </section>
      </div>

      <section className="mt-6 sm:hidden" aria-labelledby="budget-top-heading">
        <h2 id="budget-top-heading" className="text-base font-semibold">
          Största utgifterna
        </h2>
        <ol className="mt-1 divide-y text-sm">
          {topOut.map((n) => (
            <li key={n.id} className="flex justify-between gap-3 py-1.5">
              <a
                href={n.href}
                onClick={(e) => onOpen(n, e)}
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {n.shortName ?? n.name}
              </a>
              <span className="tabular-nums whitespace-nowrap">
                {formatPercent(shareOf(n.value ?? 0, totals.utgifter))}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {advanced?.chart}

      <DataTable
        advanced={advanced}
        caption={`Statens utgifter och inkomster ${year}. ${
          deficit ? 'Underskottet' : 'Överskottet'
        } ${formatAmountWords(Math.abs(totals.saldo))} visas som en egen post.`}
        onOpen={onOpen}
        personal={
          kr === null
            ? undefined
            : {
                part: (n) =>
                  n.kind === 'saldo'
                    ? '–'
                    : formatPart(
                        partOf(
                          kr,
                          n.value ?? 0,
                          balance.out.items.includes(n) ? totals.utgifter : totals.inkomster,
                        ),
                      ),
              }
        }
        sections={[
          {
            heading: 'Utgifter',
            rows: balance.out.items.map((n) => ({
              node: n,
              share: shareOf(n.value ?? 0, totals.utgifter),
              link: n.kind !== 'saldo' && n.kind !== 'other',
            })),
          },
          {
            heading: 'Inkomster',
            rows: balance.in.items.map((n) => ({
              node: n,
              share: shareOf(n.value ?? 0, totals.inkomster),
              link: n.kind !== 'saldo' && n.kind !== 'other',
            })),
          },
        ]}
        total={{
          label: `Summa per sida, inklusive ${saldo.name.toLowerCase()}`,
          value: balance.out.total,
        }}
      />
    </>
  );
}
