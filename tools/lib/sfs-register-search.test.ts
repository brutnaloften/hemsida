import { describe, expect, it } from 'vitest';
import { collectSearchHits, parseForarbeten } from './sfs-register.ts';
import { DIRECT_HIT_HTML } from './sfs-register.fixtures.ts';

describe('collectSearchHits', () => {
  const listHtml = (n: number, total: number, from = 0) =>
    `<div class="search-results-main">Totalt <strong>${total}</strong> träffar` +
    Array.from({ length: n }, (_, i) => `<div>SFS-nummer: 2000:${from + i + 1}</div>`).join('') +
    '</div>';

  it('reads a last page with one remaining hit as that act’s register page', async () => {
    const r = await collectSearchHits(listHtml(30, 31), async () => DIRECT_HIT_HTML);
    expect(r.bases).toHaveLength(30);
    expect(r.direct.map((p) => p.base.sfs)).toEqual(['2005:716']);
    expect(r.total).toBe(31);
  });

  it('reads all list pages and throws when the hits do not add up', async () => {
    const r = await collectSearchHits(listHtml(30, 45), async () => listHtml(15, 45, 30));
    expect(r.bases).toHaveLength(45);
    await expect(
      collectSearchHits(listHtml(30, 45), async () => listHtml(10, 45, 30)),
    ).rejects.toThrow(/45 hits but 40/);
  });

  it('handles a single hit and no hits', async () => {
    const one = await collectSearchHits(DIRECT_HIT_HTML, async () => '');
    expect(one.direct).toHaveLength(1);
    expect((await collectSearchHits('<div>Inga träffar</div>', async () => '')).total).toBe(0);
  });
});

describe('parseForarbeten, continuation only after a prop number', () => {
  it('does not turn "avsnitt 5 och 6" into a proposition', () => {
    const f = parseForarbeten('Prop. 2023/24:99 avsnitt 5 och 6, bet. 2023/24:SkU1');
    expect(f.props).toEqual(['2023/24:99']);
  });
});
