import { useId } from 'react';
import { formatNumber } from '@/lib/budget/format';
import { mdkrNumber, summarize, type Line } from '@/lib/budget/series';

const W = 640;
const H = 260;
const M = { top: 12, right: 16, bottom: 28, left: 52 };

export type ChartColumn = { label: string; cells: string[] };

type Props = {
  /** Heading of the figure, e.g. "Utfall över tid". */
  title: string;
  lines: Line[];
  /** Extra table columns aligned on the years of the lines (andel av BNP). */
  extra?: ChartColumn[];
  /** Said under the chart, e.g. "Fasta priser, 2025 års penningvärde." */
  note?: string;
  /** Said under the table. */
  tableNote?: string;
};

/** A "nice" step for about four intervals over `span`. */
function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/**
 * Hand-written SVG line chart (P10): one or more lines over the years with markers; preliminary years
 * get an open marker. The visible text summary and the table inside the figure are the alternative.
 * Amounts in are mn kr, shown as miljarder kronor.
 */
export function TimeSeriesChart({ title, lines, extra = [], note, tableNote }: Props) {
  const id = useId();
  const years = lines[0]?.points.map((p) => p.year) ?? [];
  const values = lines.flatMap((l) => l.points.map((p) => p.value).filter((v) => v !== null));
  if (years.length === 0 || values.length === 0) return null;

  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const step = niceStep(hi - lo || 1);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const x = (i: number) =>
    M.left + (years.length === 1 ? 0 : (i / (years.length - 1)) * (W - M.left - M.right));
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
  const everyOther = years.length > 12 ? 4 : 1;

  const summary = lines.map((l) => summarize(l.name, l)).join(' ');
  const hasPrelim = lines.some((l) => l.points.some((p) => p.preliminary && p.value !== null));

  return (
    <figure className="mt-6" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{summary}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}. ${summary}`}
        className="mt-2 h-auto w-full max-w-3xl text-foreground"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'stroke-foreground/50' : 'stroke-border'}
              strokeWidth={1}
            />
            <text
              x={M.left - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {formatNumber(t / 1000)}
            </text>
          </g>
        ))}
        <text x={M.left - 6} y={8} textAnchor="end" className="fill-muted-foreground text-[11px]">
          mdkr
        </text>
        {years.map((year, i) =>
          i % everyOther === 0 || i === years.length - 1 ? (
            <text
              key={year}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {year}
            </text>
          ) : null,
        )}
        {lines.map((line) => {
          const segments: string[][] = [[]];
          line.points.forEach((p, i) => {
            if (p.value === null) segments.push([]);
            else segments[segments.length - 1].push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
          });
          return (
            <g key={line.name}>
              {segments
                .filter((s) => s.length > 1)
                .map((s, k) => (
                  <polyline
                    key={k}
                    points={s.join(' ')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray={line.dashed ? '6 4' : undefined}
                    strokeLinejoin="round"
                    opacity={line.dashed ? 0.65 : 1}
                  />
                ))}
              {line.points.map((p, i) =>
                p.value === null ? null : (
                  <Marker
                    key={p.year}
                    shape={line.marker}
                    cx={x(i)}
                    cy={y(p.value)}
                    open={p.preliminary}
                    faded={line.dashed}
                  />
                ),
              )}
            </g>
          );
        })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Förklaring">
        {lines.map((line) => (
          <li key={line.name} className="flex items-center gap-2">
            <svg width="30" height="12" aria-hidden="true" className="text-foreground">
              <line
                x1="0"
                x2="30"
                y1="6"
                y2="6"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={line.dashed ? '6 4' : undefined}
                opacity={line.dashed ? 0.65 : 1}
              />
              <Marker shape={line.marker} cx={15} cy={6} open={false} faded={line.dashed} />
            </svg>
            {line.name}
          </li>
        ))}
        {hasPrelim && (
          <li className="flex items-center gap-2">
            <svg width="30" height="12" aria-hidden="true" className="text-foreground">
              <Marker shape="circle" cx={15} cy={6} open />
            </svg>
            Preliminärt år
          </li>
        )}
      </ul>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <details className="mt-3 rounded-md border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Visa diagrammet som tabell
        </summary>
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full text-sm">
            <caption className="py-2 text-left text-muted-foreground">
              {title}, miljarder kronor
            </caption>
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-1 pr-2 font-medium">
                  År
                </th>
                {lines.map((l) => (
                  <th key={l.name} scope="col" className="px-2 py-1 text-right font-medium">
                    {l.name}
                  </th>
                ))}
                {extra.map((c) => (
                  <th key={c.label} scope="col" className="py-1 pl-2 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((year, i) => (
                <tr key={year} className="border-b border-border/50">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    {year}
                    {lines.some((l) => l.points[i].preliminary && l.points[i].value !== null)
                      ? ' (preliminärt)'
                      : ''}
                  </th>
                  {lines.map((l) => (
                    <td
                      key={l.name}
                      className="px-2 py-1 text-right tabular-nums whitespace-nowrap"
                    >
                      {mdkrNumber(l.points[i].value)}
                    </td>
                  ))}
                  {extra.map((c) => (
                    <td
                      key={c.label}
                      className="py-1 pl-2 text-right tabular-nums whitespace-nowrap"
                    >
                      {c.cells[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {tableNote && <p className="mt-2 text-sm text-muted-foreground">{tableNote}</p>}
        </div>
      </details>
    </figure>
  );
}

function Marker({
  shape,
  cx,
  cy,
  open,
  faded,
}: {
  shape: 'circle' | 'square';
  cx: number;
  cy: number;
  open: boolean;
  faded?: boolean;
}) {
  const common = {
    stroke: 'currentColor',
    strokeWidth: 1.5,
    fill: open ? 'var(--color-background)' : 'currentColor',
    opacity: faded ? 0.65 : 1,
  };
  return shape === 'circle' ? (
    <circle cx={cx} cy={cy} r={3.5} {...common} />
  ) : (
    <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} {...common} />
  );
}
