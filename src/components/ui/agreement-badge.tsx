import { agreementOutcomeLabel } from '@/schema/promise';
import type { AgreementOutcome } from '@/schema/promise';
import { cn } from '@/lib/utils';

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  outcome: AgreementOutcome;
  /** The agreement's source; the label is built from its shortTitle (never hardcoded). */
  source: { shortTitle?: string; title: string };
  /** Optional text after the label, e.g. a count. */
  suffix?: string;
  size?: 'list' | 'box';
}

/**
 * Agreement badge: square corners and a 2 px violet border keep it apart from the rounded
 * verdict pills. `contradicted` has a dashed border; `not_addressed` is an outline only.
 */
export function AgreementBadge({
  outcome,
  source,
  suffix,
  size = 'list',
  className,
  ...rest
}: Props) {
  return (
    <span
      data-outcome={outcome}
      className={cn(
        'agreement-badge shrink-0 px-2.5',
        size === 'list' ? 'h-[26px]' : 'h-8 px-3 text-sm',
        className,
      )}
      {...rest}
    >
      {agreementOutcomeLabel(outcome, source)}
      {suffix ? `: ${suffix}` : null}
    </span>
  );
}
