import { cn } from '@/lib/utils';

/** Shown on hover and keyboard focus, and read out as the tag's description. */
export const AI_TAG_WARNING =
  'Den här bedömningen är gjord av en AI-modell (Claude) och har inte granskats av en människa. Den kan innehålla fel. Läs motiveringen och dokumenten och gör din egen bedömning.';

interface Props {
  className?: string;
  /** Open the tooltip below the tag and align it to the right edge (for tags near the page edge). */
  align?: 'left' | 'right';
}

/**
 * Small "AI" tag next to a verdict that was set by a model. Hover or focus shows the warning;
 * the text is also in the DOM (visually hidden until shown) so screen readers read it.
 */
export function AiTag({ className, align = 'left' }: Props) {
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
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none invisible absolute top-full z-20 mt-1 w-64 border border-foreground bg-background p-2 text-xs font-normal leading-snug text-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          align === 'right' ? 'right-0' : 'left-0',
        )}
      >
        {AI_TAG_WARNING}
      </span>
    </span>
  );
}
