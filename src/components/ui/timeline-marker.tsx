import { cn } from '@/lib/utils';

export type TimelineStep = 'promise' | 'agreement' | 'document' | 'against' | 'missing';

// The `top-*` offsets centre each marker on the first 20 px line (text-sm) of its entry.
const MARKERS: Record<TimelineStep, string> = {
  promise: 'top-0.5 size-4 rounded-full bg-foreground',
  agreement:
    'top-[3px] size-3.5 border-2 border-[var(--agreement-weakened-border)] bg-[var(--agreement-weakened-bg)]',
  document: 'top-[3px] size-3.5 rounded-full border-[3px] border-foreground bg-background',
  against:
    'top-[3px] size-3.5 rotate-45 border-2 border-dashed border-[var(--evidence-contradicts-border)] bg-background',
  // Opaque background: a transparent marker lets the connector line show through the ring.
  missing: 'top-1 size-3 rounded-full border-2 border-dashed border-[var(--dashed)] bg-background',
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
      className={cn('absolute left-[-1px] -translate-x-1/2 shrink-0', MARKERS[step], className)}
    />
  );
}
