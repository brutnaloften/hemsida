import { formatMdkr, formatPercent } from '@/lib/budget/format';
import type { BudgetNode } from '@/lib/budget/core';
import type { OpenHandler } from '@/components/budget/types';

export type TableRow = {
  node: BudgetNode;
  /** Share of the base as a fraction, or null when the row has no share (saldo, strip). */
  share: number | null;
  /** Rows without a link (saldo, övriga poster). */
  link?: boolean;
};

export type TableSection = {
  heading?: string;
  rows: TableRow[];
};

/**
 * The text alternative to the treemap (P7): every item of the view, including the grouped small
 * ones and the minus-strip rows, in a real table inside a closed <details>. Always in the HTML.
 */
export function DataTable({
  caption,
  sections,
  total,
  onOpen,
}: {
  caption: string;
  sections: TableSection[];
  total?: { label: string; value: number };
  onOpen?: OpenHandler;
}) {
  return (
    <details className="mt-6 rounded-md border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        Visa som tabell
      </summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full text-sm">
          <caption className="py-2 text-left text-muted-foreground">{caption}</caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="py-1 pr-2 font-medium">
                Namn
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Andel
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-medium">
                Miljarder kronor
              </th>
            </tr>
          </thead>
          {sections.map((section, i) => (
            <tbody key={section.heading ?? i}>
              {section.heading && (
                <tr>
                  <th scope="colgroup" colSpan={3} className="pt-3 pb-1 text-left font-semibold">
                    {section.heading}
                  </th>
                </tr>
              )}
              {section.rows.map(({ node, share, link = true }) => (
                <tr key={node.id} className="border-b border-border/50 align-top">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    {link ? (
                      <a
                        href={node.href}
                        onClick={onOpen ? (e) => onOpen(node, e) : undefined}
                        className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {node.name}
                      </a>
                    ) : (
                      node.name
                    )}
                  </th>
                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                    {share === null ? '–' : formatPercent(share)}
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap">
                    {node.value === null ? '–' : formatMdkr(node.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          {total && (
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" className="pt-2 pr-2 text-left">
                  {total.label}
                </th>
                <td />
                <td className="pt-2 pl-2 text-right tabular-nums whitespace-nowrap">
                  {formatMdkr(total.value)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </details>
  );
}
