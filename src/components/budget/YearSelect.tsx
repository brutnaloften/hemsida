import { useId } from 'react';

export type YearOption = { year: number; preliminary: boolean };

/** Native select, newest first (P9). */
export function YearSelect({
  years,
  value,
  onChange,
}: {
  years: YearOption[];
  value: number;
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
              {y.preliminary ? ' (preliminärt)' : ''}
            </option>
          ))}
      </select>
    </div>
  );
}
