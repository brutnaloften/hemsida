/**
 * Swedish number formatting for the budget explorer (docs/design/budget-explorer.md P4, P8).
 * Hand-rolled instead of Intl so the output is identical in every runtime (build, browser, tests):
 * comma as decimal separator, non-breaking space as thousands separator and before units, and the
 * real minus sign (U+2212). Amounts in are mn kr unless stated.
 */

const NBSP = ' ';
const MINUS = '−';

/** Group the integer digits in threes with non-breaking spaces. */
function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Round half away from zero at `decimals`, avoiding binary-representation surprises like 1.005. */
function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return (Math.sign(v) * Math.round(Math.abs(v) * f * (1 + Number.EPSILON))) / f;
}

/** "1 405,8" / "−3,5" / "12". No unit. */
export function formatNumber(value: number, decimals = 0): string {
  const r = roundTo(value, decimals);
  const [int, frac] = Math.abs(r).toFixed(decimals).split('.');
  const body = group(int) + (frac ? `,${frac}` : '');
  return r < 0 ? MINUS + body : body;
}

/**
 * A share (0.123 is 12,3 %) with one decimal. Non-zero shares that round to zero read "< 0,1 %".
 * Negative shares keep their sign.
 */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return `–${NBSP}%`;
  const pct = fraction * 100;
  if (pct !== 0 && roundTo(pct, 1) === 0) {
    return pct > 0 ? `<${NBSP}0,1${NBSP}%` : `>${NBSP}${MINUS}0,1${NBSP}%`;
  }
  return `${formatNumber(pct, 1)}${NBSP}%`;
}

/** mn kr as miljarder kronor: "1 405,8 mdkr". Non-zero amounts that round to zero read "< 0,1 mdkr". */
export function formatMdkr(mnKr: number, decimals = 1): string {
  const mdkr = mnKr / 1000;
  if (mdkr !== 0 && roundTo(mdkr, decimals) === 0) {
    const lim = formatNumber(10 ** -decimals, decimals);
    return mdkr > 0 ? `<${NBSP}${lim}${NBSP}mdkr` : `>${NBSP}${MINUS}${lim}${NBSP}mdkr`;
  }
  return `${formatNumber(mdkr, decimals)}${NBSP}mdkr`;
}

/** mn kr: "420 mn kr". */
export function formatMnKr(mnKr: number, decimals = 0): string {
  return `${formatNumber(mnKr, decimals)}${NBSP}mn${NBSP}kr`;
}

/** mdkr from 1 000 mn kr upwards, whole mn kr below, so small anslag do not show as "0,0 mdkr". */
export function formatAmount(mnKr: number): string {
  return Math.abs(mnKr) >= 1000 ? formatMdkr(mnKr) : formatMnKr(mnKr);
}

/**
 * Kronor rounded to `step` (10 per box, 100 for a total, P8). Amounts under one step read
 * "< 10 kr". No "≈": the caller adds it where the copy needs it.
 */
export function formatKr(kr: number, step = 10): string {
  if (kr === 0) return `0${NBSP}kr`;
  if (Math.abs(kr) < step) return `<${NBSP}${formatNumber(step)}${NBSP}kr`;
  return `${formatNumber(Math.round(kr / step) * step)}${NBSP}kr`;
}

/** Share of `part` in `base`, 0 when the base is zero. */
export function shareOf(part: number, base: number): number {
  return base === 0 ? 0 : part / base;
}
