import { useMemo, type MouseEvent, type Ref } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/budget/Breadcrumbs';
import { DataTable } from '@/components/budget/DataTable';
import { MinusStrip } from '@/components/budget/MinusStrip';
import { PrelimBadge } from '@/components/budget/PrelimBadge';
import { makeBoxes, Treemap } from '@/components/budget/Treemap';
import { LABEL_WIDTH } from '@/components/budget/BalanceView';
import type { OpenHandler } from '@/components/budget/types';
import { YearSelect, type YearOption } from '@/components/budget/YearSelect';
import {
  formatAmountWords,
  formatMdkr,
  formatPercentWords,
  formatPercent,
  shareOf,
} from '@/lib/budget/format';
import { splitChildren, type BudgetNode } from '@/lib/budget/core';
import { FRAME_ASPECT, layoutNodes } from '@/lib/budget/treemap';

type Props = {
  node: BudgetNode;
  side: 'utgifter' | 'inkomster';
  year: number;
  /** statens utgifter / inkomster for the year: the base of the "av statens ..." share. */
  sideTotal: number;
  crumbs: Crumb[];
  years: YearOption[];
  /** Revenue is preliminary for this year and the view is on the revenue side. */
  preliminary: boolean;
  onYear: (year: number) => void;
  onOpen: OpenHandler;
  onCrumb: (crumb: Crumb, event: MouseEvent<HTMLAnchorElement>) => void;
  h1Ref: Ref<HTMLHeadingElement>;
};

/** One template for every drill level on both sides (P3): the children of a node as a treemap. */
export function DrillView({
  node,
  side,
  year,
  sideTotal,
  crumbs,
  years,
  preliminary,
  onYear,
  onOpen,
  onCrumb,
  h1Ref,
}: Props) {
  const split = useMemo(() => splitChildren(node), [node]);
  const sideLabel = side === 'utgifter' ? 'statens utgifter' : 'statens inkomster';
  const value = node.value ?? 0;
  const caption = `Andel av ${formatMdkr(split.base)} (${node.name})`;

  const boxes = useMemo(
    () =>
      makeBoxes(split.boxes, layoutNodes(split.boxes), FRAME_ASPECT, LABEL_WIDTH, (n) => {
        const share = shareOf(n.value ?? 0, split.base);
        return {
          value: formatPercent(share),
          aria: `${n.name}: ${formatPercentWords(share)} av ${node.name}, ${formatAmountWords(n.value ?? 0)}`,
          link: true,
        };
      }),
    [split, node.name],
  );

  // The table lists every item individually, so grouped small ones are expanded again.
  const tableRows = [
    ...split.boxes.flatMap((n) => (n.kind === 'smaller' ? (n.children ?? []) : [n])),
    ...split.table,
  ].map((n) => ({ node: n, share: shareOf(n.value ?? 0, split.base) }));

  return (
    <>
      <Breadcrumbs crumbs={crumbs} onOpen={onCrumb} />
      <h1 ref={h1Ref} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none md:text-3xl">
        {node.name}
      </h1>
      {preliminary && (
        <div className="mt-2">
          <PrelimBadge />
        </div>
      )}
      <p className="mt-2 text-muted-foreground">
        {formatAmountWords(value)} {year}
        {value > 0 && sideTotal > 0 && (
          <>
            , {formatPercent(shareOf(value, sideTotal))} av {sideLabel}
          </>
        )}
        .
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <YearSelect years={years} value={year} onChange={onYear} />
      </div>

      {boxes.length > 0 ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">{caption}</p>
          <p className="sr-only">
            Ytorna är proportionella mot beloppen. Samma uppgifter finns i tabellen nedan.
          </p>
          <div className="mt-1">
            <Treemap
              label={`${node.name} ${year}, största först`}
              boxes={boxes}
              side={side === 'utgifter' ? 'out' : 'in'}
              aspect={FRAME_ASPECT}
              onOpen={onOpen}
            />
          </div>
        </>
      ) : (
        <p className="mt-4">Inga poster med belopp {year}.</p>
      )}
      <MinusStrip items={split.strip} onOpen={onOpen} />

      <DataTable
        caption={caption}
        onOpen={onOpen}
        sections={[
          { rows: tableRows },
          ...(split.strip.length
            ? [
                {
                  heading: 'Dras av',
                  rows: split.strip.map((n) => ({ node: n, share: null })),
                },
              ]
            : []),
        ]}
        total={{ label: `Summa ${node.name}`, value }}
      />
    </>
  );
}
