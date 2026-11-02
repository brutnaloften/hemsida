import { formatMdkr, formatPercent } from '@/lib/budget/format';
import type { BudgetNode } from '@/lib/budget/core';
import type { Advanced, OpenHandler } from '@/components/budget/types';

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
  personal,
  advanced,
}: {
  caption: string;
  sections: TableSection[];
  total?: { label: string; value: number };
  onOpen?: OpenHandler;
  /** Adds the personal column ("Din del (kr per år)" or "(kr per månad)", set by `label`): the person's share of a row's value, formatted, or "–". */
  personal?: { part: (node: BudgetNode) => string; total?: string; label?: string };
  /** Advanced mode (P10): opens the table and adds the code and budget columns. */
  advanced?: Pick<Advanced, 'on' | 'columns' | 'code'>;
}) {
  const adv = advanced?.on ? advanced : undefined;
  const extra = adv?.columns ?? [];
  const cols = 3 + (personal ? 1 : 0) + extra.length + (adv ? 1 : 0);
  return (
    <details className="mt-6 rounded-md border" open={adv ? true : undefined}>
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
              {adv && (
                <th scope="col" className="px-2 py-1 font-medium">
                  Kod
                </th>
              )}
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Andel
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-medium">
                {adv ? 'Miljarder kronor, löpande priser' : 'Miljarder kronor'}
              </th>
              {extra.map((c) => (
                <th key={c.label} scope="col" className="py-1 pl-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
              {personal && (
                <th scope="col" className="py-1 pl-2 text-right font-medium">
                  {personal.label ?? 'Din del (kr)'}
                </th>
              )}
            </tr>
          </thead>
          {sections.map((section, i) => (
            <tbody key={section.heading ?? i}>
              {section.heading && (
                <tr>
                  <th scope="colgroup" colSpan={cols} className="pt-3 pb-1 text-left font-semibold">
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
                  {adv && (
                    <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                      {adv.code(node) ?? '–'}
                    </td>
                  )}
                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                    {share === null ? '–' : formatPercent(share)}
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap">
                    {node.value === null ? '–' : formatMdkr(node.value)}
                  </td>
                  {extra.map((c) => (
                    <td
                      key={c.label}
                      className="py-1 pl-2 text-right tabular-nums whitespace-nowrap"
                    >
                      {c.cell(node)}
                    </td>
                  ))}
                  {personal && (
                    <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap">
                      {node.value === null ? '–' : personal.part(node)}
                    </td>
                  )}
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
                {adv && <td />}
                <td />
                <td className="pt-2 pl-2 text-right tabular-nums whitespace-nowrap">
                  {formatMdkr(total.value)}
                </td>
                {extra.map((c) => (
                  <td key={c.label} className="pt-2 pl-2 text-right tabular-nums whitespace-nowrap">
                    {c.total ?? ''}
                  </td>
                ))}
                {personal && (
                  <td className="pt-2 pl-2 text-right tabular-nums whitespace-nowrap">
                    {personal.total ?? ''}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </details>
  );
}
