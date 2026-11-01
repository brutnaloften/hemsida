import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import {
  labelTier,
  type Frame,
  type LabelTier,
  type Placed,
  type Rect,
} from '@/lib/budget/treemap';
import type { BudgetNode } from '@/lib/budget/core';
import type { OpenHandler } from '@/components/budget/types';

/** One box of a treemap: what to say and where it sits in both frames. */
export type Box = {
  node: BudgetNode;
  /** Value line of the label, e.g. "11,7 %". */
  value: string;
  /** Full accessible name (P7). */
  aria: string;
  /** Link boxes are tabbable; saldo and övriga poster are plain boxes. */
  link: boolean;
  rects: Record<Frame, Rect>;
  tiers: Record<Frame, LabelTier>;
};

export type Layouts = Record<Frame, Placed[]>;
/** Pixel width of the container per frame, used for label tiers at build time (P4). */
export type FrameWidths = Record<Frame, number>;

/**
 * Boxes in size order (the order of the portrait layout), with label tiers from the pixel size the
 * rects have in a container `widths[frame]` wide and `aspect[frame]` (width / height) in shape.
 */
export function makeBoxes(
  nodes: BudgetNode[],
  layouts: Layouts,
  aspect: Record<Frame, number>,
  widths: FrameWidths,
  describe: (node: BudgetNode) => Pick<Box, 'value' | 'aria' | 'link'>,
): Box[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rectOf = (frame: Frame, id: string): Rect =>
    layouts[frame].find((p) => p.id === id)?.rect ?? { x: 0, y: 0, w: 0, h: 0 };
  return layouts.portrait.flatMap(({ id }): Box[] => {
    const node = byId.get(id);
    if (!node) return [];
    const rects = { portrait: rectOf('portrait', id), landscape: rectOf('landscape', id) };
    const tier = (frame: Frame) =>
      labelTier(rects[frame].w * widths[frame], (rects[frame].h * widths[frame]) / aspect[frame]);
    return [
      {
        node,
        ...describe(node),
        rects,
        tiers: { portrait: tier('portrait'), landscape: tier('landscape') },
      },
    ];
  });
}

type CssVars = CSSProperties & Record<`--${string}`, string | number>;

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

// Fills alternate by index in size order (P6). Literal class names so Tailwind finds them.
const FILLS = {
  out: ['bg-budget-out-1', 'bg-budget-out-2', 'bg-budget-out-3', 'bg-budget-out-4'],
  in: ['bg-budget-in-1', 'bg-budget-in-2', 'bg-budget-in-3', 'bg-budget-in-4'],
} as const;

function fillFor(node: BudgetNode, index: number, side: 'out' | 'in'): string {
  if (node.kind === 'saldo') return 'budget-hatch border border-budget-hatch/60 bg-background';
  if (node.kind === 'other' || node.kind === 'smaller')
    return 'border border-dotted border-budget-hatch bg-budget-other';
  return FILLS[side][index % 4];
}

/** Classes that show a label part per frame: mobile (portrait) below 640 px, landscape from it. */
function nameClass(p: LabelTier, l: LabelTier): string {
  const base = p === 'full' ? 'line-clamp-2' : p === 'name' ? 'line-clamp-1' : 'hidden';
  const sm = l === 'full' ? 'sm:line-clamp-2' : l === 'name' ? 'sm:line-clamp-1' : 'sm:hidden';
  return `${base} ${sm}`;
}

function valueClass(p: LabelTier, l: LabelTier): string {
  const show = (t: LabelTier) => t !== 'none';
  return `${show(p) ? 'block' : 'hidden'} ${show(l) ? 'sm:block' : 'sm:hidden'}`;
}

type TreemapProps = {
  /** Accessible name of the list, e.g. "Utgifter 2025, största först". */
  label: string;
  boxes: Box[];
  side: 'out' | 'in';
  /** Width / height of the container per frame. */
  aspect: Record<Frame, number>;
  onOpen?: OpenHandler;
};

/**
 * Absolutely positioned boxes in a container with a fixed aspect ratio (P4). Both frames are in
 * the markup as CSS custom properties; a media query at 640 px picks the landscape one. Each box
 * is inset by 1 px, which gives the 2 px gap between neighbours.
 */
export function Treemap({ label, boxes, side, aspect, onOpen }: TreemapProps) {
  const style: CssVars = { '--ar': aspect.portrait, '--lar': aspect.landscape };
  return (
    <ul
      role="list"
      aria-label={label}
      className="relative m-0 w-full list-none p-0 aspect-(--ar) sm:aspect-(--lar)"
      style={style}
    >
      {boxes.map(({ node, value, aria, link, rects, tiers }, index) => {
        const p = rects.portrait;
        const l = rects.landscape;
        const liStyle: CssVars = {
          '--x': pct(p.x),
          '--y': pct(p.y),
          '--w': pct(p.w),
          '--h': pct(p.h),
          '--lx': pct(l.x),
          '--ly': pct(l.y),
          '--lw': pct(l.w),
          '--lh': pct(l.h),
        };
        const boxClass = cn(
          'absolute inset-px flex flex-col overflow-hidden rounded-sm p-1.5 text-left text-budget-box-foreground',
          fillFor(node, index, side),
          node.kind === 'saldo' && 'p-1 sm:p-1.5',
        );
        const content = (
          <span aria-hidden="true" className="flex min-h-0 flex-col gap-0.5 text-xs leading-tight">
            {node.kind !== 'saldo' && (
              <span
                className={cn(
                  'font-semibold break-words sm:text-sm',
                  nameClass(tiers.portrait, tiers.landscape),
                )}
              >
                {node.shortName ?? node.name}
              </span>
            )}
            <span
              className={cn(
                'tabular-nums',
                node.kind === 'saldo' && 'whitespace-nowrap max-sm:text-[10.5px]',
                valueClass(tiers.portrait, tiers.landscape),
              )}
            >
              {value}
            </span>
          </span>
        );
        return (
          <li
            key={node.id}
            className="absolute top-(--y) left-(--x) h-(--h) w-(--w) sm:top-(--ly) sm:left-(--lx) sm:h-(--lh) sm:w-(--lw)"
            style={liStyle}
          >
            {link ? (
              <a
                href={node.href}
                aria-label={aria}
                title={aria}
                onClick={onOpen ? (e) => onOpen(node, e) : undefined}
                className={cn(
                  boxClass,
                  'outline-offset-[-2px] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring dark:hover:brightness-115',
                )}
              >
                {content}
              </a>
            ) : (
              <div className={boxClass} title={aria}>
                <span className="sr-only">{aria}</span>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
