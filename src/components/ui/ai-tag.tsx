import { cn } from '@/lib/utils';

/** Shown on hover and keyboard focus, and read out as the tag's description. */
export const AI_TAG_WARNING =
  'Den här bedömningen är gjord av en AI-modell (Claude) och har inte granskats av en människa. Den kan innehålla fel. Läs motiveringen och dokumenten och gör din egen bedömning.';

interface Props {
  className?: string;
}

/**
 * Small "AI" tag next to a verdict that was set by a model. Hover or focus shows the warning;
 * the text is also in the DOM (visually hidden until shown) so screen readers read it.
 */
export function AiTag({ className }: Props) {
  return (
    <span className={cn('ai-tag group relative inline-flex shrink-0', className)}>
      <span
        tabIndex={0}
        role="note"
        aria-label={`AI-bedömning. ${AI_TAG_WARNING}`}
        className="inline-flex h-[18px] items-center border border-foreground px-1.5 text-[0.6875rem] font-bold leading-none tracking-wider text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        AI
      </span>
      {/* Pinned to the viewport (16px gutters, centred, at most 20rem) so the anchor position never
          matters; vertically it keeps its static position, just below the tag, because top stays auto. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-4 z-20 mx-auto mt-6 hidden max-w-xs border border-foreground bg-background p-2 text-xs font-normal leading-snug text-foreground shadow-md group-hover:block group-focus-within:block"
      >
        {AI_TAG_WARNING}
      </span>
    </span>
  );
}
