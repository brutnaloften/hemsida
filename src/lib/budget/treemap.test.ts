import { describe, expect, it } from 'vitest';
import { years } from '@/lib/budget/data';
import {
  FRAME_ASPECT,
  labelTier,
  labelTierFor,
  layoutBalance,
  layoutTreemap,
  rectPx,
  type Placed,
} from '@/lib/budget/treemap';
import { buildBalance, buildSpendingTree, splitChildren } from '@/lib/budget/view';

const area = (p: Placed) => p.rect.w * p.rect.h;

function expectFills(placed: Placed[], values: Map<string, number>, total: number) {
  expect(placed.reduce((s, p) => s + area(p), 0)).toBeCloseTo(1, 6);
  for (const p of placed) {
    expect(p.rect.x).toBeGreaterThanOrEqual(-1e-9);
    expect(p.rect.y).toBeGreaterThanOrEqual(-1e-9);
    expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(1 + 1e-9);
    expect(area(p)).toBeCloseTo(values.get(p.id)! / total, 6);
  }
}

describe('layoutTreemap', () => {
  it('fills the frame with areas proportional to values, in size order', () => {
    const items = [
      { id: 'b', value: 30 },
      { id: 'a', value: 50 },
      { id: 'c', value: 20 },
      { id: 'zero', value: 0 },
    ];
    const placed = layoutTreemap(items, FRAME_ASPECT.landscape);
    expect(placed.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expectFills(placed, new Map(items.map((i) => [i.id, i.value])), 100);
  });

  it('is stable for ties and handles degenerate input', () => {
    const tie = [
      { id: 'y', value: 5 },
      { id: 'x', value: 5 },
    ];
    expect(layoutTreemap(tie, 1).map((p) => p.id)).toEqual(['x', 'y']);
    expect(layoutTreemap([], 1)).toEqual([]);
    const single = layoutTreemap([{ id: 'only', value: 3 }], 1)[0].rect;
    expect(single).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('lays out the real 2025 UO view in both frames', () => {
    const view = splitChildren(buildSpendingTree(2025));
    const items = view.boxes.map((b) => ({ id: b.id, value: b.value! }));
    const values = new Map(items.map((i) => [i.id, i.value]));
    for (const aspect of Object.values(FRAME_ASPECT)) {
      expectFills(layoutTreemap(items, aspect), values, view.base);
    }
  });
});

describe('layoutBalance', () => {
  it('draws both columns at the same scale for every year', () => {
    for (const year of years) {
      const b = buildBalance(year);
      const layout = layoutBalance(b);
      // Equal totals and equal frames give the same area per mdkr on both sides.
      expect(Math.abs(b.out.total - b.in.total)).toBeLessThan(0.1);
      for (const frame of ['portrait', 'landscape'] as const) {
        for (const side of ['out', 'in'] as const) {
          const col = b[side];
          const values = new Map(col.items.map((i) => [i.id, i.value!]));
          expectFills(layout[frame][side], values, col.total);
        }
      }
    }
  });

  it('puts the saldo box as a full-width strip at the bottom', () => {
    const b = buildBalance(2020);
    const placed = layoutBalance(b).landscape.in.find((p) => p.id === 'saldo')!;
    expect(placed.rect.w).toBe(1);
    expect(placed.rect.y + placed.rect.h).toBeCloseTo(1, 9);
  });
});

describe('label tiers', () => {
  it('follows the P4 thresholds', () => {
    expect(labelTier(120, 64)).toBe('full');
    expect(labelTier(119, 64)).toBe('name');
    expect(labelTier(64, 36)).toBe('name');
    expect(labelTier(63, 36)).toBe('value');
    expect(labelTier(36, 22)).toBe('value');
    expect(labelTier(35, 22)).toBe('none');
    expect(labelTier(200, 21)).toBe('none');
  });
  it('converts rects to pixels at the reference width', () => {
    const rect = { x: 0, y: 0, w: 0.5, h: 0.5 };
    expect(rectPx(rect, 'portrait')).toEqual({ w: 180, h: 240 });
    expect(labelTierFor(rect, 'landscape')).toBe('full');
    expect(labelTierFor({ x: 0, y: 0, w: 0.01, h: 0.01 }, 'portrait')).toBe('none');
  });
});
