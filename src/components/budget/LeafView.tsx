import type { MouseEvent, Ref } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/budget/Breadcrumbs';
import { YearSelect, type YearOption } from '@/components/budget/YearSelect';
import { discontinuedAfter, existsIn, type BudgetNode, type Side } from '@/lib/budget/core';
import { formatAmountWords, formatPercent, formatPercentWords, shareOf } from '@/lib/budget/format';

type Props = {
  node: BudgetNode;
  /** The leaf's parent, absent when it hangs directly below the side root. */
  parent?: BudgetNode;
  side: Side;
  year: number;
  sideTotal: number;
  crumbs: Crumb[];
  years: YearOption[];
  onYear: (year: number) => void;
  onCrumb: (crumb: Crumb, event: MouseEvent<HTMLAnchorElement>) => void;
  h1Ref: Ref<HTMLHeadingElement>;
};

/** "utgiftsområde 9" for a UO, otherwise the parent's own name. */
function parentLabel(parent: BudgetNode): string {
  const uo = /^uo:(\d+)$/.exec(parent.id);
  return uo ? `utgiftsområde ${uo[1]}` : parent.name;
}

/**
 * Leaf page content (P5): H1, the lead sentence, a share bar of the leaf within its parent instead of
 * a one-box treemap, "Upphörde efter <år>" and the "fanns inte <år>" fallback. Works for any leaf of
 * either side (anslag, and titlar from rn4.5); the page wrapper adds the slots below it.
 */
export function LeafView({
  node,
  parent,
  side,
  year,
  sideTotal,
  crumbs,
  years,
  onYear,
  onCrumb,
  h1Ref,
}: Props) {
  const sideLabel = side === 'utgifter' ? 'statens utgifter' : 'statens inkomster';
  const last = discontinuedAfter(node.id);
  const present = existsIn(node, year);
  const value = node.value ?? 0;

  const ofSide = sideTotal > 0 ? shareOf(value, sideTotal) : null;
  const ofParent = parent && (parent.value ?? 0) > 0 ? shareOf(value, parent.value!) : null;

  return (
    <>
      <Breadcrumbs crumbs={crumbs} onOpen={onCrumb} />
      <h1 ref={h1Ref} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none md:text-3xl">
        {node.name}
      </h1>
      {last !== null && <p className="mt-2 text-sm font-medium">Upphörde efter {last}.</p>}

      {present ? (
        <p className="mt-2 text-muted-foreground">
          {formatAmountWords(value)} {year}.
          {value > 0 && (ofParent !== null || ofSide !== null) && (
            <>
              {' '}
              Det är{' '}
              {ofParent !== null && parent && (
                <>
                  {formatPercent(ofParent)} av {parentLabel(parent)}
                  {ofSide !== null && ' och '}
                </>
              )}
              {ofSide !== null && (
                <>
                  {formatPercent(ofSide)} av {sideLabel}
                </>
              )}
              .
            </>
          )}
        </p>
      ) : (
        <p className="mt-2" role="note">
          {node.id.startsWith('anslag:') ? 'Anslaget' : 'Posten'} fanns inte {year}.
          {last !== null && (
            <>
              {' '}
              <a
                href={`${node.href}?ar=${last}`}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onYear(last);
                }}
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Visa {last}, det sista året det fanns
              </a>
              .
            </>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <YearSelect years={years} value={year} onChange={onYear} />
      </div>

      {present && ofParent !== null && parent && value > 0 && (
        <figure className="mt-4">
          <figcaption className="text-sm text-muted-foreground">
            Andel av {parent.name} ({formatAmountWords(parent.value ?? 0)})
          </figcaption>
          <div
            role="img"
            aria-label={`${node.name} är ${formatPercentWords(ofParent)} av ${parentLabel(parent)}`}
            className="mt-1 h-6 w-full overflow-hidden rounded-sm bg-budget-other"
          >
            <div
              className={`h-full min-w-0.5 ${side === 'utgifter' ? 'bg-budget-out-2' : 'bg-budget-in-2'}`}
              style={{ width: `${Math.min(100, ofParent * 100).toFixed(2)}%` }}
            />
          </div>
        </figure>
      )}
    </>
  );
}
