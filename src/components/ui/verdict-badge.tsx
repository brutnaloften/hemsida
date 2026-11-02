import { VERDICT_LABELS } from '@/schema/promise';
import type { VERDICTS } from '@/schema/promise';
import { cn } from '@/lib/utils';

type VerdictValue = (typeof VERDICTS)[number];

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  verdict: VerdictValue;
  /** Optional text after the label, e.g. a count. */
  suffix?: string;
  /** `list` is 26 px high, `box` 32 px (assessment box). */
  size?: 'list' | 'box';
}

/**
 * Assessment badge: rounded pill. Unassessed and no_evidence get a dashed border (see globals.css)
 * so they never read as a finding; shape and border carry meaning, not only colour.
 */
export function VerdictBadge({ verdict, suffix, size = 'list', className, ...rest }: Props) {
  return (
    <span
      data-verdict={verdict}
      className={cn(
        'verdict-badge shrink-0 px-3',
        size === 'list' ? 'h-[26px]' : 'h-8 px-4 text-sm',
        className,
      )}
      {...rest}
    >
      {VERDICT_LABELS[verdict]}
      {suffix ? `: ${suffix}` : null}
    </span>
  );
}
