import { formatAmountWords, formatMdkr } from '@/lib/budget/format';
import { LABELS } from '@/lib/budget/labels';
import type { BudgetNode } from '@/lib/budget/core';
import type { OpenHandler } from '@/components/budget/types';

/**
 * Items with a negative value ("Dras av", P3, P6). They are never drawn as area: a hatched strip
 * with a minus sign on every amount instead.
 */
export function MinusStrip({ items, onOpen }: { items: BudgetNode[]; onOpen?: OpenHandler }) {
  if (items.length === 0) return null;
  return (
    <section className="budget-hatch mt-3 rounded-sm border border-budget-hatch/60 p-3 text-budget-box-foreground">
      <h3 className="text-sm font-semibold">{LABELS.stripHeading}</h3>
      <ul role="list" className="mt-1 space-y-1 text-sm">
        {items.map((n) => (
          <li key={n.id} className="flex justify-between gap-3">
            <a
              href={n.href}
              onClick={onOpen ? (e) => onOpen(n, e) : undefined}
              aria-label={`${n.name}: minus ${formatAmountWords(Math.abs(n.value ?? 0))}`}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              {n.name}
            </a>
            <span className="tabular-nums whitespace-nowrap">{formatMdkr(n.value ?? 0)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
