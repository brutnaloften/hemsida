import { VOTE_LABELS, VOTE_SYMBOLS } from '@/lib/promise-page';
import type { VOTE_VALUES } from '@/schema/promise';
import { cn } from '@/lib/utils';

type VoteValue = (typeof VOTE_VALUES)[number];

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  vote: VoteValue;
}

/**
 * A party's vote. Colour is never the only signal: every vote has its own symbol and its word,
 * and absence has a dashed border (see `.vote-badge` in globals.css).
 */
export function VoteBadge({ vote, className, ...rest }: Props) {
  return (
    <span data-vote={vote} className={cn('vote-badge', className)} {...rest}>
      <span aria-hidden="true">{VOTE_SYMBOLS[vote]}</span>
      {VOTE_LABELS[vote]}
    </span>
  );
}
