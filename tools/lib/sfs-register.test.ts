import { describe, expect, it } from 'vitest';
import {
  matchingLaws,
  parseForarbeten,
  parseIkraft,
  parseRegisterPage,
  parseSearchResults,
  sfsDocUrl,
  sfsKey,
} from './sfs-register.ts';
import { ADV_SEARCH_HTML, CYBERSAKERHETSLAG_HTML, SKOLLAG_HTML } from './sfs-register.fixtures.ts';

describe('parseSearchResults', () => {
  it('returns the base act numbers of the hits', () => {
    expect(parseSearchResults(ADV_SEARCH_HTML)).toEqual(['2010:800', '2009:400']);
  });
});

describe('parseRegisterPage', () => {
  const skollag = parseRegisterPage(SKOLLAG_HTML);

  it('reads the base act header', () => {
    expect(skollag.base.sfs).toBe('2010:800');
    expect(skollag.base.title).toBe('Skollag (2010:800)');
    expect(skollag.base.ikraft).toBe('2010-08-01');
    expect(skollag.base.forarbeten.props).toEqual(['2009/10:165']);
  });

  it('reads an amendment with Rubrik, Omfattning, Ikraft and Förarbeten', () => {
    const a = skollag.amendments.find((x) => x.sfs === '2025:625')!;
    expect(a.title).toBe('Lag (2025:625) om ändring i skollagen (2010:800)');
    expect(a.omfattning).toBe('ändr. 1 kap. 12 §; nytt 6 a kap.');
    expect(a.ikraft).toBe('2025-07-01');
    expect(a.forarbeten.props).toEqual(['2024/25:160']);
    expect(a.forarbeten.bets).toEqual(['2024/25:UbU21']);
    expect(a.forarbeten.rskr).toEqual(['2024/25:226']);
  });

  it('reads a new base act page (Cybersäkerhetslag)', () => {
    const page = parseRegisterPage(CYBERSAKERHETSLAG_HTML);
    expect(page.amendments).toEqual([]);
    expect(page.base.sfs).toBe('2025:1506');
    expect(page.base.title).toBe('Cybersäkerhetslag (2025:1506)');
    expect(page.base.ikraft).toBe('2026-01-15');
    expect(page.base.forarbeten.props).toEqual(['2025/26:28']);
    expect(page.base.forarbeten.bets).toEqual(['2025/26:FöU2']);
    expect(page.base.forarbeten.rskr).toEqual(['2025/26:113']);
    expect(page.base.forarbeten.other).toEqual(['direktiv (EU) 2022/2555']);
  });

  it('throws on a page that is not a register page', () => {
    expect(() => parseRegisterPage('<html></html>')).toThrow();
  });
});

describe('matchingLaws', () => {
  const resolve = (ref: string) => (ref === '2024/25:160' ? 'HC03160' : undefined);

  it('matches Prop. 2024/25:160 to SFS 2025:625 and the multi-prop amendments, not to rskr', () => {
    const page = parseRegisterPage(SKOLLAG_HTML);
    const laws = matchingLaws(page, '2024/25:160', resolve);
    expect(laws.map((l) => l.sfs).sort()).toEqual(['2025:625', '2025:729', '2025:730']);
    const l = laws.find((x) => x.sfs === '2025:625')!;
    expect(l.props).toEqual(['HC03160']);
    expect(l.base_sfs).toBe('2010:800');
    expect(l.url).toBe('https://svenskforfattningssamling.se/doc/2025625.html');
    // SFS 2025:999 cites rskr. 2024/25:160 and Prop. 2024/25:161: not a match.
    expect(laws.map((x) => x.sfs)).not.toContain('2025:999');
  });

  it('matches a new base act through its own header', () => {
    const page = parseRegisterPage(CYBERSAKERHETSLAG_HTML);
    const laws = matchingLaws(page, '2025/26:28', () => 'HD0328');
    expect(laws).toHaveLength(1);
    expect(laws[0]!.sfs).toBe('2025:1506');
    expect(laws[0]!.base_sfs).toBe('2025:1506');
  });
});

describe('parseForarbeten', () => {
  it('attaches each reference to the keyword before it', () => {
    const f = parseForarbeten(
      'Prop. 2024/25:143 och prop. 2024/25:160, bet. 2024/25:UbU17, rskr. 2024/25:289',
    );
    expect(f.props).toEqual(['2024/25:143', '2024/25:160']);
    expect(f.bets).toEqual(['2024/25:UbU17']);
    expect(f.rskr).toEqual(['2024/25:289']);
  });

  it('does not read rskr. or bet. numbers as propositions', () => {
    const f = parseForarbeten('Prop. 2024/25:161, bet. 2024/25:UbU22, rskr. 2024/25:160');
    expect(f.props).toEqual(['2024/25:161']);
  });

  it('handles a bare leading number, odd spacing and EU references', () => {
    expect(
      parseForarbeten('2023/24:164 och prop. 2023/24:166, bet. 2024/25:UbU4,  rskr. 2024/25:40')
        .props,
    ).toEqual(['2023/24:166']);
    const f = parseForarbeten(
      'Prop. 2013/14:112, prop. 2013/14:191, bet. 2013/14:UbU22, rskr.2013/14:291, rådets direktiv 2005/36/EG',
    );
    expect(f.props).toEqual(['2013/14:112', '2013/14:191']);
    expect(f.rskr).toEqual(['2013/14:291']);
    expect(f.other).toEqual(['rådets direktiv 2005/36/EG']);
  });

  it('collects several bets and ignores a bet without riksmöte', () => {
    const f = parseForarbeten(
      'Prop. 2016/17:156, bet. 2016/17:UbU22 och bet. 2016/17:UbU23, rskr. 2016/17:339',
    );
    expect(f.bets).toEqual(['2016/17:UbU22', '2016/17:UbU23']);
    expect(parseForarbeten('Prop. 2010/11:94, bet. UbU16, rskr. 2010/11:304').bets).toEqual([]);
  });
});

describe('helpers', () => {
  it('keeps the earliest of several Ikraft dates', () => {
    expect(parseIkraft('2026-01-15 överg.best.')).toBe('2026-01-15');
    expect(parseIkraft('2026-07-01, 2026-03-01')).toBe('2026-03-01');
    expect(parseIkraft('den dag regeringen bestämmer')).toBeNull();
  });

  it('builds keys and urls', () => {
    expect(sfsKey('2025:625')).toBe('sfs-2025-625');
    expect(sfsDocUrl('2025:625')).toBe('https://svenskforfattningssamling.se/doc/2025625.html');
  });
});
