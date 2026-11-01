import type { MouseEvent } from 'react';
import { baseOf, levelHref, type BudgetLevel, type BudgetNode } from '@/lib/budget/core';

export type Crumb = {
  label: string;
  href: string;
  /** Node to open client-side; null is the balance view. */
  nodeId: string | null;
};

/** Breadcrumb trail (P5, P7). The last crumb is the current page. Rendered by the island so it follows client-side drills. */
export function Breadcrumbs({
  crumbs,
  onOpen,
}: {
  crumbs: Crumb[];
  onOpen?: (crumb: Crumb, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <nav aria-label="Brödsmulor" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href + c.label} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {c.label}
                </span>
              ) : (
                <a
                  href={c.href}
                  onClick={onOpen ? (e) => onOpen(c, e) : undefined}
                  className="underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {c.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Crumbs Budget > level > side > ... for the root-to-node `chain` (the first node is the side root). */
export function crumbsFor(
  chain: BudgetNode[],
  side: 'utgifter' | 'inkomster',
  level: BudgetLevel,
): Crumb[] {
  return [
    { label: 'Budget', href: `${baseOf()}budget/`, nodeId: null },
    { label: level.name, href: levelHref(), nodeId: null },
    ...chain.map((n, i): Crumb => ({
      label: i === 0 ? (side === 'utgifter' ? 'Utgifter' : 'Inkomster') : n.name,
      href: n.href,
      nodeId: n.id,
    })),
  ];
}
