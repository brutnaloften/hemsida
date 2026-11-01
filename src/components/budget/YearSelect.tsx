import { useId } from 'react';

export type YearOption = {
  year: number;
  /** Revenue for the year is not final (ESV Prel1-3). */
  revenuePreliminary: boolean;
  /** Spending for the year is not final. */
  spendingPreliminary: boolean;
};

/** Whether a year is preliminary on one side; without a side (the balance view), on either. */
export function isPreliminary(y: YearOption, side?: 'utgifter' | 'inkomster'): boolean {
  if (side === 'utgifter') return y.spendingPreliminary;
  if (side === 'inkomster') return y.revenuePreliminary;
  return y.revenuePreliminary || y.spendingPreliminary;
}

/** Native select, newest first (P9). */
export function YearSelect({
  years,
  value,
  onChange,
  side,
}: {
  years: YearOption[];
  value: number;
  /** The side of the page; a year is marked preliminary only when that side is. */
  side?: 'utgifter' | 'inkomster';
  onChange: (year: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="font-medium">
        År
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {[...years]
          .sort((a, b) => b.year - a.year)
          .map((y) => (
            <option key={y.year} value={y.year}>
              {y.year}
              {isPreliminary(y, side) ? ' (preliminärt)' : ''}
            </option>
          ))}
      </select>
    </div>
  );
}
