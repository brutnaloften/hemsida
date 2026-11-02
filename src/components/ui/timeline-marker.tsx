import { cn } from '@/lib/utils';

export type TimelineStep = 'promise' | 'agreement' | 'document' | 'missing';

const MARKERS: Record<TimelineStep, string> = {
  promise: 'size-4 rounded-full bg-foreground',
  agreement:
    'size-3.5 border-2 border-[#5b21b6] bg-[#ede9fe] dark:border-[#a78bfa] dark:bg-[#2e1065]',
  document: 'size-3.5 rounded-full border-[3px] border-foreground bg-background',
  missing: 'size-3 rounded-full border-2 border-dashed border-[var(--dashed)] bg-transparent',
};

/**
 * Decorative marker on the timeline rule. The meta line next to it carries the step type, so the
 * marker is aria-hidden. Shapes differ so the steps are distinguishable without colour.
 */
export function TimelineMarker({ step, className }: { step: TimelineStep; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-step={step}
      className={cn('inline-block shrink-0', MARKERS[step], className)}
    />
  );
}
