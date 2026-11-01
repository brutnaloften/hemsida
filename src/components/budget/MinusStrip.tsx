import {
  formatAmountWords,
  formatMdkr,
  formatPercent,
  formatPercentWords,
} from '@/lib/budget/format';
import { LABELS } from '@/lib/budget/labels';
import { AVGAENDE_NOTE, revenueExplanation } from '@/lib/budget/revenue-labels';
import type { BudgetNode } from '@/lib/budget/core';
import type { OpenHandler } from '@/components/budget/types';

/** The arithmetic of a view with deductions: boxes - strip = node (P3). */
export type StripEquation = {
  /** Sum of the boxes. */
  base: number;
  /** Sum of the strip (<= 0). */
  stripTotal: number;
  /** Value of the node. */
  total: number;
  /** What the boxes add up to, "Inbetalt" in Skatter, netto. */
  baseLabel: string;
  /** Name of the node, shown in brackets after the result. */
  name: string;
};

/**
 * Equation line and proportion bar under the strip: the solid part is what remains, the hatched
 * part is what is deducted (P3). The bar is decoration; the equation line carries the numbers.
 */
function Equation({ eq }: { eq: StripEquation }) {
  const deducted = Math.abs(eq.stripTotal);
  const share = eq.base > 0 ? Math.min(1, deducted / eq.base) : 0;
  return (
    <div className="mt-3 border-t border-budget-hatch/40 pt-3">
      <p className="text-sm">
        {eq.baseLabel} {formatMdkr(eq.base)} − dras av {formatMdkr(deducted)} ={' '}
        <strong>{formatMdkr(eq.total)}</strong> ({eq.name.toLowerCase()})
      </p>
      <div
        aria-hidden="true"
        className="mt-2 flex h-4 w-full overflow-hidden rounded-sm border border-budget-hatch/60"
      >
        <div className="bg-budget-hatch/70" style={{ width: `${(1 - share) * 100}%` }} />
        <div className="budget-hatch flex-1" />
      </div>
      <p className="mt-1 text-xs">
        <span className="sr-only">{formatPercentWords(share)} av beloppet dras av. </span>
        <span aria-hidden="true">{formatPercent(share)} dras av</span>
      </p>
    </div>
  );
}

/**
 * Items with a negative value ("Dras av", P3, P6). They are never drawn as area: a hatched strip
 * with a minus sign on every amount instead.
 */
export function MinusStrip({
  items,
  onOpen,
  equation,
}: {
  items: BudgetNode[];
  onOpen?: OpenHandler;
  equation?: StripEquation;
}) {
  if (items.length === 0) return null;
  return (
    <section className="budget-hatch mt-3 rounded-sm border border-budget-hatch/60 p-3 text-budget-box-foreground">
      <div>
        <h2 className="text-sm font-semibold">{LABELS.stripHeading}</h2>
        {items.some((n) => n.id === 'rev:1700' || n.id === 'rev:1800') && (
          <p className="mt-1 rounded-sm bg-background px-2 py-1 text-sm text-foreground">
            {AVGAENDE_NOTE}
          </p>
        )}
        <ul role="list" className="mt-1 space-y-2 text-sm">
          {items.map((n) => {
            const note = revenueExplanation(n.id);
            return (
              <li key={n.id}>
                <div className="flex justify-between gap-3">
                  <a
                    href={n.href}
                    onClick={onOpen ? (e) => onOpen(n, e) : undefined}
                    aria-label={`${n.name}: minus ${formatAmountWords(Math.abs(n.value ?? 0))}`}
                    className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {n.name}
                  </a>
                  <span className="tabular-nums whitespace-nowrap">{formatMdkr(n.value ?? 0)}</span>
                </div>
                {note && (
                  <p className="mt-1 rounded-sm bg-background px-2 py-1 text-sm text-foreground">
                    {note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {equation && <Equation eq={equation} />}
    </section>
  );
}
