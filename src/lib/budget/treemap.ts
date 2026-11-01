/**
 * Treemap layout for the budget explorer (docs/design/budget-explorer.md P2, P4): squarified
 * layouts for the portrait 3:4 and landscape 16:9 frames, the balance view columns, and label
 * tiers. Rects are fractions (0-1) of the frame, so the markup can use percentages and the same
 * function runs at build time and in the island. Pure: no React, no Astro.
 */
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import type { Balance, BalanceColumn, BudgetNode } from '@/lib/budget/view';

export type Frame = 'portrait' | 'landscape';

/** Width / height of each frame. Portrait is used below 640 px, landscape from 640 px. */
export const FRAME_ASPECT: Readonly<Record<Frame, number>> = {
  portrait: 3 / 4,
  landscape: 16 / 9,
};

/** Container widths used to turn rects into pixels for label tiers at build time (P4). */
export const REFERENCE_WIDTH: Readonly<Record<Frame, number>> = {
  portrait: 360,
  landscape: 1100,
};

/** Squarify target ratio, between 1.5 and 1.618 per the design. */
const SQUARIFY_RATIO = 1.618;

export type Rect = { x: number; y: number; w: number; h: number };
export type Placed = { id: string; rect: Rect };
export type LayoutItem = { id: string; value: number };

/**
 * Squarified layout of the items with a positive value inside a frame of the given aspect ratio
 * (width / height). Largest first, ties by id, so the result is stable across years. Areas are
 * proportional to values and fill the frame exactly. The output order is the size order.
 */
export function layoutTreemap(items: LayoutItem[], aspect: number): Placed[] {
  const positive = items.filter((i) => i.value > 0);
  if (positive.length === 0) return [];
  const H = 1000;
  const W = aspect * H;
  const root = hierarchy<{ id: string; value: number; children?: LayoutItem[] }>({
    id: '',
    value: 0,
    children: positive,
  })
    .sum((d) => (d.children ? 0 : d.value))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (a.data.id < b.data.id ? -1 : 1));
  const laidOut = treemap<(typeof root)['data']>()
    .tile(treemapSquarify.ratio(SQUARIFY_RATIO))
    .size([W, H])
    .paddingInner(0)
    .round(false)(root);
  return (laidOut.children ?? []).map((n) => ({
    id: n.data.id,
    rect: { x: n.x0 / W, y: n.y0 / H, w: (n.x1 - n.x0) / W, h: (n.y1 - n.y0) / H },
  }));
}

/** Layout of the boxes of a view (`NodeView.boxes`) in both frames. */
export function layoutBoth(items: LayoutItem[]): Record<Frame, Placed[]> {
  return {
    portrait: layoutTreemap(items, FRAME_ASPECT.portrait),
    landscape: layoutTreemap(items, FRAME_ASPECT.landscape),
  };
}

const toItems = (nodes: BudgetNode[]): LayoutItem[] =>
  nodes.map((n) => ({ id: n.id, value: n.value ?? 0 }));

/** Convenience: layout of nodes' values in both frames. */
export function layoutNodes(nodes: BudgetNode[]): Record<Frame, Placed[]> {
  return layoutBoth(toItems(nodes));
}

/**
 * Layout of one balance column inside a frame of the given aspect. The saldo box is a full-width
 * strip at the bottom of its column; everything else is squarified above it. Both columns of a
 * balance have the same total, so the same frame gives the same mdkr per pixel on both sides.
 */
export function layoutColumn(column: BalanceColumn, aspect: number): Placed[] {
  const saldo = column.items.find((i) => i.kind === 'saldo');
  const rest = column.items.filter((i) => i !== saldo);
  const saldoShare = saldo && column.total > 0 ? (saldo.value ?? 0) / column.total : 0;
  const topH = 1 - saldoShare;
  const placed = layoutTreemap(toItems(rest), topH > 0 ? aspect / topH : aspect).map(
    ({ id, rect }): Placed => ({ id, rect: { ...rect, y: rect.y * topH, h: rect.h * topH } }),
  );
  if (saldo && saldoShare > 0) {
    placed.push({ id: saldo.id, rect: { x: 0, y: topH, w: 1, h: saldoShare } });
  }
  return placed;
}

/** Aspect of one balance column: two equal columns side by side fill the frame. */
export function columnAspect(frame: Frame): number {
  return FRAME_ASPECT[frame] / 2;
}

/** Both balance columns in both frames. Rects are relative to their own column. */
export function layoutBalance(balance: Balance): Record<Frame, { out: Placed[]; in: Placed[] }> {
  const frames: Frame[] = ['portrait', 'landscape'];
  const result = {} as Record<Frame, { out: Placed[]; in: Placed[] }>;
  for (const f of frames) {
    const aspect = columnAspect(f);
    result[f] = { out: layoutColumn(balance.out, aspect), in: layoutColumn(balance.in, aspect) };
  }
  return result;
}

// --- Label tiers -------------------------------------------------------------------

/** What a box shows: both lines, name and value on one line each, value only, or nothing. */
export type LabelTier = 'full' | 'name' | 'value' | 'none';

/** Thresholds from P4, in CSS pixels (width x height). */
export function labelTier(wPx: number, hPx: number): LabelTier {
  if (wPx >= 120 && hPx >= 64) return 'full';
  if (wPx >= 64 && hPx >= 36) return 'name';
  if (wPx >= 36 && hPx >= 22) return 'value';
  return 'none';
}

/** Pixel size of a rect when the frame is `widthPx` wide (defaults to the frame's reference width). */
export function rectPx(
  rect: Rect,
  frame: Frame,
  widthPx: number = REFERENCE_WIDTH[frame],
): { w: number; h: number } {
  const heightPx = widthPx / FRAME_ASPECT[frame];
  return { w: rect.w * widthPx, h: rect.h * heightPx };
}

/** Label tier of a rect at the frame's reference width. */
export function labelTierFor(rect: Rect, frame: Frame, widthPx?: number): LabelTier {
  const { w, h } = rectPx(rect, frame, widthPx);
  return labelTier(w, h);
}
