import type { MouseEvent } from 'react';
import type { BudgetNode } from '@/lib/budget/core';

/** What the island needs to know about a clicked link: the node id and where it points. */
export type Openable = Pick<BudgetNode, 'id' | 'href' | 'kind'>;

/** A left click without a modifier key: the only click the island handles itself (P1). */
export function plainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export type OpenHandler = (target: Openable, event: MouseEvent<HTMLAnchorElement>) => void;
