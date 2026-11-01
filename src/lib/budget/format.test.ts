import { describe, expect, it } from 'vitest';
import {
  formatAmountWords,
  formatPercentWords,
  formatAmount,
  formatKr,
  formatMdkr,
  formatMnKr,
  formatNumber,
  formatPercent,
  shareOf,
} from '@/lib/budget/format';

const NBSP = ' ';

describe('formatPercent', () => {
  it('uses a decimal comma and a non-breaking space before %', () => {
    expect(formatPercent(0.123)).toBe(`12,3${NBSP}%`);
    expect(formatPercent(1)).toBe(`100,0${NBSP}%`);
    expect(formatPercent(0)).toBe(`0,0${NBSP}%`);
  });
  it('shows < 0,1 % for non-zero shares that round to zero', () => {
    expect(formatPercent(0.0004)).toBe(`<${NBSP}0,1${NBSP}%`);
    expect(formatPercent(0.001)).toBe(`0,1${NBSP}%`);
  });
  it('keeps the sign of negative shares with a real minus', () => {
    expect(formatPercent(-0.052)).toBe(`−5,2${NBSP}%`);
  });
});

describe('formatMdkr', () => {
  it('groups thousands with non-breaking spaces', () => {
    expect(formatMdkr(1405800)).toBe(`1${NBSP}405,8${NBSP}mdkr`);
    expect(formatMdkr(163500)).toBe(`163,5${NBSP}mdkr`);
    expect(formatMdkr(-101900)).toBe(`−101,9${NBSP}mdkr`);
  });
  it('contains no ordinary spaces', () => {
    expect(formatMdkr(1405800)).not.toContain(' ');
    expect(formatPercent(0.5)).not.toContain(' ');
  });
  it('shows < 0,1 mdkr for tiny non-zero amounts', () => {
    expect(formatMdkr(20)).toBe(`<${NBSP}0,1${NBSP}mdkr`);
    expect(formatMdkr(0)).toBe(`0,0${NBSP}mdkr`);
  });
});

describe('other formats', () => {
  it('formats mn kr and picks the unit automatically', () => {
    expect(formatMnKr(420)).toBe(`420${NBSP}mn${NBSP}kr`);
    expect(formatAmount(420)).toBe(`420${NBSP}mn${NBSP}kr`);
    expect(formatAmount(2500)).toBe(`2,5${NBSP}mdkr`);
  });
  it('rounds kronor to the step and floors small amounts', () => {
    expect(formatKr(9843, 100)).toBe(`9${NBSP}800${NBSP}kr`);
    expect(formatKr(1234)).toBe(`1${NBSP}230${NBSP}kr`);
    expect(formatKr(4)).toBe(`<${NBSP}10${NBSP}kr`);
    expect(formatKr(0)).toBe(`0${NBSP}kr`);
  });
  it('rounds half away from zero', () => {
    expect(formatNumber(1.05, 1)).toBe('1,1');
    expect(formatNumber(2.5)).toBe('3');
  });
  it('computes shares safely', () => {
    expect(shareOf(1, 4)).toBe(0.25);
    expect(shareOf(1, 0)).toBe(0);
  });
});

describe('formatAmountWords', () => {
  it('uses miljarder from 1 000 mn kr and miljoner below', () => {
    expect(formatAmountWords(163500)).toBe('163,5 miljarder kronor');
    expect(formatAmountWords(420)).toBe('420 miljoner kronor');
  });
});

describe('formatPercentWords', () => {
  it('says "mindre än 0,1 procent" for tiny shares', () => {
    expect(formatPercentWords(0.1167)).toBe('11,7 procent');
    expect(formatPercentWords(0.0001)).toBe('mindre än 0,1 procent');
    expect(formatPercentWords(0)).toBe('0,0 procent');
  });
});
