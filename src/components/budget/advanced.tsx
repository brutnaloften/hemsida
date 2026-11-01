import type { ReactNode } from 'react';
import { AdvancedSwitch, PriceToggle } from '@/components/budget/PriceToggle';
import { TimeSeriesChart } from '@/components/budget/TimeSeriesChart';
import type { Advanced, TableColumn } from '@/components/budget/types';
import { formatPercent } from '@/lib/budget/format';
import {
  bnpShares,
  lastBnpYear,
  mdkrNumber,
  pointsOf,
  priced,
  type AdvancedFile,
  type Line,
  type YearSeries,
} from '@/lib/budget/series';

type Input = {
  /** The data of advanced.json, or null while it loads or after it failed. */
  file: AdvancedFile | null;
  failed: boolean;
  on: boolean;
  fasta: boolean;
  year: number;
  /** Latest year with data: the price level of "fasta priser". */
  latest: number;
  onAdvanced: (on: boolean) => void;
  onFasta: (fasta: boolean) => void;
  /** The node on screen, or null on the balance view. */
  nodeId: string | null;
  nodeName: string;
  /** The side of the page; the balance view shows both. */
  side: 'utgifter' | 'inkomster' | 'both';
  /** Row of a node id in advanced.json. */
  rowOf: (id: string) => number | undefined;
  /** The node the table total belongs to, or null when the table has none. */
  totalId: string | null;
};

const isSpending = (id: string): boolean => /^(uo:|anslag:|root:utgifter)/.test(id);

const sum = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/** Budget including ändringsbudgetar: the line the outcome is compared with. */
function totalBudget(budget: YearSeries | null, andrad: YearSeries | null): YearSeries | null {
  if (!budget) return null;
  return budget.map((v, i) => sum(v, andrad?.[i] ?? null));
}

/** The table columns of advanced mode for the year on screen (P10). */
export function advancedColumns(
  file: AdvancedFile,
  rowOf: Input['rowOf'],
  year: number,
  fasta: boolean,
  side: Input['side'],
  totalId: string | null,
): TableColumn[] {
  const yi = file.years.indexOf(year);
  const latest = file.years[file.years.length - 1];
  const fmt = (v: number | null) => mdkrNumber(priced(v, fasta, file.kpi, year, latest));
  const get = (id: string) => {
    const row = rowOf(id);
    if (row === undefined || yi < 0) return undefined;
    const budget = file.budget[row]?.[yi] ?? null;
    const andrad = file.andrad[row]?.[yi] ?? null;
    return { budget, andrad, utfall: file.utfall[row][yi] };
  };
  const unit = fasta ? ', fasta priser' : '';
  const columns: TableColumn[] = [
    {
      label: `Statens budget${unit}`,
      cell: (n) => fmt(get(n.id)?.budget ?? null),
    },
  ];
  if (side !== 'inkomster') {
    columns.push({ label: `Ändringsbudgetar${unit}`, cell: (n) => fmt(get(n.id)?.andrad ?? null) });
  }
  columns.push({ label: `Utfall${unit}`, cell: (n) => fmt(get(n.id)?.utfall ?? null) });
  if (side !== 'inkomster') {
    columns.push({
      label: `Skillnad mot budget${unit}`,
      cell: (n) => {
        const g = get(n.id);
        // Only spending has ändringsbudgetar; a row without a budget has nothing to compare with.
        if (!g || g.budget === null || g.utfall === null || !isSpending(n.id)) return '–';
        return fmt(g.utfall - g.budget - (g.andrad ?? 0));
      },
    });
  }
  if (totalId) {
    const g = get(totalId);
    if (g) {
      columns[0].total = fmt(g.budget);
      let i = 1;
      if (side !== 'inkomster') columns[i++].total = fmt(g.andrad);
      columns[i++].total = fmt(g.utfall);
      if (side !== 'inkomster') {
        columns[i].total =
          g.budget === null || g.utfall === null ? '–' : fmt(g.utfall - g.budget - (g.andrad ?? 0));
      }
    }
  }
  return columns;
}

