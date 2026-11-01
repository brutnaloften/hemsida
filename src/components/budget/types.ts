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
