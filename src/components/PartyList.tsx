import { useMemo, useState } from 'react';
import { AgreementBadge } from '@/components/ui/agreement-badge';
import { Input } from '@/components/ui/input';
import { VerdictBadge } from '@/components/ui/verdict-badge';
import {
  filterPartyRows,
  groupRows,
  limitGroups,
  type PartyFilter,
  type PartyRow,
} from '@/lib/party-page';
import { toggleValue } from '@/lib/lofter-filter';
import {
  AGREEMENT_OUTCOMES,
  AGREEMENT_OUTCOME_PHRASES,
  VERDICTS,
  VERDICT_LABELS,
} from '@/schema/promise';

const PAGE_SIZE = 50;

interface Props {
  rows: PartyRow[];
  areas: string[];
  /** The agreement the party stands behind, only when the term has one. */
  agreement?: { shortTitle?: string; title: string };
}

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function CheckGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: { value: T; label: string; count: number }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="space-y-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-accent"
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--foreground)]"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
            />
            <span className="flex-1">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const EMPTY: PartyFilter = { q: '', verdicts: [], outcomes: [], area: '' };

export default function PartyList({ rows, areas, agreement }: Props) {
  const [filter, setFilter] = useState<PartyFilter>(EMPTY);
  const [shown, setShown] = useState(PAGE_SIZE);
  const update = (patch: Partial<PartyFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setShown(PAGE_SIZE);
  };

  const matched = useMemo(() => filterPartyRows(rows, filter), [rows, filter]);
  const groups = useMemo(() => limitGroups(groupRows(matched), shown), [matched, shown]);

  const counts = useMemo(() => {
    const verdict = new Map<string, number>();
    const outcome = new Map<string, number>();
    for (const r of rows) {
      verdict.set(r.verdict, (verdict.get(r.verdict) ?? 0) + 1);
      if (r.outcome) outcome.set(r.outcome, (outcome.get(r.outcome) ?? 0) + 1);
    }
    return { verdict, outcome };
  }, [rows]);

  const verdictOptions = VERDICTS.filter((v) => counts.verdict.has(v)).map((v) => ({
    value: v,
    label: VERDICT_LABELS[v],
    count: counts.verdict.get(v) ?? 0,
  }));
  const outcomeOptions = AGREEMENT_OUTCOMES.filter((o) => counts.outcome.has(o)).map((o) => ({
    value: o,
    label: agreement
      ? `${AGREEMENT_OUTCOME_PHRASES[o]} ${agreement.shortTitle ?? agreement.title}`
      : o,
    count: counts.outcome.get(o) ?? 0,
  }));
  const active =
    filter.q.trim() !== '' ||
    filter.area !== '' ||
    filter.verdicts.length > 0 ||
    filter.outcomes.length > 0;
  const shownCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
      <form
        role="search"
        aria-label="Filtrera partiets löften"
        className="space-y-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label htmlFor="party-q" className="mb-1 block text-sm font-semibold">
            Sök i titlar
          </label>
          <Input
            id="party-q"
            type="search"
            value={filter.q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        <CheckGroup
          legend="Bedömning"
          options={verdictOptions}
          selected={filter.verdicts}
          onToggle={(v) => update({ verdicts: toggleValue(filter.verdicts, v) })}
        />
        {agreement && outcomeOptions.length > 0 && (
          <CheckGroup
            legend={`I ${agreement.shortTitle ?? agreement.title}`}
            options={outcomeOptions}
            selected={filter.outcomes}
            onToggle={(v) => update({ outcomes: toggleValue(filter.outcomes, v) })}
          />
        )}
        <div>
          <label htmlFor="party-area" className="mb-1 block text-sm font-semibold">
            Område
          </label>
          <select
            id="party-area"
            className={selectClass}
            value={filter.area}
            onChange={(e) => update({ area: e.target.value })}
          >
            <option value="">Alla områden</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {active && (
          <button
            type="button"
            className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            onClick={() => {
              setFilter(EMPTY);
              setShown(PAGE_SIZE);
            }}
          >
            Rensa filter
          </button>
        )}
      </form>

      <div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {active ? `${matched.length} av ${rows.length} löften` : `${rows.length} löften`}
        </p>
        {groups.map((g) => (
          <section key={g.area ?? 'other'} className="mt-5">
            <h3 className="mb-2 text-base font-semibold">{g.area ?? 'Övriga utfästelser'}</h3>
            {g.area === null && (
              <p className="mb-2 text-sm text-muted-foreground">
                Utfästelser som partiet gjort utanför valmanifestet.
              </p>
            )}
            <ul className="divide-y rounded-md border">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <a
                    href={r.href}
                    className="flex min-h-11 flex-col gap-2 px-3 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{r.title}</span>
                      {r.page !== undefined && (
                        <span className="block text-xs text-muted-foreground">s. {r.page}</span>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-2 sm:justify-end">
                      {agreement && r.outcome && (
                        <AgreementBadge outcome={r.outcome} source={agreement} />
                      )}
                      <VerdictBadge verdict={r.verdict} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {matched.length === 0 && (
          <p className="mt-4 rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
            Inga löften matchar filtren.
          </p>
        )}
        {shownCount < matched.length && (
          <button
            type="button"
            className="mt-4 h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            Visa fler ({matched.length - shownCount} kvar)
          </button>
        )}
      </div>
    </div>
  );
}
