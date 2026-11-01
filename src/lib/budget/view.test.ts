import { describe, expect, it } from 'vitest';
import { activeAnslag, anslagForUo, areas, totalsForYear, years } from '@/lib/budget/data';
import {
  STAT_LEVEL,
  anslagSlug,
  buildBalance,
  buildRevenueTree,
  buildSpendingTree,
  findNode,
  hrefFor,
  idForPath,
  pathForId,
  pathTo,
  splitChildren,
  type BudgetNode,
} from '@/lib/budget/view';

const TOL = 0.1;
const opts = { base: '/hemsida/' };

/** Every node that has children, with its year, for the invariants that must hold for all of them. */
function groups(root: BudgetNode): BudgetNode[] {
  const out: BudgetNode[] = [];
  const walk = (n: BudgetNode) => {
    if (n.children?.length) {
      out.push(n);
      n.children.forEach(walk);
    }
  };
  walk(root);
  return out;
}

describe('trees', () => {
  it('has the expected shape for 2025', () => {
    const spending = buildSpendingTree(2025, opts);
    expect(spending.children).toHaveLength(27);
    expect(findNode(spending, 'uo:9')?.href).toBe('/hemsida/budget/stat/utgifter/9/');
    expect(findNode(spending, 'anslag:0901011')?.href).toBe(
      '/hemsida/budget/stat/utgifter/9/1-11/',
    );
    expect(findNode(spending, 'anslag:0501003 2024')?.href).toBe(
      '/hemsida/budget/stat/utgifter/5/1-3-2024/',
    );

    const revenue = buildRevenueTree(2025, opts);
    expect(revenue.children?.map((c) => c.id)).toEqual([
      'rev:skatter',
      'rev:2000',
      'rev:3000',
      'rev:4000',
      'rev:5000',
      'rev:6000',
    ]);
    const skatter = findNode(revenue, 'rev:skatter')!;
    expect(skatter.name).toBe('Skatter, netto');
    expect(skatter.children?.map((c) => c.id)).toContain('rev:1100');
    expect(skatter.children?.map((c) => c.id)).toContain('rev:7200');
    expect(findNode(revenue, 'rev:1140-1160')?.href).toBe(
      '/hemsida/budget/stat/inkomster/1140-1160/',
    );
  });

  it('has the same ids in every year', () => {
    const ids = (r: BudgetNode) =>
      groups(r)
        .map((g) => g.id)
        .join();
    expect(ids(buildSpendingTree(2006))).toBe(ids(buildSpendingTree(2025)));
    expect(ids(buildRevenueTree(2006))).toBe(ids(buildRevenueTree(2025)));
  });

  it('matches the official totals for every year', () => {
    for (const year of years) {
      const t = totalsForYear(year);
      expect(Math.abs(buildSpendingTree(year).value! - t.uoSum)).toBeLessThan(TOL);
      expect(Math.abs(buildRevenueTree(year).value! - t.inkomster)).toBeLessThan(TOL);
    }
  });

  it('keeps Skatter, netto positive in every year', () => {
    for (const year of years) {
      const skatter = findNode(buildRevenueTree(year), 'rev:skatter')!;
      expect(skatter.value, String(year)).toBeGreaterThan(0);
    }
  });

  it('returns the root-to-node chain', () => {
    const root = buildRevenueTree(2025);
    expect(pathTo(root, 'rev:1111')?.map((n) => n.id)).toEqual([
      'root:inkomster',
      'rev:skatter',
      'rev:1100',
      'rev:1110',
      'rev:1111',
    ]);
    expect(pathTo(root, 'rev:nope')).toBeUndefined();
  });
});

