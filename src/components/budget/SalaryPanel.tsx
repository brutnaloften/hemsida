import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { clearSalary, loadSalary, saveSalary } from '@/lib/budget/salary-storage';
import {
  fallbackNotice,
  formatPart,
  formatTotal,
  krWords,
  maxVatPercent,
  type Estimate,
  type SalaryInputs,
} from '@/lib/budget/salary-view';

/**
 * What the island keeps about the salary panel (P8). The inputs and the applied value are mirrored
 * to localStorage (see salary-storage.ts) by the island; `open` is never stored. Nothing here is
 * written to the URL or sessionStorage or sent anywhere.
 */
export type SalaryState = {
  open: boolean;
  inputs: SalaryInputs;
  /** The monthly salary the estimate was computed for; null until "Räkna". */
  applied: string | null;
};

export const INITIAL_SALARY_STATE: SalaryState = {
  open: false,
  inputs: { monthly: '', consumption: '85', vat: '11,4' },
  applied: null,
};

/**
 * The salary state, mirrored to localStorage. The stored value is read after mount (so the server
 * HTML and the first client render match) and every change is written back; Rensa removes it. The
 * panel closes whenever `navKey` changes (drill, year change), and starts closed on every page load.
 */
export function usePersistedSalary(navKey: string) {
  const [state, setState] = useState<SalaryState>(INITIAL_SALARY_STATE);
  const loaded = useRef(false);
  useEffect(() => {
    const s = loadSalary();
    if (s) {
      const { applied, ...inputs } = s;
      setState((prev) => ({ ...prev, inputs, applied }));
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    if (state.applied === null && state.inputs.monthly.trim() === '') clearSalary();
    else saveSalary({ ...state.inputs, applied: state.applied });
  }, [state.inputs, state.applied]);
  useEffect(() => {
    setState((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, [navKey]);
  return [state, setState] as const;
}

type Props = {
  state: SalaryState;
  onChange: (next: SalaryState) => void;
  /** The estimate for the year on screen, or null when none is applied or the input is invalid. */
  estimate: Estimate | null;
  year: number;
};

const FIELD =
  'h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring';

/**
 * The disclosure button "Vad betalar jag?" and its panel (P8). Rendered inside the controls row:
 * the panel takes the full width of the row, under the other controls, so the treemap stays visible.
 */
export function SalaryPanel({ state, onChange, estimate, year }: Props) {
  const id = useId();
  const panelId = `${id}-panel`;
  const { open, inputs, applied } = state;
  const set = (patch: Partial<SalaryInputs>) =>
    onChange({ ...state, inputs: { ...inputs, ...patch } });
  const apply = () =>
    onChange({ ...state, applied: inputs.monthly.trim() === '' ? null : inputs.monthly });
  const clear = () => onChange({ ...state, inputs: { ...inputs, monthly: '' }, applied: null });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply();
  };
  const maxVat = String(Math.floor(maxVatPercent(year) * 10) / 10).replace('.', ',');
  const b = estimate?.breakdown;
  const fallback = b ? fallbackNotice(b) : null;
  const total = b ? b.total : 0;
  const headline = b
    ? total < 50
      ? `Din del av statens budget är ungefär 0 kronor per år (uppskattning för ${year}): avdragen är lika stora som det du betalar in.`
      : `Ungefär ${formatTotal(total)} per år av det du och din arbetsgivare betalar går till statens budget (uppskattning för ${year}).`
    : '';
  const invalidSalary = applied !== null && !estimate;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onChange({ ...state, open: !open })}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
      >
        Vad betalar jag?
      </button>
      <div id={panelId} hidden={!open} className="basis-full rounded-md border p-4">
        <h2 className="text-base font-semibold">Vad betalar jag till staten?</h2>
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-monthly`} className="text-sm font-medium">
              Månadslön före skatt
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${id}-monthly`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={inputs.monthly}
                onChange={(e) => set({ monthly: e.target.value })}
                onBlur={apply}
                aria-invalid={invalidSalary}
                aria-describedby={invalidSalary ? `${id}-error` : undefined}
                placeholder="35 000"
                className={`${FIELD} w-32`}
              />
              <span className="text-sm">kr</span>
            </div>
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Räkna
          </button>
        </form>
        {invalidSalary && (
          <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive">
            Skriv lönen som ett tal, till exempel 35 000.
          </p>
        )}

        <div role="status" aria-live="polite" aria-atomic="true">
          {b && (
            <>
              <p className="mt-4 max-w-prose">{headline}</p>
              {fallback && <p className="mt-1 text-sm text-muted-foreground">{fallback}</p>}
              <dl className="mt-3 max-w-md divide-y text-sm">
                {b.components.map((c) => (
                  <div key={c.id} className="flex justify-between gap-4 py-1.5">
                    <dt>
                      {c.amount < 0 ? '– ' : ''}
                      {c.label}
                    </dt>
                    <dd className="tabular-nums whitespace-nowrap">
                      <span className="sr-only">{krWords(Math.abs(c.amount))}</span>
                      <span aria-hidden="true">{formatPart(Math.abs(c.amount))}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            Ändra antaganden
          </summary>
          <div className="mt-2 flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${id}-consumption`}>
                Andel av lönen efter skatt som du handlar för
              </label>
              <input
                id={`${id}-consumption`}
                type="text"
                inputMode="decimal"
                value={inputs.consumption}
                onChange={(e) => set({ consumption: e.target.value })}
                aria-invalid={estimate?.invalid.consumption ?? false}
                className={`${FIELD} w-20`}
              />
              <span>%</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${id}-vat`}>Genomsnittlig moms på det du handlar</label>
              <input
                id={`${id}-vat`}
                type="text"
                inputMode="decimal"
                value={inputs.vat}
                onChange={(e) => set({ vat: e.target.value })}
                aria-invalid={estimate?.invalid.vat ?? false}
                className={`${FIELD} w-20`}
              />
              <span>%</span>
            </div>
            {estimate && (estimate.invalid.consumption || estimate.invalid.vat) && (
              <p className="max-w-prose text-muted-foreground">
                Ett antagande är utanför det som går att räkna med (andelen 0 till 100 procent,
                momsen 0 till {maxVat} procent), så standardvärdet används för det.
              </p>
            )}
            <p className="max-w-prose text-muted-foreground">
              Båda är antaganden, inte officiella siffror. Standardvärdena är 85 procent och 11,4
              procent i genomsnitt.
            </p>
          </div>
        </details>

        <h3 className="mt-4 text-sm font-semibold">Så räknar vi</h3>
        <p className="mt-1 max-w-prose text-sm">
          Det här är en grov uppskattning, inte din faktiska skatt. Den bygger på skattereglerna för{' '}
          {b ? b.paramsYear : year} och antagandena ovan. Kommunalskatten räknas inte med, eftersom
          den går till kommunen och regionen, inte till staten. Beloppen i rutorna visar hur din del
          skulle fördelas om den följde samma proportioner som statens utgifter. Uppgiften sparas
          bara i din webbläsare på den här enheten och skickas aldrig någonstans. Knappen Rensa tar
          bort den.
        </p>
        <p className="mt-2 max-w-prose text-sm">
          Av arbetsgivaravgifterna räknas bara statens del med, inte pensionsdelen som går till
          AP-fonderna. Jobbskatteavdraget dras av, eftersom staten betalar tillbaka det till
          kommunerna.
        </p>

        <button
          type="button"
          onClick={clear}
          className="mt-3 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
        >
          Rensa
        </button>
      </div>
    </>
  );
}