/** Everything the views need of advanced mode (P10); `on: false` gives only the switch. */
export function buildAdvanced(i: Input): Advanced {
  const controls: ReactNode = (
    <>
      <AdvancedSwitch on={i.on} onChange={i.onAdvanced} />
      {i.on && <PriceToggle fasta={i.fasta} latest={i.latest} onChange={i.onFasta} />}
    </>
  );
  if (!i.on) {
    return { on: false, controls, header: null, chart: null, columns: [], code: () => null };
  }
  if (!i.file) {
    return {
      on: true,
      controls,
      header: null,
      chart: i.failed ? (
        <p role="alert" className="mt-6 rounded-md border border-destructive px-3 py-2 text-sm">
          Det gick inte att hämta tidsserierna. Stäng av avancerat läge och försök igen.
        </p>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Hämtar tidsserier …</p>
      ),
      columns: [],
      code: () => null,
    };
  }
  const file = i.file;
  const priceNote = i.fasta
    ? `Fasta priser: belopp för tidigare år är omräknade till ${i.latest} års penningvärde med konsumentprisindex (SCB).`
    : 'Löpande priser: beloppen är de som gällde det året, utan omräkning för prisökningar.';

  let chart: ReactNode;
  let header: ReactNode = null;
  if (i.nodeId === null) {
    const lines: Line[] = [
      {
        name: 'Utgifter',
        marker: 'circle',
        points: pointsOf(file, file.totals.utgifter, 'utgifter', i.fasta),
      },
      {
        name: 'Inkomster',
        marker: 'square',
        points: pointsOf(file, file.totals.inkomster, 'inkomster', i.fasta),
      },
    ];
    const last = lastBnpYear(file);
    const missing = last === null ? null : file.years.find((y) => y > last);
    const share = (series: number[]) =>
      bnpShares(file, series).map((v) => (v === null ? '–' : formatPercent(v)));
    chart = (
      <TimeSeriesChart
        title="Statens utgifter och inkomster över tid"
        governments={file.governments}
        lines={lines}
        note={priceNote}
        extra={[
          { label: 'Utgifter, andel av BNP', cells: share(file.totals.utgifter) },
          { label: 'Inkomster, andel av BNP', cells: share(file.totals.inkomster) },
        ]}
        tableNote={`Andel av BNP visas till och med ${last ?? 'senaste året med BNP'}.${
          missing ? ` BNP för ${missing} är inte publicerad ännu.` : ''
        } Andelen räknas på löpande priser.`}
      />
    );
  } else {
    const row = i.rowOf(i.nodeId);
    const code = row === undefined ? null : file.codes[row];
    if (code) header = <p className="mt-1 text-sm text-muted-foreground">Kod: {code}</p>;
    if (row !== undefined) {
      const side = i.side === 'inkomster' ? 'inkomster' : 'utgifter';
      const budget = totalBudget(file.budget[row], file.andrad[row]);
      const lines: Line[] = [
        {
          name: 'Utfall',
          marker: 'circle',
          points: pointsOf(file, file.utfall[row], side, i.fasta),
        },
      ];
      if (budget && budget.some((v) => v !== null)) {
        lines.push({
          name: side === 'utgifter' ? 'Budget inklusive ändringsbudgetar' : 'Budget',
          marker: 'square',
          dashed: true,
          points: pointsOf(file, budget, side, i.fasta),
        });
      }
      chart = (
        <TimeSeriesChart
          title={`${i.nodeName} över tid`}
          governments={file.governments}
          lines={lines}
          note={priceNote}
          tableNote={
            lines.length > 1 ? undefined : 'Budgeten för den här posten finns inte i underlaget.'
          }
        />
      );
    }
  }
  return {
    on: true,
    controls,
    header,
    chart,
    columns: advancedColumns(file, i.rowOf, i.year, i.fasta, i.side, i.totalId),
    code: (n) => {
      const row = i.rowOf(n.id);
      return row === undefined ? null : file.codes[row];
    },
  };
}
