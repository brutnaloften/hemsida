import type { MouseEvent, ReactNode } from 'react';
import type { BudgetNode } from '@/lib/budget/core';

/** What the island needs to know about a clicked link: the node id and where it points. */
export type Openable = Pick<BudgetNode, 'id' | 'href' | 'kind'>;

/**
 * The salary panel (P8) as the views see it: the control to place in the controls row, and the
 * person's yearly share to the state in kr, or null while no estimate is shown (percent mode).
 */
export type Personal = { panel: ReactNode; total: number | null };

/** A left click without a modifier key: the only click the island handles itself (P1). */
export function plainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export type OpenHandler = (target: Openable, event: MouseEvent<HTMLAnchorElement>) => void;

/** An extra table column of advanced mode: one formatted cell per row, optionally in the total row. */
export type TableColumn = {
  label: string;
  cell: (node: BudgetNode) => string;
  total?: string;
};

/**
 * Advanced mode (P10) as the views see it. The explorer builds the pieces for the node on screen;
 * the views only place them: `controls` in the controls row, `header` under the H1, `chart` under the
 * treemap, and the columns and codes in the data table. Absent when the island has no data for it.
 */
export type Advanced = {
  on: boolean;
  controls: ReactNode;
  header: ReactNode;
  chart: ReactNode;
  columns: TableColumn[];
  code: (node: BudgetNode) => string | null;
};