describe('splitChildren', () => {
  it('splits boxes, strip and table, and the parts add up to the node, in every year', () => {
    for (const year of years) {
      for (const root of [buildSpendingTree(year), buildRevenueTree(year)]) {
        for (const node of groups(root)) {
          for (const group of [false, true]) {
            const v = splitChildren(node, { group });
            const boxSum = v.boxes.reduce((s, b) => s + b.value!, 0);
            expect(
              Math.abs(boxSum + v.stripTotal - node.value!),
              `${year} ${node.id}`,
            ).toBeLessThan(TOL);
            expect(v.boxes.every((b) => b.value! > 0)).toBe(true);
            expect(v.strip.every((b) => b.value! < 0)).toBe(true);
            expect(v.table.every((b) => !b.value)).toBe(true);
            expect(v.boxes.length + v.strip.length + v.table.length).toBeLessThanOrEqual(
              node.children!.length,
            );
          }
        }
      }
    }
  });

  it('also holds inside the grouped "Mindre poster" nodes', () => {
    for (const year of years) {
      for (const node of groups(buildSpendingTree(year))) {
        const smaller = splitChildren(node).boxes.find((b) => b.kind === 'smaller');
        if (!smaller) continue;
        const inner = splitChildren(smaller);
        const sum = inner.boxes.reduce((s, b) => s + b.value!, 0);
        expect(Math.abs(sum - smaller.value!)).toBeLessThan(TOL);
        expect(inner.strip).toHaveLength(0);
      }
    }
  });

  it('groups children under 1 % into "Mindre poster (N st)" from three items', () => {
    const view = splitChildren(
      buildSpendingTree(2025, opts).children!.find((c) => c.id === 'uo:16')!,
    );
    const smaller = view.boxes.find((b) => b.kind === 'smaller')!;
    expect(smaller).toBeDefined();
    expect(smaller.name).toBe(`Mindre poster (${smaller.children!.length} st)`);
    expect(smaller.children!.length).toBeGreaterThanOrEqual(3);
    expect(smaller.href).toBe('/hemsida/budget/stat/utgifter/16/?mindre=1');
    for (const c of smaller.children!) expect(c.value! / view.base).toBeLessThan(0.01);
    for (const b of view.boxes.filter((b) => b.kind !== 'smaller')) {
      expect(b.value! / view.base).toBeGreaterThanOrEqual(0.01);
    }
  });

  it('does not group when fewer than three are small', () => {
    const node: BudgetNode = {
      id: 'x',
      name: 'x',
      href: '',
      value: 100,
      children: [
        { id: 'a', name: 'a', href: '', value: 98.5 },
        { id: 'b', name: 'b', href: '', value: 0.8 },
        { id: 'c', name: 'c', href: '', value: 0.7 },
      ],
    };
    expect(splitChildren(node).boxes.map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(
      splitChildren({
        ...node,
        children: [...node.children!, { id: 'd', name: 'd', href: '', value: 0.5 }],
      }).boxes.map((b) => b.id),
    ).toEqual(['a', 'smaller:x']);
  });

  it('puts negative children in the strip: Skatter, netto 2025', () => {
    const skatter = findNode(buildRevenueTree(2025), 'rev:skatter')!;
    const v = splitChildren(skatter, { group: false });
    expect(v.strip.map((s) => s.id)).toEqual(
      expect.arrayContaining(['rev:1700', 'rev:1800', 'rev:1900', 'rev:7200']),
    );
    expect(v.boxes.map((s) => s.id)).toEqual(expect.arrayContaining(['rev:1100', 'rev:7100']));
    expect(Math.abs(v.base - 2714400)).toBeLessThan(1000);
  });
});

describe('buildBalance', () => {
  it('balances in every year: both columns total the same and the headline equals totalsForYear', () => {
    for (const year of years) {
      const b = buildBalance(year);
      const t = totalsForYear(year);
      expect(b.totals).toEqual(t);
      expect(Math.abs(b.out.total - b.in.total), String(year)).toBeLessThan(TOL);
      for (const col of [b.out, b.in]) {
        expect(col.items.every((i) => i.value! > 0)).toBe(true);
        expect(Math.abs(col.items.reduce((s, i) => s + i.value!, 0) - col.total)).toBeLessThan(TOL);
      }
    }
  });

  it('reproduces the official saldo from the boxes', () => {
    for (const year of years) {
      const b = buildBalance(year);
      const raw = (items: BudgetNode[]) =>
        items.filter((i) => i.kind !== 'saldo').reduce((s, i) => s + i.value!, 0);
      // outRaw - inRaw = (posUO + ö) - (posRev) with ö moved across sign = utgifter - inkomster.
      expect(
        Math.abs(raw(b.out.items) - raw(b.in.items) + b.totals.saldo),
        String(year),
      ).toBeLessThan(TOL);
    }
  });

  it('puts the saldo box on the correct side', () => {
    const deficit = buildBalance(2020);
    expect(deficit.saldo.name).toBe('Underskott');
    expect(deficit.in.items.at(-1)).toBe(deficit.saldo);
    expect(deficit.out.items).not.toContain(deficit.saldo);
    const surplus = buildBalance(2022);
    expect(surplus.saldo.name).toBe('Överskott');
    expect(surplus.out.items.at(-1)).toBe(surplus.saldo);
    expect(surplus.saldo.value!).toBeCloseTo(totalsForYear(2022).saldo, 1);
  });

  it('places Övriga poster on the side where it is positive', () => {
    // 2021 and 2022: nettoutlåning about -100 mdkr, so it reduces utgifter and sits on the inkomster side.
    for (const year of [2021, 2022]) {
      const b = buildBalance(year);
      expect(b.ovriga?.name).toBe('Övriga poster (minskar utgifterna)');
      expect(b.in.items).toContain(b.ovriga);
    }
    const b2025 = buildBalance(2025);
    expect(b2025.ovriga).not.toBeNull();
    const side = b2025.out.items.includes(b2025.ovriga!) ? 'out' : 'in';
    expect(side).toBe('out');
  });
});

describe('slugs and ids', () => {
  it('round-trips every anslag, including multi-digit numbers and suffixed codes', () => {
    let count = 0;
    for (const u of areas) {
      for (const a of anslagForUo(u.nr)) {
        const id = `anslag:${a.kod}`;
        const p = pathForId(id)!;
        expect(p.side).toBe('utgifter');
        expect(p.segments).toEqual([String(u.nr), anslagSlug(a)]);
        expect(idForPath('utgifter', p.segments), id).toBe(id);
        count++;
      }
    }
    expect(count).toBeGreaterThan(activeAnslag().length);
    expect(pathForId('anslag:0901011')?.segments).toEqual(['9', '1-11']);
    expect(pathForId('anslag:1710001')?.segments).toEqual(['17', '10-1']);
    expect(pathForId('anslag:013202 2007')?.segments).toEqual(['1', '013202-2007']);
    expect(pathForId('anslag:0501003 2024')?.segments).toEqual(['5', '1-3-2024']);
  });

  it('round-trips every utgiftsområde', () => {
    for (const u of areas) {
      const id = `uo:${u.nr}`;
      expect(idForPath('utgifter', pathForId(id)!.segments)).toBe(id);
    }
    expect(idForPath('utgifter', ['28'])).toBeUndefined();
    expect(idForPath('utgifter', ['9', '99-99'])).toBeUndefined();
  });

  it('round-trips every revenue node including range codes', () => {
    const ids = groups(buildRevenueTree(2025)).map((g) => g.id);
    expect(ids).toContain('rev:1140-1160');
    const leaves: string[] = [];
    const walk = (n: BudgetNode) => (n.children ? n.children.forEach(walk) : leaves.push(n.id));
    walk(buildRevenueTree(2025));
    for (const id of [...ids, ...leaves].filter((i) => i.startsWith('rev:'))) {
      const p = pathForId(id)!;
      expect(p.side).toBe('inkomster');
      expect(idForPath('inkomster', p.segments), id).toBe(id);
    }
    expect(pathForId('rev:1140-1160')?.segments).toEqual(['1140-1160']);
    expect(idForPath('inkomster', ['skatter'])).toBe('rev:skatter');
    expect(idForPath('inkomster', ['9999'])).toBeUndefined();
  });

  it('builds hrefs from the base and level', () => {
    expect(hrefFor('utgifter', ['9'], opts)).toBe('/hemsida/budget/stat/utgifter/9/');
    expect(hrefFor('inkomster', [], { base: '/' })).toBe('/budget/stat/inkomster/');
    expect(hrefFor('utgifter', [], { base: '/x', level: { ...STAT_LEVEL, id: 'kommun' } })).toBe(
      '/x/budget/kommun/utgifter/',
    );
  });
});
