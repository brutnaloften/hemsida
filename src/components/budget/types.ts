import type { MouseEvent } from 'react';
import type { BudgetNode } from '@/lib/budget/core';

/** What the island needs to know about a clicked link: the node id and where it points. */
export type Openable = Pick<BudgetNode, 'id' | 'href' | 'kind'>;

export type OpenHandler = (target: Openable, event: MouseEvent<HTMLAnchorElement>) => void;
